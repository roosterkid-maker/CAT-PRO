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

const REBALANCE_ASSET = "USDT";

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
  ): Promise<{referenceId: string}>;
  universalTransferSpotToFutures(asset: string, amount: number): Promise<{referenceId: string}>;
  getSpotAvailableBalance(asset: string): Promise<number>;
  getFuturesAvailableMargin(asset: string): Promise<number>;
}

class DefaultBinanceRebalancingExchangeClient implements RebalancingExchangeClient {
  async withdraw(
    asset: string,
    amount: number,
    address: string,
    network: string,
    addressTag: string | null,
  ): Promise<{referenceId: string}> {
    const result = await binanceCapitalTransferApi.withdraw(
      {coin: asset, address, amount, network, addressTag: addressTag ?? undefined},
      binanceRebalancerCredentialsProvider.getCredentials(),
    );
    return {referenceId: result.withdrawId};
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

export type RebalancingMoveOutcomeStatus =
  | "EXECUTED"
  | "SKIPPED_DISABLED"
  | "SKIPPED_UNSUPPORTED_EXCHANGE"
  | "SKIPPED_NOT_WHITELISTED"
  | "SKIPPED_CAP_REJECTED"
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
      "data/rebalancing/same-exchange-cap.jsonl",
    ),
    crossExchange: new RebalancingExecutionCapTracker(
      {
        maximumPerTransferUsdt: config.maximumPerTransferUsdt,
        maximumPerDayUsdt: config.maximumPerDayCrossExchangeUsdt,
      },
      "data/rebalancing/cross-exchange-cap.jsonl",
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
  ) {
    this.capTrackers = capTrackers;
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
  async executeSameExchangeTopUp(): Promise<RebalancingMoveOutcome> {
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

export const rebalancingExecutionService = new RebalancingExecutionService();
