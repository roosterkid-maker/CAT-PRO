/*
 * Automated Capital Rebalancer - execution layer.
 *
 * This is the ONLY place in the codebase allowed to turn a rebalancing
 * proposal into a real Binance API call. Everything upstream of here
 * (RebalancingDecisionEngine, CapitalAllocationAndImbalanceService) stays
 * exactly as it was - read-only analysis, ANALYSIS_ONLY proposals. This
 * service consumes those proposals and, only for Binance today, actually
 * moves money:
 *
 *  - CROSS-EXCHANGE: RebalancingDecisionEngine.desiredMoves already tells us
 *    "move N USDT from exchange A to exchange B". For A === "binance" this
 *    service withdraws to a whitelisted address on B. There is currently no
 *    withdrawal client for Bybit or CoinDCX, so a proposal whose source is
 *    not Binance is skipped and logged, not attempted.
 *
 *  - SAME-EXCHANGE: RebalancingDecisionEngine does not cover this (it only
 *    reasons about cross-exchange spot imbalance). This service adds its
 *    own narrow decision: if Binance's USDS-M Futures available margin is
 *    below a floor and Spot has USDT to spare, move a bounded amount
 *    Spot -> Futures via Universal Transfer. This is the exact situation
 *    the operator hit by hand funding funding-arbitrage margin.
 *
 * Every real transfer, in both directions, is gated by:
 *   1. loadRebalancingExecutionConfig().enabled (master switch)
 *   2. the relevant phase flag (sameExchangeEnabled / crossExchangeEnabled)
 *   3. RebalancingExecutionCapTracker.reserve() - per-transfer + daily cap
 *   4. for cross-exchange only: findWhitelistedAddress() - refuse if the
 *      destination isn't on the operator's own whitelist
 * All four default to "refuse" - a misconfigured or freshly-deployed
 * instance moves nothing.
 */

import {
  binanceAccountApi,
} from "../../exchanges/binance/api/BinanceAccountApi";

import {
  binanceCapitalTransferApi,
} from "../../exchanges/binance/api/BinanceCapitalTransferApi";

import {
  binanceRebalancerCredentialsProvider,
} from "../../exchanges/binance/api/BinanceRebalancerCredentialsProvider";

import {
  binanceUsdMHttpClient,
} from "../../exchanges/binance/api/BinanceUsdMHttpClient";

import {
  binanceSigner,
} from "../../exchanges/binance/api/BinanceSigner";

import {
  findWhitelistedAddress,
  loadRebalancingExecutionConfig,
  type RebalancingExecutionConfig,
  type RebalancingExecutionExchange,
} from "./RebalancingExecutionConfig";

import {
  RebalancingExecutionCapTracker,
} from "./RebalancingExecutionCapTracker";

import type {
  RebalancingDecisionPlan,
  RebalancingRouteProposal,
} from "../services/RebalancingDecisionEngine";

import type {
  CapitalManagerSafetyContext,
} from "../services/CapitalManagerSafetyContextService";

import {
  bybitCapitalApi,
} from "../../exchanges/bybit/api/BybitCapitalApi";

const REBALANCE_ASSET = "USDT";

/* Receiving exchange as named in Bybit's Travel Rule VASP list (India accounts). */
const BYBIT_TRAVEL_RULE_VASP_NAMES: Readonly<Record<string, string>> = {
  binance: "Binance India",
  coindcx: "CoinDCX",
};

/* Dust below this stays in Bybit Funding (not worth a transfer call). */
const MINIMUM_SWEEP_UNITS = 1e-8;

/* Receiving exchange as named in Binance's Travel Rule VASP list. */
const TRAVEL_RULE_VASP_NAMES: Readonly<Record<string, string>> = {
  bybit: "Bybit",
  coindcx: "CoinDCX",
};

/**
 * Everything RebalancingExecutionService needs from a live exchange,
 * narrowed to exactly these four operations. Injectable so tests can supply
 * a fake instead of hitting real Binance endpoints - the default
 * implementation below is what actually runs in production.
 */
export interface RebalancingExchangeClient {
  withdraw(
    asset: string,
    amount: number,
    address: string,
    network: string,
    addressTag: string | null,
    /** Lets a Travel Rule account name the receiving exchange in its questionnaire. */
    destinationExchange?: RebalancingExecutionExchange,
  ): Promise<{referenceId: string}>;
  universalTransferSpotToFutures(asset: string, amount: number): Promise<{referenceId: string}>;
  getSpotAvailableBalance(asset: string): Promise<number>;
  getFuturesAvailableMargin(asset: string): Promise<number>;
}

class DefaultBinanceRebalancingExchangeClient implements RebalancingExchangeClient {
  private travelRuleCountry: {value: string | null; checkedAt: number} | null = null;
  private travelRuleVasps: readonly {vaspName: string; identifier: string}[] | null = null;

  async withdraw(
    asset: string,
    amount: number,
    address: string,
    network: string,
    addressTag: string | null,
    destinationExchange?: RebalancingExecutionExchange,
  ): Promise<{referenceId: string}> {
    const credentials = binanceRebalancerCredentialsProvider.getCredentials();

    // Travel Rule accounts (e.g. Binance India) must use the local-entity
    // endpoint with a questionnaire; the plain endpoint answers -4104.
    const now = Date.now();
    if (!this.travelRuleCountry || now - this.travelRuleCountry.checkedAt > 6 * 3_600_000) {
      this.travelRuleCountry = {value: await binanceCapitalTransferApi.getTravelRuleCountry(credentials), checkedAt: now};
    }

    if (this.travelRuleCountry.value === null) {
      const result = await binanceCapitalTransferApi.withdraw(
        {coin: asset, address, amount, network, addressTag: addressTag ?? undefined},
        credentials,
      );
      return {referenceId: result.withdrawId};
    }

    const destinationName = TRAVEL_RULE_VASP_NAMES[destinationExchange ?? ""] ?? destinationExchange ?? "others";
    this.travelRuleVasps ??= await binanceCapitalTransferApi.getTravelRuleVasps(credentials);
    const vasp = this.travelRuleVasps.find((entry) =>
      entry.vaspName.trim().toLowerCase().replace(/[^a-z0-9]/gu, "")
        .includes(destinationName.toLowerCase().replace(/[^a-z0-9]/gu, "")));

    // The rebalancer only withdraws to the operator's own whitelisted
    // account on another exchange: self-owned address, sent to a VASP.
    const questionnaire: Record<string, string | number> = vasp
      ? {isAddressOwner: 1, sendTo: 2, vasp: vasp.identifier}
      : {isAddressOwner: 1, sendTo: 2, vasp: "others", vaspName: destinationName};

    const result = await binanceCapitalTransferApi.withdrawLocalEntity(
      {coin: asset, address, amount, network, addressTag: addressTag ?? undefined, questionnaire},
      credentials,
    );
    return {referenceId: `travel-rule:${result.travelRuleId}`};
  }

  async universalTransferSpotToFutures(asset: string, amount: number): Promise<{referenceId: string}> {
    const result = await binanceCapitalTransferApi.universalTransfer(
      {type: "MAIN_UMFUTURE", asset, amount},
      binanceRebalancerCredentialsProvider.getCredentials(),
    );
    return {referenceId: result.transactionId};
  }

  async getSpotAvailableBalance(asset: string): Promise<number> {
    const credentials = binanceRebalancerCredentialsProvider.getCredentials();
    const balance = await binanceAccountApi.getBalance(asset, credentials);
    return balance?.availableBalance ?? 0;
  }

  /**
   * Deliberately does NOT reuse BinanceUsdMAccountReadProvider - that class
   * is hardwired to binanceUsdMCredentialsProvider (the read-only
   * derivatives-evidence key). Reading Futures margin here has to use the
   * rebalancer's own dedicated credentials, so this signs the request the
   * same way DefaultBinanceUsdMSignedGetPort does internally, but against
   * binanceRebalancerCredentialsProvider instead.
   */
  async getFuturesAvailableMargin(asset: string): Promise<number> {
    const credentials = binanceRebalancerCredentialsProvider.getCredentials();
    const time = await binanceUsdMHttpClient.getPublic<{serverTime?: unknown}>("/fapi/v1/time");
    const serverTimestamp = Number(time.serverTime);
    if (!Number.isFinite(serverTimestamp)) {
      throw new Error("Invalid Binance USD-M server time while reading Futures margin.");
    }

    const signed = binanceSigner.createSignedTimestampRequest(
      {},
      credentials.apiSecret,
      {timestamp: serverTimestamp, recvWindow: 5_000},
    );

    const balances = await binanceUsdMHttpClient.request<
      readonly {asset?: unknown; availableBalance?: unknown}[]
    >("GET", "/fapi/v3/balance", {
      parameters: signed.parameters,
      queryString: signed.signedQueryString,
      headers: {"X-MBX-APIKEY": credentials.apiKey},
    });

    if (!Array.isArray(balances)) {
      throw new Error("Invalid Binance USD-M balance response while reading Futures margin.");
    }

    const usdt = balances.find((entry) => entry.asset === asset);
    const available = Number(usdt?.availableBalance ?? 0);
    return Number.isFinite(available) && available >= 0 ? available : 0;
  }
}

/** The Bybit side of the capital manager: funding sweeps and USDT withdrawals. */
export interface BybitRebalancingClient {
  getFundBalances(): Promise<readonly {coin: string; transferable: number}[]>;
  transferFundToUnified(coin: string, amount: string): Promise<{transferId: string; status: string}>;
  findVaspEntityId(vaspName: string): Promise<string | null>;
  withdraw(request: {
    coin: string;
    chain: string;
    address: string;
    tag: string | null;
    amount: number;
    requestId: string;
    vaspEntityId: string | null;
    beneficiaryName: string;
  }): Promise<{id: string}>;
}

export type RebalancingMoveOutcomeStatus =
  | "EXECUTED"
  | "SKIPPED_DISABLED"
  | "SKIPPED_UNSUPPORTED_EXCHANGE"
  | "SKIPPED_NOT_WHITELISTED"
  | "SKIPPED_CAP_REJECTED"
  | "SKIPPED_SAFETY_BLOCKED"
  | "FAILED";

export interface RebalancingMoveOutcome {
  readonly kind: "SAME_EXCHANGE" | "CROSS_EXCHANGE";
  readonly exchange: RebalancingExecutionExchange;
  readonly destinationExchange: RebalancingExecutionExchange | null;
  readonly amountUsdt: number;
  readonly status: RebalancingMoveOutcomeStatus;
  readonly detail: string;
  readonly referenceId: string | null;
}

export interface SameExchangeMarginTopUpPolicy {
  /** If Futures available margin (USDT) drops below this, consider topping up. */
  readonly futuresMarginFloorUsdt: number;
  /** Never drain Spot below this - protects capital other strategies need. */
  readonly spotReserveFloorUsdt: number;
}

const DEFAULT_SAME_EXCHANGE_POLICY: SameExchangeMarginTopUpPolicy = {
  futuresMarginFloorUsdt: 20,
  spotReserveFloorUsdt: 20,
};

interface CapTrackerPair {
  readonly sameExchange: RebalancingExecutionCapTracker;
  readonly crossExchange: RebalancingExecutionCapTracker;
}

function buildCapTrackers(config: RebalancingExecutionConfig): CapTrackerPair {
  return {
    sameExchange: new RebalancingExecutionCapTracker(
      {
        maximumPerTransferUsdt: config.maximumPerTransferUsdt,
        maximumPerDayUsdt: config.maximumPerDaySameExchangeUsdt,
      },
      // logs/ is the host-mounted volume: daily caps must survive redeploys.
      "logs/live/rebalancing-same-exchange-cap.jsonl",
    ),
    crossExchange: new RebalancingExecutionCapTracker(
      {
        maximumPerTransferUsdt: config.maximumPerTransferUsdt,
        maximumPerDayUsdt: config.maximumPerDayCrossExchangeUsdt,
      },
      "logs/live/rebalancing-cross-exchange-cap.jsonl",
    ),
  };
}

export class RebalancingExecutionService {
  private readonly capTrackers: CapTrackerPair;

  constructor(
    private readonly config: RebalancingExecutionConfig = loadRebalancingExecutionConfig(),
    capTrackers: CapTrackerPair = buildCapTrackers(config),
    private readonly sameExchangePolicy: SameExchangeMarginTopUpPolicy = DEFAULT_SAME_EXCHANGE_POLICY,
    private readonly binanceClient: RebalancingExchangeClient = new DefaultBinanceRebalancingExchangeClient(),
    private readonly bybitClient: BybitRebalancingClient = bybitCapitalApi,
  ) {
    this.capTrackers = capTrackers;
  }

  /**
   * Deposits land in Bybit's Funding account, but the bot trades (and reads
   * balances) from the Unified account. Moves every transferable Funding
   * balance across; an internal transfer, so no cap applies.
   */
  async sweepBybitFundingToUnified(): Promise<readonly RebalancingMoveOutcome[]> {
    if (!this.config.enabled || !this.config.bybitFundingSweepEnabled) return [];
    const balances = await this.bybitClient.getFundBalances();
    const outcomes: RebalancingMoveOutcome[] = [];
    for (const balance of balances) {
      if (!(balance.transferable >= MINIMUM_SWEEP_UNITS)) continue;
      // Exact decimal string: never round up past what is transferable.
      const amount = floorDecimal(balance.transferable, 8);
      if (amount === "0") continue;
      try {
        const result = await this.bybitClient.transferFundToUnified(balance.coin, amount);
        const done = result.status === "SUCCESS" || result.status === "PENDING";
        outcomes.push(this.outcome("SAME_EXCHANGE", "bybit", null, balance.coin === REBALANCE_ASSET ? Number(amount) : 0,
          done ? "EXECUTED" : "FAILED",
          `${done ? "Moved" : "Could not move"} ${amount} ${balance.coin} Bybit Funding -> Unified (${result.status}).`,
          result.transferId));
      } catch (error: unknown) {
        outcomes.push(this.outcome("SAME_EXCHANGE", "bybit", null, 0, "FAILED",
          `Bybit Funding -> Unified for ${balance.coin} failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
    return outcomes;
  }

  /**
   * Bybit as a USDT source: withdraw to the operator's own whitelisted
   * account on another exchange, under the same master switch, phase flag,
   * per-transfer and daily cross-exchange caps as the Binance path.
   */
  async executeBybitWithdrawal(
    destination: string,
    amountUsdt: number,
    requestId: string,
  ): Promise<RebalancingMoveOutcome> {
    const destinationExchange = this.asKnownExchange(destination);
    const skip = (status: RebalancingMoveOutcomeStatus, detail: string) =>
      this.outcome("CROSS_EXCHANGE", "bybit", destinationExchange, amountUsdt, status, detail);

    if (!this.config.enabled || !this.config.crossExchangeEnabled || !this.config.bybitWithdrawEnabled) {
      return skip("SKIPPED_DISABLED", "Bybit withdrawals are disabled (CAT_PRO_REBALANCER_BYBIT_WITHDRAW_ENABLED).");
    }
    if (destinationExchange === null || destinationExchange === "bybit") {
      return skip("SKIPPED_UNSUPPORTED_EXCHANGE", `Bybit cannot withdraw to "${destination}".`);
    }
    const beneficiaryName = this.config.bybitTravelRuleBeneficiaryName ?? null;
    if (!beneficiaryName) {
      return skip("SKIPPED_DISABLED", "Bybit Travel Rule needs the account holder's KYC name: set CAT_PRO_BYBIT_TRAVEL_RULE_BENEFICIARY_NAME.");
    }
    const whitelisted = this.findAnyWhitelistedAddress(destinationExchange, REBALANCE_ASSET);
    if (!whitelisted) {
      return skip("SKIPPED_NOT_WHITELISTED",
        `No whitelisted ${REBALANCE_ASSET} deposit address configured for "${destinationExchange}" - refusing to withdraw anywhere the operator hasn't explicitly approved.`);
    }
    const capCheck = this.capTrackers.crossExchange.check(amountUsdt);
    if (!capCheck.allowed) {
      return skip("SKIPPED_CAP_REJECTED",
        `Cross-exchange cap rejected ${amountUsdt} USDT: ${capCheck.reason} (remaining today: ${capCheck.remainingDailyBudgetUsdt} USDT, per-transfer max: ${capCheck.maximumPerTransferUsdt} USDT).`);
    }

    try {
      const vaspName = BYBIT_TRAVEL_RULE_VASP_NAMES[destinationExchange] ?? destinationExchange;
      const vaspEntityId = await this.bybitClient.findVaspEntityId(vaspName);
      // Reserve BEFORE calling Bybit, like the Binance path.
      this.capTrackers.crossExchange.reserve(amountUsdt);
      const result = await this.bybitClient.withdraw({
        coin: REBALANCE_ASSET,
        chain: whitelisted.network,
        address: whitelisted.address,
        tag: whitelisted.addressTag,
        amount: amountUsdt,
        requestId,
        vaspEntityId,
        beneficiaryName,
      });
      return this.outcome("CROSS_EXCHANGE", "bybit", destinationExchange, amountUsdt, "EXECUTED",
        `Withdrew ${amountUsdt} ${REBALANCE_ASSET} from Bybit to whitelisted ${destinationExchange} address over ${whitelisted.network}.`,
        `bybit:${result.id}`);
    } catch (error: unknown) {
      return skip("FAILED", error instanceof Error ? error.message : "Bybit withdrawal failed.");
    }
  }

  /**
   * Phase 2: act on RebalancingDecisionEngine's cross-exchange proposals.
   * Read-only if config.enabled or config.crossExchangeEnabled is false -
   * every proposal comes back SKIPPED_DISABLED, nothing is called.
   */
  async executeCrossExchangeMoves(
    plan: RebalancingDecisionPlan,
  ): Promise<readonly RebalancingMoveOutcome[]> {
    const outcomes: RebalancingMoveOutcome[] = [];
    for (const proposal of plan.desiredMoves) {
      outcomes.push(await this.executeCrossExchangeMove(proposal));
    }
    return outcomes;
  }

  private async executeCrossExchangeMove(
    proposal: RebalancingRouteProposal,
  ): Promise<RebalancingMoveOutcome> {
    const destinationExchange = this.asKnownExchange(proposal.destinationExchange);

    if (!this.config.enabled || !this.config.crossExchangeEnabled) {
      return this.outcome(
        "CROSS_EXCHANGE",
        "binance",
        destinationExchange,
        proposal.amountUsdt,
        "SKIPPED_DISABLED",
        "Automated cross-exchange rebalancing is disabled (CAT_PRO_REBALANCER_ENABLED / CAT_PRO_REBALANCER_CROSS_EXCHANGE_ENABLED).",
      );
    }

    if (proposal.sourceExchange !== "binance" || destinationExchange === null) {
      return this.outcome(
        "CROSS_EXCHANGE",
        this.asKnownExchange(proposal.sourceExchange) ?? "binance",
        destinationExchange,
        proposal.amountUsdt,
        "SKIPPED_UNSUPPORTED_EXCHANGE",
        `No withdrawal client is wired up for source "${proposal.sourceExchange}" yet - only Binance-sourced cross-exchange moves execute today.`,
      );
    }

    const whitelisted = this.findAnyWhitelistedAddress(destinationExchange, REBALANCE_ASSET);
    if (!whitelisted) {
      return this.outcome(
        "CROSS_EXCHANGE",
        "binance",
        destinationExchange,
        proposal.amountUsdt,
        "SKIPPED_NOT_WHITELISTED",
        `No whitelisted ${REBALANCE_ASSET} deposit address configured for "${destinationExchange}" - refusing to withdraw anywhere the operator hasn't explicitly approved.`,
      );
    }

    const capCheck = this.capTrackers.crossExchange.check(proposal.amountUsdt);
    if (!capCheck.allowed) {
      return this.outcome(
        "CROSS_EXCHANGE",
        "binance",
        destinationExchange,
        proposal.amountUsdt,
        "SKIPPED_CAP_REJECTED",
        `Cross-exchange cap rejected ${proposal.amountUsdt} USDT: ${capCheck.reason} (remaining today: ${capCheck.remainingDailyBudgetUsdt} USDT, per-transfer max: ${capCheck.maximumPerTransferUsdt} USDT).`,
      );
    }

    try {
      // Reserve BEFORE calling Binance - see RebalancingExecutionCapTracker.reserve() docstring.
      this.capTrackers.crossExchange.reserve(proposal.amountUsdt);

      const result = await this.binanceClient.withdraw(
        REBALANCE_ASSET,
        proposal.amountUsdt,
        whitelisted.address,
        whitelisted.network,
        whitelisted.addressTag,
        destinationExchange,
      );

      return this.outcome(
        "CROSS_EXCHANGE",
        "binance",
        destinationExchange,
        proposal.amountUsdt,
        "EXECUTED",
        `Withdrew ${proposal.amountUsdt} ${REBALANCE_ASSET} from Binance to whitelisted ${destinationExchange} address over ${whitelisted.network}.`,
        result.referenceId,
      );
    } catch (error: unknown) {
      return this.outcome(
        "CROSS_EXCHANGE",
        "binance",
        destinationExchange,
        proposal.amountUsdt,
        "FAILED",
        error instanceof Error ? error.message : "Binance withdrawal failed.",
      );
    }
  }

  /**
   * Phase 1: Binance-only same-exchange margin top-up. Not driven by
   * RebalancingDecisionEngine (it doesn't reason about wallet-type splits) -
   * this is its own narrow, bounded decision: is Futures margin low and does
   * Spot have spare USDT? If so, move the smallest of (shortfall, spare
   * above reserve, per-transfer cap) from Spot to USDS-M Futures.
   */
  async executeSameExchangeTopUp(
    safetyContext?: CapitalManagerSafetyContext,
  ): Promise<RebalancingMoveOutcome> {
    if (!this.config.enabled || !this.config.sameExchangeEnabled) {
      return this.outcome(
        "SAME_EXCHANGE",
        "binance",
        null,
        0,
        "SKIPPED_DISABLED",
        "Automated same-exchange rebalancing is disabled (CAT_PRO_REBALANCER_ENABLED / CAT_PRO_REBALANCER_SAME_EXCHANGE_ENABLED).",
      );
    }

    if (
      !safetyContext ||
      safetyContext.executionRecoveryPending ||
      safetyContext.settlementReconciliationPending ||
      safetyContext.emergencyStopActive
    ) {
      return this.outcome(
        "SAME_EXCHANGE",
        "binance",
        null,
        0,
        "SKIPPED_SAFETY_BLOCKED",
        !safetyContext
          ? "Authoritative capital-manager safety context is missing; refusing transfer."
          : "Execution recovery, settlement reconciliation or emergency stop blocks capital movement.",
      );
    }

    const [spotBalance, futuresAvailableMargin] = await Promise.all([
      this.binanceClient.getSpotAvailableBalance(REBALANCE_ASSET),
      this.binanceClient.getFuturesAvailableMargin(REBALANCE_ASSET),
    ]);

    const shortfall = this.sameExchangePolicy.futuresMarginFloorUsdt - futuresAvailableMargin;
    if (shortfall <= 0) {
      return this.outcome(
        "SAME_EXCHANGE",
        "binance",
        null,
        0,
        "SKIPPED_DISABLED",
        `Futures available margin (${futuresAvailableMargin} USDT) is already at or above the floor (${this.sameExchangePolicy.futuresMarginFloorUsdt} USDT) - nothing to top up.`,
      );
    }

    const spareInSpot = spotBalance - this.sameExchangePolicy.spotReserveFloorUsdt;
    const amount = round2(Math.min(shortfall, Math.max(0, spareInSpot), this.config.maximumPerTransferUsdt));

    if (amount <= 0) {
      return this.outcome(
        "SAME_EXCHANGE",
        "binance",
        null,
        0,
        "SKIPPED_CAP_REJECTED",
        `Futures margin is short ${round2(shortfall)} USDT but Spot has no spare balance above its ${this.sameExchangePolicy.spotReserveFloorUsdt} USDT reserve floor (Spot balance: ${spotBalance} USDT).`,
      );
    }

    const capCheck = this.capTrackers.sameExchange.check(amount);
    if (!capCheck.allowed) {
      return this.outcome(
        "SAME_EXCHANGE",
        "binance",
        null,
        amount,
        "SKIPPED_CAP_REJECTED",
        `Same-exchange cap rejected ${amount} USDT: ${capCheck.reason} (remaining today: ${capCheck.remainingDailyBudgetUsdt} USDT, per-transfer max: ${capCheck.maximumPerTransferUsdt} USDT).`,
      );
    }

    try {
      this.capTrackers.sameExchange.reserve(amount);

      const result = await this.binanceClient.universalTransferSpotToFutures(REBALANCE_ASSET, amount);

      return this.outcome(
        "SAME_EXCHANGE",
        "binance",
        null,
        amount,
        "EXECUTED",
        `Transferred ${amount} ${REBALANCE_ASSET} Spot -> USDS-M Futures to cover a ${round2(shortfall)} USDT margin shortfall.`,
        result.referenceId,
      );
    } catch (error: unknown) {
      return this.outcome(
        "SAME_EXCHANGE",
        "binance",
        null,
        amount,
        "FAILED",
        error instanceof Error ? error.message : "Binance universal transfer failed.",
      );
    }
  }

  private findAnyWhitelistedAddress(
    exchange: RebalancingExecutionExchange,
    asset: string,
  ) {
    // The whitelist is keyed by (exchange, asset, network); the decision
    // engine's proposals don't carry a network. Take the operator's
    // configured entry for this (exchange, asset) - if there's more than
    // one network whitelisted for the same destination, that's ambiguous
    // configuration and this refuses rather than guessing.
    const candidates = this.config.withdrawalWhitelist.filter(
      (entry) => entry.exchange === exchange && entry.asset === asset.toUpperCase(),
    );
    if (candidates.length !== 1) return null;
    return findWhitelistedAddress(this.config, exchange, asset, candidates[0]!.network);
  }

  private asKnownExchange(value: string): RebalancingExecutionExchange | null {
    return value === "binance" || value === "bybit" || value === "coindcx" ? value : null;
  }

  private outcome(
    kind: RebalancingMoveOutcome["kind"],
    exchange: RebalancingExecutionExchange,
    destinationExchange: RebalancingExecutionExchange | null,
    amountUsdt: number,
    status: RebalancingMoveOutcomeStatus,
    detail: string,
    referenceId: string | null = null,
  ): RebalancingMoveOutcome {
    return {kind, exchange, destinationExchange, amountUsdt, status, detail, referenceId};
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function floorDecimal(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  // At worst leaves one smallest unit of dust behind; never exceeds `value`.
  const floored = Math.floor(value * factor) / factor;
  return floored.toFixed(decimals).replace(/\.?0+$/u, "") || "0";
}

export const rebalancingExecutionService = new RebalancingExecutionService();
