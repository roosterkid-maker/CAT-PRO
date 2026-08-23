import type {
  CentralExecutionPattern,
  CentralStrategyExecutionLeg,
  CentralStrategyExecutionPlan,
  CentralStrategyRouteFamily,
  CentralStrategySettlementPolicy,
} from "../models/CentralStrategyExecutionPlan";
import type {StrategySignal} from "../models/StrategySignal";

const CENTRAL_PROMOTION_BLOCKERS = [
  "ACCOUNT_BALANCE_EVIDENCE_REQUIRED",
  "CAPITAL_RESERVATION_REQUIRED",
  "RISK_APPROVAL_REQUIRED",
  "CENTRAL_PAPER_ADAPTER_NOT_ADMITTED",
] as const;

interface Compilation {
  readonly family: CentralStrategyRouteFamily;
  readonly pattern: CentralExecutionPattern;
  readonly legs: readonly CentralStrategyExecutionLeg[];
  readonly modeledNetValue: number | null;
  readonly modeledNetValueUnit: CentralStrategyExecutionPlan["modeledNetValueUnit"];
  readonly blockers: readonly string[];
  readonly settlementPolicy: CentralStrategySettlementPolicy;
}

export class CentralStrategyExecutionPlanCompiler {
  compile(signal: StrategySignal, now = Date.now()): CentralStrategyExecutionPlan {
    if (signal.executionAuthorized !== false || signal.automaticExecutionAllowed !== false) {
      throw new Error("Central plan compiler accepts only non-executable strategy evidence.");
    }
    const sourceTimestamps = [
      signal.generatedAt,
      signal.observedAt,
      ...("sourceSnapshotGeneratedAt" in signal ? [signal.sourceSnapshotGeneratedAt] : []),
    ];
    if (!Number.isSafeInteger(now) || now <= 0 || !Number.isSafeInteger(signal.expiresAt) ||
        signal.expiresAt < now || sourceTimestamps.some((timestamp) =>
          !Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > now,
        )) {
      throw new Error("Central plan compiler requires a current non-expired signal.");
    }

    const compilation = compileSignal(signal);
    validateSettlementPolicy(compilation.settlementPolicy);
    const strategyOne = signal.kind === "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY";
    const blockers = strategyOne
      ? ["EXECUTION_REMAINS_OWNED_BY_EXISTING_STRATEGY_ONE_ORCHESTRATOR"]
      : unique([...compilation.blockers, ...CENTRAL_PROMOTION_BLOCKERS]);

    return deepFreeze({
      version: "35.0",
      id: `central-plan:${signal.id}`,
      strategyId: signal.strategyId,
      signalId: signal.id,
      signalKind: signal.kind,
      routeFamily: compilation.family,
      pattern: compilation.pattern,
      settlementPolicy: compilation.settlementPolicy,
      executionOwner: strategyOne
        ? "EXISTING_STRATEGY_ONE_ORCHESTRATOR"
        : "CENTRAL_SHARED_ORCHESTRATOR",
      compilationState: strategyOne ? "REUSED_EXISTING_PATH" : "COMPILED_SHADOW",
      promotionState: strategyOne ? "EXISTING_PAPER_PATH" : "BLOCKED",
      generatedAt: now,
      expiresAt: signal.expiresAt,
      legs: compilation.legs,
      modeledNetValue: compilation.modeledNetValue,
      modeledNetValueUnit: compilation.modeledNetValueUnit,
      executionReadinessBlockers: blockers,
      sourceExecutionAuthorized: false,
      capitalReservationAllowed: false,
      riskApprovalGranted: false,
      executionHandoffAllowed: false,
      automaticExecutionAllowed: false,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    });
  }
}

function compileSignal(signal: StrategySignal): Compilation {
  switch (signal.kind) {
    case "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY":
      return {
        family: "SPOT_TWO_VENUE",
        pattern: "PARALLEL_TWO_LEG",
        legs: [
          leg(signal.id, 1, signal.evidence.buyExchange, "SPOT", signal.evidence.market, "BUY", "MARKET", signal.evidence.executableQuantity, signal.evidence.buyPrice, "PARALLEL"),
          leg(signal.id, 2, signal.evidence.sellExchange, "SPOT", signal.evidence.market, "SELL", "MARKET", signal.evidence.executableQuantity, signal.evidence.sellPrice, "PARALLEL"),
        ],
        modeledNetValue: signal.evidence.netProfit,
        modeledNetValueUnit: "QUOTE",
        blockers: [],
        settlementPolicy: {
          kind: "EXISTING_STRATEGY_ONE_OWNER",
          lifecycleOwner: "EXISTING_STRATEGY_ONE_ORCHESTRATOR",
        },
      };

    case "XEMM_SAFE_MAKER_PRICE": {
      const makerSide = signal.evidence.side === "BID" ? "BUY" : "SELL";
      const hedgeSide = makerSide === "BUY" ? "SELL" : "BUY";
      const quantity = signal.evidence.configuredMakerQuantity;
      return {
        family: "SPOT_TWO_VENUE",
        pattern: "PASSIVE_MAKER_THEN_HEDGE",
        legs: [
          leg(signal.id, 1, signal.evidence.makerExchange, "SPOT", signal.evidence.market, makerSide, "LIMIT_POST_ONLY", quantity, signal.evidence.safeMakerPrice, "PARALLEL"),
          leg(signal.id, 2, signal.evidence.hedgeExchange, "SPOT", signal.evidence.market, hedgeSide, "MARKET", quantity, signal.evidence.hedgeReferencePrice, "PASSIVE_FILL_TRIGGER"),
        ],
        modeledNetValue: signal.evidence.modeledRetainedEdgePercent,
        modeledNetValueUnit: "PERCENT_ONLY",
        blockers: [
          ...(quantity === null ? ["MAKER_QUANTITY_EVIDENCE_REQUIRED", "HEDGE_QUANTITY_EVIDENCE_REQUIRED"] : []),
          "MAKER_FILL_EVIDENCE_REQUIRED",
          "HEDGE_BALANCE_EVIDENCE_REQUIRED",
        ],
        settlementPolicy: {
          kind: "PASSIVE_FILL_THEN_HEDGE_CYCLE",
          lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
          requiresPassiveFillEvidence: true,
        },
      };
    }

    case "TRIANGULAR_ARBITRAGE_SHADOW_PATH":
      return {
        family: "SPOT_TRIANGULAR",
        pattern: "SEQUENTIAL_THREE_LEG",
        legs: signal.evidence.legs.map((item, index) => {
          const buy = item.action === "BUY_BASE";
          const quantity = buy ? item.outputBeforeFee : item.tradedInputQuantity;
          const price = buy
            ? item.tradedInputQuantity / item.outputBeforeFee
            : item.outputBeforeFee / item.tradedInputQuantity;
          return leg(signal.id, index + 1, signal.evidence.exchange, "SPOT", item.market, buy ? "BUY" : "SELL", "MARKET", quantity, price, index === 0 ? "PARALLEL" : "AFTER_PREVIOUS");
        }),
        modeledNetValue: signal.evidence.netProfitQuantity,
        modeledNetValueUnit: "START_ASSET",
        blockers: ["SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED"],
        settlementPolicy: {
          kind: "IMMEDIATE_CONVERSION_CYCLE",
          lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
          startAsset: signal.evidence.startAsset,
          initialQuantity: signal.evidence.initialInputQuantity,
          modeledFinalQuantity: signal.evidence.finalOutputQuantity,
          flows: signal.evidence.legs.map((item, index) => ({
            legId: `${signal.id}:leg:${index + 1}`,
            fromAsset: item.fromAsset,
            toAsset: item.toAsset,
          })),
        },
      };

    case "SPOT_PERPETUAL_BASIS_SHADOW_OPPORTUNITY":
      return {
        family: "SPOT_PERPETUAL",
        pattern: "PARALLEL_TWO_LEG",
        legs: [
          leg(signal.id, 1, signal.evidence.spotExchange, "SPOT", signal.evidence.market, "BUY", "MARKET", signal.evidence.quantity, signal.evidence.spotBuyVwap, "PARALLEL"),
          leg(signal.id, 2, signal.evidence.perpetualExchange, "PERPETUAL", signal.evidence.market, "SELL", "MARKET", signal.evidence.quantity, signal.evidence.perpetualSellVwap, "PARALLEL"),
        ],
        modeledNetValue: signal.evidence.expectedNetQuote,
        modeledNetValueUnit: "QUOTE",
        blockers: signal.evidence.executionReadinessBlockers,
        settlementPolicy: {
          kind: "BASIS_CONVERGENCE",
          lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
          entryBasisPercent: signal.evidence.grossBasisPercent,
          closeAtOrBelowAbsoluteBasisPercent: signal.evidence.closeAtOrBelowAbsoluteBasisPercent,
          nextOpeningDelayMs: signal.evidence.nextOpeningDelayMs,
          perpetualLeverage: signal.evidence.perpetualLeverage,
          fundingTimestamps: [signal.evidence.nextFundingTime],
          requiresFundingEvidence: true,
          forcedTimeExitAllowed: false,
        },
      };

    case "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY": {
      const fundingSchedule = compileFundingSchedule(signal.evidence);
      const finalFundingWindow = fundingSchedule[fundingSchedule.length - 1]!;
      return {
        family: "PERPETUAL_TWO_VENUE",
        pattern: "PARALLEL_TWO_LEG",
        legs: [
          leg(signal.id, 1, signal.evidence.longExchange, "PERPETUAL", signal.evidence.market, "BUY", "MARKET", signal.evidence.quantity, signal.evidence.longEntryVwap, "PARALLEL"),
          leg(signal.id, 2, signal.evidence.shortExchange, "PERPETUAL", signal.evidence.market, "SELL", "MARKET", signal.evidence.quantity, signal.evidence.shortEntryVwap, "PARALLEL"),
        ],
        modeledNetValue: signal.evidence.expectedNetQuote,
        modeledNetValueUnit: "QUOTE",
        blockers: signal.evidence.executionReadinessBlockers,
        settlementPolicy: {
          kind: "FUNDING_CAPTURE_THEN_EXIT",
          lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
          notBefore: Math.max(
            finalFundingWindow.longTimestamp,
            finalFundingWindow.shortTimestamp,
          ) + 60_000,
          fundingTimestamps: [signal.evidence.nextFundingTimeLong, signal.evidence.nextFundingTimeShort],
          fundingSchedule,
          requiresFundingEvidence: true,
          forcedTimeExitAllowed: false,
        },
      };
    }

    case "PERPETUAL_PERPETUAL_ARBITRAGE_SHADOW_OPPORTUNITY":
      return {
        family: "PERPETUAL_TWO_VENUE",
        pattern: "PARALLEL_TWO_LEG",
        legs: [
          leg(signal.id, 1, signal.evidence.longExchange, "PERPETUAL", signal.evidence.market, "BUY", "MARKET", signal.evidence.quantity, signal.evidence.longEntryVwap, "PARALLEL"),
          leg(signal.id, 2, signal.evidence.shortExchange, "PERPETUAL", signal.evidence.market, "SELL", "MARKET", signal.evidence.quantity, signal.evidence.shortEntryVwap, "PARALLEL"),
        ],
        modeledNetValue: signal.evidence.expectedNetQuote,
        modeledNetValueUnit: "QUOTE",
        blockers: signal.evidence.executionReadinessBlockers,
        settlementPolicy: {
          kind: "SPREAD_CONVERGENCE",
          lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
          entryDislocationPercent: signal.evidence.grossDislocationPercent,
          closeAtOrBelowAbsoluteDislocationPercent: Math.max(0.05, Math.abs(signal.evidence.grossDislocationPercent) * 0.25),
          fundingTimestamps: [signal.evidence.nextFundingTimeLong, signal.evidence.nextFundingTimeShort],
          requiresFundingEvidence: true,
          forcedTimeExitAllowed: false,
        },
      };

    case "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN":
      return {
        family: "SPOT_MARKET_MAKING",
        pattern: "TWO_SIDED_PASSIVE_MAKER",
        legs: [
          leg(signal.id, 1, signal.evidence.exchange, "SPOT", signal.evidence.market, "BUY", "LIMIT_POST_ONLY", signal.evidence.quoteQuantity, signal.evidence.bidQuotePrice, "PARALLEL"),
          leg(signal.id, 2, signal.evidence.exchange, "SPOT", signal.evidence.market, "SELL", "LIMIT_POST_ONLY", signal.evidence.quoteQuantity, signal.evidence.askQuotePrice, "PARALLEL"),
        ],
        modeledNetValue: signal.evidence.modeledNetCapturePercent,
        modeledNetValueUnit: "PERCENT_ONLY",
        blockers: signal.evidence.executionReadinessBlockers,
        settlementPolicy: {
          kind: "TWO_SIDED_PASSIVE_FILL_CYCLE",
          lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
          requiresEveryPassiveFillEvidence: true,
        },
      };

    case "STATISTICAL_ARBITRAGE_SHADOW_PAIR":
      return {
        family: "PERPETUAL_STATISTICAL_PAIR",
        pattern: "PARALLEL_STATISTICAL_PAIR",
        legs: [
          leg(signal.id, 1, signal.evidence.exchange, "PERPETUAL", signal.evidence.longMarket, "BUY", "MARKET", signal.evidence.longQuantity, signal.evidence.longEntryVwap, "PARALLEL"),
          leg(signal.id, 2, signal.evidence.exchange, "PERPETUAL", signal.evidence.shortMarket, "SELL", "MARKET", signal.evidence.shortQuantity, signal.evidence.shortEntryVwap, "PARALLEL"),
        ],
        modeledNetValue: signal.evidence.modeledNetQuote,
        modeledNetValueUnit: "QUOTE",
        blockers: ["WALK_FORWARD_PROMOTION_EVIDENCE_REQUIRED", "REGIME_ADMISSION_REQUIRED", ...signal.evidence.executionReadinessBlockers],
        settlementPolicy: {
          kind: "STATISTICAL_MEAN_REVERSION",
          lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
          entryZScore: signal.evidence.zScore,
          closeAtOrBelowAbsoluteZScore: 0.5,
          baselineSpreadMean: signal.evidence.baselineSpreadMean,
          baselineSpreadStandardDeviation: signal.evidence.baselineSpreadStandardDeviation,
          hedgeBeta: signal.evidence.hedgeBeta,
          leftMarket: signal.evidence.leftMarket,
          rightMarket: signal.evidence.rightMarket,
          fundingTimestamps: [signal.evidence.nextFundingTimeLong, signal.evidence.nextFundingTimeShort],
          requiresFundingEvidence: true,
          forcedTimeExitAllowed: false,
        },
      };
  }
}

function leg(
  signalId: string,
  sequence: number,
  exchange: string,
  product: CentralStrategyExecutionLeg["product"],
  market: string,
  side: CentralStrategyExecutionLeg["side"],
  orderType: CentralStrategyExecutionLeg["orderType"],
  quantity: number | null,
  referencePrice: number,
  dependency: CentralStrategyExecutionLeg["dependency"],
): CentralStrategyExecutionLeg {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0 || (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0))) {
    throw new Error("Central execution leg requires positive finite quantity and price evidence.");
  }
  return {
    id: `${signalId}:leg:${sequence}`,
    sequence,
    exchange,
    product,
    market,
    side,
    orderType,
    quantity,
    referencePrice,
    reduceOnly: false,
    dependency,
    evidenceOnly: true,
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function validateSettlementPolicy(policy: CentralStrategySettlementPolicy): void {
  switch (policy.kind) {
    case "EXISTING_STRATEGY_ONE_OWNER":
    case "PASSIVE_FILL_THEN_HEDGE_CYCLE":
    case "TWO_SIDED_PASSIVE_FILL_CYCLE":
      return;
    case "IMMEDIATE_CONVERSION_CYCLE":
      if (!policy.startAsset.trim() || !Number.isFinite(policy.initialQuantity) || policy.initialQuantity <= 0 ||
          !Number.isFinite(policy.modeledFinalQuantity) || policy.modeledFinalQuantity <= 0 || policy.flows.length !== 3 ||
          policy.flows.some((item) => !item.legId.trim() || !item.fromAsset.trim() || !item.toAsset.trim()) ||
          new Set(policy.flows.map((item) => item.legId)).size !== policy.flows.length ||
          policy.flows[0]?.fromAsset !== policy.startAsset ||
          policy.flows[policy.flows.length - 1]?.toAsset !== policy.startAsset ||
          policy.flows.slice(1).some((item, index) => policy.flows[index]?.toAsset !== item.fromAsset)) {
        throw new Error("Triangular settlement policy evidence is incomplete.");
      }
      return;
    case "BASIS_CONVERGENCE":
      if (!Number.isFinite(policy.entryBasisPercent) || !Number.isFinite(policy.closeAtOrBelowAbsoluteBasisPercent) ||
          policy.closeAtOrBelowAbsoluteBasisPercent < 0 ||
          !Number.isSafeInteger(policy.nextOpeningDelayMs) || policy.nextOpeningDelayMs <= 0 ||
          policy.perpetualLeverage !== 1 ||
          !Number.isSafeInteger(policy.fundingTimestamps[0])) throw new Error("Basis settlement policy evidence is invalid.");
      return;
    case "FUNDING_CAPTURE_THEN_EXIT":
      if (!Number.isSafeInteger(policy.notBefore) || policy.notBefore <= 0 || policy.fundingTimestamps.length !== 2 ||
          policy.fundingTimestamps.some((item) => !Number.isSafeInteger(item) || item <= 0) ||
          (policy.fundingSchedule !== undefined && (
            policy.fundingSchedule.length === 0 || policy.fundingSchedule.length > 6 ||
            policy.fundingSchedule.some((item, index) =>
              !Number.isSafeInteger(item.longTimestamp) || item.longTimestamp <= 0 ||
              !Number.isSafeInteger(item.shortTimestamp) || item.shortTimestamp <= 0 ||
              (index > 0 && (
                item.longTimestamp <= policy.fundingSchedule![index - 1]!.longTimestamp ||
                item.shortTimestamp <= policy.fundingSchedule![index - 1]!.shortTimestamp
              )),
            ) ||
            policy.notBefore <= Math.max(
              policy.fundingSchedule[policy.fundingSchedule.length - 1]!.longTimestamp,
              policy.fundingSchedule[policy.fundingSchedule.length - 1]!.shortTimestamp,
            )
          ))) {
        throw new Error("Funding settlement policy evidence is invalid.");
      }
      return;
    case "SPREAD_CONVERGENCE":
      if (!Number.isFinite(policy.entryDislocationPercent) || !Number.isFinite(policy.closeAtOrBelowAbsoluteDislocationPercent) ||
          policy.closeAtOrBelowAbsoluteDislocationPercent < 0 || policy.fundingTimestamps.some((item) => !Number.isSafeInteger(item))) throw new Error("Spread settlement policy evidence is invalid.");
      return;
    case "STATISTICAL_MEAN_REVERSION":
      if (!Number.isFinite(policy.entryZScore) || !Number.isFinite(policy.baselineSpreadMean) ||
          !Number.isFinite(policy.baselineSpreadStandardDeviation) || policy.baselineSpreadStandardDeviation <= 0 ||
          !Number.isFinite(policy.hedgeBeta) || policy.hedgeBeta <= 0 || !policy.leftMarket.trim() || !policy.rightMarket.trim() ||
          policy.fundingTimestamps.some((item) => !Number.isSafeInteger(item))) {
        throw new Error("Statistical settlement policy evidence is invalid.");
      }
  }
}

function compileFundingSchedule(
  evidence: Extract<StrategySignal, {
    kind: "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY";
  }>["evidence"],
): readonly {readonly longTimestamp: number; readonly shortTimestamp: number}[] {
  // The fallback preserves replay compatibility for V28/V70 signals persisted
  // before bounded multi-period funding carry evidence was introduced.
  const periods = Number.isSafeInteger(evidence.modeledFundingPeriods) &&
      evidence.modeledFundingPeriods > 0
    ? evidence.modeledFundingPeriods
    : 1;
  if (periods > 6) {
    throw new Error("Funding settlement policy cannot exceed six funding periods.");
  }
  const intervalMs = periods === 1 ? 0 : evidence.fundingIntervalMinutes * 60_000;
  if (periods > 1 && (!Number.isSafeInteger(intervalMs) || intervalMs <= 0)) {
    throw new Error("Multi-period funding settlement requires a positive interval.");
  }
  return Array.from({length: periods}, (_, index) => ({
    longTimestamp: evidence.nextFundingTimeLong + index * intervalMs,
    shortTimestamp: evidence.nextFundingTimeShort + index * intervalMs,
  }));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
