import {
  opportunityService,
} from "../../../arbitrage/services/OpportunityService";

import {
  getExchangeTakerFeePercent,
} from "../../../arbitrage/config/fees";

import {
  exchangeCapabilityService,
} from "../../capabilities/services/ExchangeCapabilityService";

import {
  liveExecutionService,
} from "../LiveExecutionService";

import {
  strategyOneLiveVenueContractRegistry,
} from "../contracts/StrategyOneLiveVenueContractRegistry";

import {
  strategyOneTwoLegLiveExecutionService,
} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";

import {
  executionRecoveryEngine,
} from "../recovery/ExecutionRecoveryEngine";

import {
  strategyOnePilotPreflightService,
} from "../tiny-live/StrategyOnePilotPreflightService";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  personalBotRuntimeControlService,
} from "../../../strategies/services/PersonalBotRuntimeControlService";

import {
  strategyOneCanonicalLivePreflightService,
  type StrategyOneCanonicalPreflightReport,
} from "./StrategyOneCanonicalLivePreflightService";

import {
  strategyOneDynamicExecutionDecisionManager,
  type StrategyOneDynamicCandidate,
  type StrategyOneDynamicDecisionReport,
} from "./StrategyOneDynamicExecutionDecisionManager";

import {
  DEFAULT_STRATEGY_ONE_MAXIMUM_BOOK_AGE_MS,
  DEFAULT_STRATEGY_ONE_MAXIMUM_BOOK_SKEW_MS,
  getStrategyOneTinyLiveDailyAttemptCap,
  getTinyLiveMinimumNetProfitPercent,
} from "../tiny-live/StrategyOneControlledLiveConfiguration";

import {
  strategyOneExecutionFunnelMeter,
} from "./StrategyOneExecutionFunnelMeter";

export interface StrategyOneControlledLiveRuntimeReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly state:
    | "NO_CURRENT_OPPORTUNITY"
    | "BLOCKED_CURRENT_EVIDENCE"
    | "DYNAMIC_RECOMMENDATION_AVAILABLE";
  readonly opportunityId: string | null;
  readonly candidate: StrategyOneDynamicCandidate | null;
  readonly recommendation: StrategyOneDynamicDecisionReport | null;
  readonly blockers: readonly string[];
  readonly liveOrderAuthorityGranted: false;
  readonly orderSubmitted: false;
}

export class StrategyOneControlledLiveRuntimeService {
  getRecommendation(
    now = Date.now(),
  ): StrategyOneControlledLiveRuntimeReport {
    const preview =
      strategyOnePilotPreflightService
        .getPreview(
          now,
        );
    const selected =
      preview.selected;

    if (!selected) {
      return this.report(
        now,
        "NO_CURRENT_OPPORTUNITY",
        null,
        null,
        null,
        preview.blockers,
      );
    }

    const opportunity =
      opportunityService
        .getOpportunityById(
          selected.opportunityId,
        );

    if (!opportunity) {
      return this.report(
        now,
        "NO_CURRENT_OPPORTUNITY",
        selected.opportunityId,
        null,
        null,
        [
          "The selected current opportunity expired before dynamic evaluation.",
        ],
      );
    }

    const funding =
      selected.funding;
    const stress =
      selected.stress;
    const normalization =
      funding.quantityNormalization;
    const buyCapability =
      exchangeCapabilityService
        .getCachedCapability(
          selected.buyExchange,
          selected.market,
          "spot",
        );
    const sellCapability =
      exchangeCapabilityService
        .getCachedCapability(
          selected.sellExchange,
          selected.market,
          "spot",
        );
    const buyLeg =
      normalization?.legs.find(
        (leg) =>
          leg.exchange ===
          selected.buyExchange,
      );
    const sellLeg =
      normalization?.legs.find(
        (leg) =>
          leg.exchange ===
          selected.sellExchange,
      );
    const buyFeePercent =
      getExchangeTakerFeePercent(
        selected.buyExchange,
        selected.market,
        now,
      );
    const sellFeePercent =
      getExchangeTakerFeePercent(
        selected.sellExchange,
        selected.market,
        now,
      );
    const blockers:
      string[] = [];

    if (
      !stress ||
      stress.status !== "PASSED" ||
      stress.buyVwap === null ||
      stress.sellVwap === null ||
      stress.buyLimitPrice === null ||
      stress.sellLimitPrice === null ||
      stress.buyBookTimestamp === null ||
      stress.sellBookTimestamp === null
    ) {
      blockers.push(
        "Current exact-quantity two-leg stress/depth evidence is unavailable.",
      );
    }

    if (
      funding.capitalQuantity === null ||
      funding.executableQuantity === null ||
      funding.convertedQuoteCapital === null ||
      funding.buyFunding.availableBalance === null ||
      funding.sellFunding.availableBalance === null
    ) {
      blockers.push(
        "Current exact prefunded quantity and balance evidence is unavailable.",
      );
    }

    if (
      !normalization?.liveOrderSafe ||
      normalization.commonQuantityIncrement === null ||
      !buyLeg ||
      !sellLeg ||
      buyLeg.minimumNotional === null ||
      sellLeg.minimumNotional === null
    ) {
      blockers.push(
        "Current shared quantity increment and minimum-notional evidence is unavailable.",
      );
    }

    const buyTick =
      priceIncrement(
        buyCapability?.price.priceStep ??
          null,
        buyCapability?.price.pricePrecision ??
          null,
      );
    const sellTick =
      priceIncrement(
        sellCapability?.price.priceStep ??
          null,
        sellCapability?.price.pricePrecision ??
          null,
      );

    if (
      !buyCapability ||
      !sellCapability ||
      buyTick === null ||
      sellTick === null
    ) {
      blockers.push(
        "Fresh two-leg SPOT price-rule evidence is unavailable.",
      );
    }

    if (
      buyFeePercent === null ||
      sellFeePercent === null
    ) {
      blockers.push(
        "Current two-leg taker-fee evidence is unavailable.",
      );
    }

    if (blockers.length > 0) {
      return this.report(
        now,
        "BLOCKED_CURRENT_EVIDENCE",
        selected.opportunityId,
        null,
        null,
        blockers,
      );
    }

    if (
      !stress ||
      stress.buyVwap === null ||
      stress.sellVwap === null ||
      stress.buyLimitPrice === null ||
      stress.sellLimitPrice === null ||
      stress.buyBookTimestamp === null ||
      stress.sellBookTimestamp === null ||
      funding.capitalQuantity === null ||
      funding.executableQuantity === null ||
      funding.convertedQuoteCapital === null ||
      funding.buyFunding.availableBalance === null ||
      funding.sellFunding.availableBalance === null ||
      !normalization ||
      normalization.commonQuantityIncrement === null ||
      !buyLeg ||
      !sellLeg ||
      buyLeg.minimumNotional === null ||
      sellLeg.minimumNotional === null ||
      !buyCapability ||
      !sellCapability ||
      buyTick === null ||
      sellTick === null ||
      buyFeePercent === null ||
      sellFeePercent === null
    ) {
      throw new Error(
        "Controlled-live candidate narrowing failed closed.",
      );
    }

    const buyStatus =
      liveExecutionService
        .getExchangeStatus(
          selected.buyExchange,
        );
    const sellStatus =
      liveExecutionService
        .getExchangeStatus(
          selected.sellExchange,
        );
    const route = {
      market:
        selected.market,
      buyExchange:
        selected.buyExchange,
      sellExchange:
        selected.sellExchange,
    };
    const contracts = [
      strategyOneLiveVenueContractRegistry
        .getOrderTimeSafetyContract(
          selected.buyExchange,
          route,
          now,
        ),
      strategyOneLiveVenueContractRegistry
        .getOrderTimeSafetyContract(
          selected.sellExchange,
          route,
          now,
        ),
    ];
    const recovery =
      executionRecoveryEngine
        .getDiagnostics();
    const pair =
      strategyOneTwoLegLiveExecutionService
        .getDiagnostics(
          now,
        );
    const account =
      tradingAccountService
        .getAccount();
    const activeAttempts =
      pair.inFlight +
      Number(
        (pair.states.PREPARED ?? 0) +
        (pair.states.DISPATCHING ?? 0) +
        (pair.states.RECOVERY_REQUIRED ?? 0) +
        (pair.states.POSSIBLE_EXPOSURE ?? 0) >
        0,
      );

    const candidate:
      StrategyOneDynamicCandidate = {
      opportunityId:
        selected.opportunityId,
      market:
        selected.market,
      buyExchange:
        selected.buyExchange,
      sellExchange:
        selected.sellExchange,
      requestedCapitalInr:
        preview.requestedCapitalPerLegInr,
      requestedQuoteCapital:
        funding.convertedQuoteCapital,
      requestedQuantity:
        funding.capitalQuantity,
      buyBestBid:
        opportunity.pair.buy.bestBidPrice ??
        Number.NaN,
      buyBestAsk:
        opportunity.pair.buy.bestAskPrice ??
        Number.NaN,
      sellBestBid:
        opportunity.pair.sell.bestBidPrice ??
        Number.NaN,
      sellBestAsk:
        opportunity.pair.sell.bestAskPrice ??
        Number.NaN,
      buyVwap:
        stress.buyVwap,
      sellVwap:
        stress.sellVwap,
      buyOrderLimitPrice:
        stress.buyLimitPrice,
      sellOrderLimitPrice:
        stress.sellLimitPrice,
      buyDepthQuantity:
        opportunity.buyAvailableQty,
      sellDepthQuantity:
        opportunity.sellAvailableQty,
      buyBookTimestamp:
        stress.buyBookTimestamp,
      sellBookTimestamp:
        stress.sellBookTimestamp,
      now,
      maximumBookAgeMs:
        DEFAULT_STRATEGY_ONE_MAXIMUM_BOOK_AGE_MS,
      maximumTimestampSkewMs:
        DEFAULT_STRATEGY_ONE_MAXIMUM_BOOK_SKEW_MS,
      buyAvailableQuoteBalance:
        funding.buyFunding.availableBalance,
      sellAvailableBaseInventory:
        funding.sellFunding.availableBalance,
      buyMinimumNotional:
        buyLeg.minimumNotional,
      sellMinimumNotional:
        sellLeg.minimumNotional,
      buyPriceTickSize:
        buyTick,
      sellPriceTickSize:
        sellTick,
      quantityStepSize:
        normalization.commonQuantityIncrement,
      buyFeePercent,
      sellFeePercent,
      buySlippagePercent:
        0.02,
      sellSlippagePercent:
        0.02,
      safetyBufferPercent:
        0.05,
      minimumNetProfitPercent:
        getTinyLiveMinimumNetProfitPercent(),
      buyVenueReady:
        buyStatus.adapterConnected,
      sellVenueReady:
        sellStatus.adapterConnected,
      routeReady:
        selected.readyForOperatorPreflight,
      exchangeRulesFresh:
        capabilityFresh(
          buyCapability.synchronizedAt,
          now,
        ) &&
        capabilityFresh(
          sellCapability.synchronizedAt,
          now,
        ),
      spotPermissionsVerified:
        selected.checks.some(
          (check) =>
            check.key ===
              "API_KEY_PERMISSION_BOUNDARY" &&
            check.state ===
              "PASS",
        ),
      orderContractsReady:
        contracts.every(
          (contract) =>
            contract !== null &&
            contract.maximumOrderBookAgeMs !==
              null &&
            contract.supportedTimeInForce.some(
              (value) =>
                value === "IOC" ||
                value === "FOK",
            ) &&
            contract.authoritativeFillConfirmationReady,
        ),
      recoveryHealthy:
        recovery.openIncidents ===
          0 &&
        recovery.acknowledgedIncidents ===
          0,
      emergencyStop:
        account.emergencyStop,
      activeAttempts,
      attemptsToday:
        account.tradesToday,
      dailyAttemptCap:
        getStrategyOneTinyLiveDailyAttemptCap(),
      todayLossInr:
        account.todayLoss,
      dailyLossLimitInr:
        account.limits.maximumDailyLoss,
      recentRouteFailure:
        false,
    };
    const recommendation =
      strategyOneDynamicExecutionDecisionManager
        .evaluate(
          candidate,
        );

    return this.report(
      now,
      "DYNAMIC_RECOMMENDATION_AVAILABLE",
      selected.opportunityId,
      candidate,
      recommendation,
      recommendation.blockers,
    );
  }

  runCanonicalPreflight(
    opportunityIdValue: string,
    confirmationValue: string,
    now = Date.now(),
  ): StrategyOneCanonicalPreflightReport {
    if (
      confirmationValue.trim() !==
      "RUN_STRATEGY_ONE_CONTROLLED_PREFLIGHT_ONLY"
    ) {
      throw new Error(
        "Exact controlled-live preflight-only confirmation is required.",
      );
    }

    const runtime =
      this.getRecommendation(
        now,
      );

    if (
      !runtime.candidate ||
      runtime.opportunityId !==
        opportunityIdValue.trim()
    ) {
      throw new Error(
        "The exact current dynamic candidate is unavailable or changed.",
      );
    }

    const account =
      tradingAccountService
        .getAccount();
    const bot =
      personalBotRuntimeControlService
        .getControl();

    const report =
      strategyOneCanonicalLivePreflightService
      .run({
        candidate:
          runtime.candidate,
        liveRuntimeEnabled:
          liveRuntimeEnabled(),
        accountModeLive:
          account.mode ===
          "LIVE",
        personalStrategyOneBotEnabled:
          bot.enabled,
        operatorPreflightConfirmed:
          true,
      });

    strategyOneExecutionFunnelMeter
      .recordPreflight(
        runtime.candidate,
        report,
      );

    return report;
  }

  private report(
    generatedAt: number,
    state: StrategyOneControlledLiveRuntimeReport["state"],
    opportunityId: string | null,
    candidate: StrategyOneDynamicCandidate | null,
    recommendation: StrategyOneDynamicDecisionReport | null,
    blockers: readonly string[],
  ): StrategyOneControlledLiveRuntimeReport {
    const report =
      Object.freeze({
      schemaVersion:
        "1.0" as const,
      generatedAt,
      state,
      opportunityId,
      candidate,
      recommendation,
      blockers: [
        ...new Set(
          blockers,
        ),
      ],
      liveOrderAuthorityGranted:
        false as const,
      orderSubmitted:
        false as const,
      });

    if (
      candidate &&
      recommendation
    ) {
      strategyOneExecutionFunnelMeter
        .recordDynamic(
          candidate,
          recommendation,
        );
    } else if (
      blockers.length > 0
    ) {
      strategyOneExecutionFunnelMeter
        .recordCurrentEvidenceRejection(
          opportunityId,
          blockers,
          generatedAt,
        );
    }

    return report;
  }
}

function priceIncrement(
  step: number | null,
  precision: number | null,
): number | null {
  if (
    step !== null &&
    Number.isFinite(step) &&
    step > 0
  ) {
    return step;
  }

  if (
    precision !== null &&
    Number.isSafeInteger(precision) &&
    precision >= 0 &&
    precision <= 12
  ) {
    return 10 **
      -precision;
  }

  return null;
}

function capabilityFresh(
  synchronizedAt: number,
  now: number,
): boolean {
  const age =
    now -
    synchronizedAt;

  return (
    Number.isSafeInteger(
      synchronizedAt,
    ) &&
    age >= 0 &&
    age <= 60_000
  );
}

function liveRuntimeEnabled():
boolean {
  return (
    process.env.TRADING_MODE
      ?.trim()
      .toLowerCase() ===
      "live" &&
    process.env.LIVE_TRADING_ENABLED
      ?.trim()
      .toLowerCase() ===
      "true" &&
    process.env.ARBITRAGE_LIVE_CONFIRMATION
      ?.trim() ===
      "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME" &&
    process.env.STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION
      ?.trim() ===
      "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME"
  );
}

export const strategyOneControlledLiveRuntimeService =
  new StrategyOneControlledLiveRuntimeService();
