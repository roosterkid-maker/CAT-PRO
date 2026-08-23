import {CAT_PRO_TARGET_EXCHANGES} from "../../../exchanges/core/ExchangeFleetRegistry";
import {strategyRegistry} from "../../../strategies/bootstrap/StrategyBootstrap";
import {centralPaperLifecycleReadModelService} from "../../../strategies/services/CentralPaperLifecycleReadModelService";
import {centralPaperSoakAcceptanceService} from "../../../strategies/services/CentralPaperSoakAcceptanceService";
import type {StrategyId} from "../../../strategies/models/StrategyMetadata";
import {strategyOnePaperRuntimeAcceptanceService} from "../../../workflows/cross-exchange-arbitrage/services/StrategyOnePaperRuntimeAcceptanceService";
import {liveExecutionService} from "../LiveExecutionService";
import {orderFillFeeEvidenceService} from "../evidence/OrderFillFeeEvidenceService";
import {centralLiveOrderExecutionGateway} from "../central/CentralLiveOrderExecutionGateway";
import {centralLiveLifecycleEvidenceStore} from "../central/CentralLiveLifecycleEvidenceStore";
import {centralLiveSharedRecoveryBridgeService} from "../../../recovery/adapters/CentralLiveSharedRecoveryBridgeService";
import {centralLiveProductionLifecycleComposition} from "../production/CentralLiveProductionLifecyclePorts";
import {centralLiveRuntimeEvidenceCollector} from "../evidence/CentralLiveRuntimeEvidenceCollector";
import {centralLiveExecutionSystem} from "../central/CentralLiveExecutionSystem";

const ACTUAL_STRATEGIES = [
  "cross-exchange-arbitrage",
  "cross-exchange-market-making",
  "triangular-arbitrage",
  "spot-perpetual-basis-arbitrage",
  "funding-rate-arbitrage",
  "perpetual-perpetual-arbitrage",
  "dynamic-market-making",
  "statistical-arbitrage",
] as const;

type ActualStrategyId = typeof ACTUAL_STRATEGIES[number];

type ArchitectureCapability =
  | "EXISTING_STRATEGY_ONE_TWO_LEG_LIVE_PATH"
  | "CENTRAL_LIVE_ADMISSION_AND_DURABLE_QUEUE"
  | "CENTRAL_DISPATCH_AND_OUTCOME_JOURNAL"
  | "CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF"
  | "SEQUENTIAL_THREE_LEG_LIVE_LIFECYCLE"
  | "POST_ONLY_ORDER_CONTRACT"
  | "MAKER_CANCEL_REPLACE_LIFECYCLE"
  | "FILL_DRIVEN_LIVE_HEDGE"
  | "DERIVATIVE_PRODUCT_ORDER_CONTRACT"
  | "REDUCE_ONLY_ORDER_CONTRACT"
  | "DERIVATIVE_LIVE_RECONCILIATION"
  | "AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE"
  | "JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY"
  | "DURABLE_CENTRAL_LIFECYCLE_EVIDENCE"
  | "LIVE_RESIDUAL_SHARED_RECOVERY_STAGING"
  | "CENTRAL_PRODUCTION_LIFECYCLE_PORTS"
  | "PASSIVE_MAKER_HEDGE_LIVE_LIFECYCLE"
  | "EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR"
  | "TWO_SIDED_QUOTE_LIFECYCLE"
  | "STATISTICAL_PROMOTION_GATE";

const BASE_ARCHITECTURE: Readonly<Record<ArchitectureCapability, boolean>> = Object.freeze({
  EXISTING_STRATEGY_ONE_TWO_LEG_LIVE_PATH: true,
  CENTRAL_LIVE_ADMISSION_AND_DURABLE_QUEUE: true,
  CENTRAL_DISPATCH_AND_OUTCOME_JOURNAL: true,
  CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF: false,
  SEQUENTIAL_THREE_LEG_LIVE_LIFECYCLE: true,
  POST_ONLY_ORDER_CONTRACT: false,
  MAKER_CANCEL_REPLACE_LIFECYCLE: true,
  FILL_DRIVEN_LIVE_HEDGE: true,
  DERIVATIVE_PRODUCT_ORDER_CONTRACT: false,
  REDUCE_ONLY_ORDER_CONTRACT: false,
  DERIVATIVE_LIVE_RECONCILIATION: true,
  AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE: false,
  JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY: true,
  DURABLE_CENTRAL_LIFECYCLE_EVIDENCE: true,
  LIVE_RESIDUAL_SHARED_RECOVERY_STAGING: true,
  CENTRAL_PRODUCTION_LIFECYCLE_PORTS: true,
  PASSIVE_MAKER_HEDGE_LIVE_LIFECYCLE: true,
  EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR: true,
  TWO_SIDED_QUOTE_LIFECYCLE: true,
  STATISTICAL_PROMOTION_GATE: true,
});

const REQUIREMENTS: Readonly<Record<ActualStrategyId, readonly ArchitectureCapability[]>> = Object.freeze({
  "cross-exchange-arbitrage": ["EXISTING_STRATEGY_ONE_TWO_LEG_LIVE_PATH"],
  "cross-exchange-market-making": ["CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF", "POST_ONLY_ORDER_CONTRACT", "MAKER_CANCEL_REPLACE_LIFECYCLE", "FILL_DRIVEN_LIVE_HEDGE", "PASSIVE_MAKER_HEDGE_LIVE_LIFECYCLE", "EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR", "AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE", "JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY"],
  "triangular-arbitrage": ["CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF", "SEQUENTIAL_THREE_LEG_LIVE_LIFECYCLE", "EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR", "AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE", "JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY"],
  "spot-perpetual-basis-arbitrage": ["CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF", "DERIVATIVE_PRODUCT_ORDER_CONTRACT", "REDUCE_ONLY_ORDER_CONTRACT", "DERIVATIVE_LIVE_RECONCILIATION", "EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR", "AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE", "JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY"],
  "funding-rate-arbitrage": ["CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF", "DERIVATIVE_PRODUCT_ORDER_CONTRACT", "REDUCE_ONLY_ORDER_CONTRACT", "DERIVATIVE_LIVE_RECONCILIATION", "EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR", "AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE", "JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY"],
  "perpetual-perpetual-arbitrage": ["CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF", "DERIVATIVE_PRODUCT_ORDER_CONTRACT", "REDUCE_ONLY_ORDER_CONTRACT", "DERIVATIVE_LIVE_RECONCILIATION", "EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR", "AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE", "JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY"],
  "dynamic-market-making": ["CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF", "POST_ONLY_ORDER_CONTRACT", "MAKER_CANCEL_REPLACE_LIFECYCLE", "TWO_SIDED_QUOTE_LIFECYCLE", "EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR", "AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE", "JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY"],
  "statistical-arbitrage": ["CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF", "DERIVATIVE_PRODUCT_ORDER_CONTRACT", "REDUCE_ONLY_ORDER_CONTRACT", "DERIVATIVE_LIVE_RECONCILIATION", "STATISTICAL_PROMOTION_GATE", "EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR", "AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE", "JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY"],
});

interface RegisteredStrategyEvidence {
  readonly metadata: {readonly id: StrategyId; readonly strategyNumber: number; readonly displayName: string};
  readonly runtime: {readonly running: boolean};
}

interface SoakEvidence {
  readonly strategyId: StrategyId;
  readonly state: "SOAK_ACCEPTED" | "SOAK_IN_PROGRESS" | "NO_DATA";
  readonly closedCycles: number;
  readonly blockers: readonly string[];
}

interface LiveAdapterEvidence {
  readonly exchange: string;
  readonly adapterRegistered: boolean;
  readonly verificationState: string;
  readonly readOnlyVerificationFresh: boolean;
  readonly liveExecutionEnabled: boolean;
  readonly adapterConnected: boolean;
  readonly capabilities: {
    readonly supportsPostOnly: boolean;
    readonly products?: readonly ("SPOT" | "PERPETUAL")[];
    readonly supportsReduceOnly?: boolean;
  } | null;
}

export interface CentralStrategyLiveReadinessPort {
  getRegistered(now: number): readonly RegisteredStrategyEvidence[];
  getCentralPaper(now: number): {readonly state: string; readonly blockers: readonly string[]; readonly safety: {
    readonly oneCentralAdmission: boolean; readonly oneDurableQueue: boolean; readonly executablePaperRecovery: boolean;
    readonly liveExecutionAllowed: boolean; readonly orderSubmissionAllowed: boolean;
  }};
  getCentralSoak(now: number): readonly SoakEvidence[];
  getStrategyOnePaper(): {readonly readyForPaperSoakReview: boolean; readonly consecutivePasses: number; readonly blockers: readonly string[]};
  getLiveAdapters(): readonly LiveAdapterEvidence[];
}

export class CentralStrategyLiveReadinessService {
  constructor(private readonly port: CentralStrategyLiveReadinessPort = new DefaultCentralStrategyLiveReadinessPort()) {}

  getReport(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central strategy LIVE readiness timestamp must be positive.");
    const registered = this.port.getRegistered(now);
    const centralPaper = this.port.getCentralPaper(now);
    const centralSoak = this.port.getCentralSoak(now);
    const strategyOnePaper = this.port.getStrategyOnePaper();
    const adapters = this.port.getLiveAdapters();
    const fillFeeSources = orderFillFeeEvidenceService.getDiagnostics().sources;
    const centralOrderGateway = centralLiveOrderExecutionGateway.getDiagnostics(now);
    const lifecycleEvidence = centralLiveLifecycleEvidenceStore.getDiagnostics(now);
    const liveRecovery = centralLiveSharedRecoveryBridgeService.getDiagnostics(now);
    const productionPorts = centralLiveProductionLifecycleComposition.getDiagnostics();
    const runtimeEvidence = centralLiveRuntimeEvidenceCollector.getDiagnostics(now);
    const centralSystem = centralLiveExecutionSystem.getDiagnostics(now);
    const architecture: Readonly<Record<ArchitectureCapability, boolean>> = Object.freeze({
      ...BASE_ARCHITECTURE,
      CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF: centralSystem.fullyWired &&
        centralSystem.safety.blockedAdmissionJournaledBeforeQueue && centralSystem.safety.eligibleAdmissionJournalRequiredBeforeQueue &&
        centralSystem.safety.dispatchJournalRequiredBeforeHandler && centralSystem.safety.stableCrashResumeIdempotency &&
        !centralSystem.compileTimeGateEnabled && !centralSystem.dispatcherEnabled &&
        centralSystem.safety.productionOrderGatewayDefaultDisabled,
      POST_ONLY_ORDER_CONTRACT: adapters.some((item) =>
        item.adapterRegistered && item.capabilities?.supportsPostOnly === true),
      DERIVATIVE_PRODUCT_ORDER_CONTRACT: ["binance", "bybit"].every((exchange) => adapters.some((item) =>
        item.exchange === exchange && item.adapterRegistered && item.capabilities?.products?.includes("PERPETUAL") === true)),
      REDUCE_ONLY_ORDER_CONTRACT: ["binance", "bybit"].every((exchange) => adapters.some((item) =>
        item.exchange === exchange && item.adapterRegistered && item.capabilities?.products?.includes("PERPETUAL") === true &&
        item.capabilities.supportsReduceOnly === true)),
      AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE: ["binance:SPOT", "binance:PERPETUAL", "bybit:SPOT", "bybit:PERPETUAL"]
        .every((key) => fillFeeSources.some((item) => `${item.exchange}:${item.product}` === key)),
      JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY: centralOrderGateway.safety.journalBeforeIo &&
        centralOrderGateway.safety.unknownSubmissionNeverRetried && centralOrderGateway.safety.authoritativeFillFeeEvidenceRequired,
      DURABLE_CENTRAL_LIFECYCLE_EVIDENCE: lifecycleEvidence.safety.immutableKeyBinding &&
        lifecycleEvidence.safety.payloadHashBound && lifecycleEvidence.safety.exactPlanAndDispatchLineage,
      LIVE_RESIDUAL_SHARED_RECOVERY_STAGING: liveRecovery.safety.immutableEvidenceOnly &&
        !liveRecovery.safety.automaticRecoveryExecutionAllowed && !liveRecovery.safety.liveOrderSubmissionAllowed,
      CENTRAL_PRODUCTION_LIFECYCLE_PORTS: productionPorts.fullyWired && productionPorts.registeredCentralPatterns === 5 &&
        productionPorts.safety.productionOrderGatewayDefaultDisabled && productionPorts.safety.settlementEvidenceDurable,
      EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR: runtimeEvidence.safety.readOnlySourceEvidenceOnly &&
        runtimeEvidence.safety.exactPlanBinding && runtimeEvidence.safety.durableEvidenceSealing &&
        !runtimeEvidence.safety.actionAuthorityGranted && !runtimeEvidence.safety.orderSubmissionAllowed,
    });

    const strategies = ACTUAL_STRATEGIES.map((strategyId) => {
      const registration = registered.find((item) => item.metadata.id === strategyId) ?? null;
      const soak = centralSoak.find((item) => item.strategyId === strategyId) ?? null;
      const paperAccepted = strategyId === "cross-exchange-arbitrage"
        ? strategyOnePaper.readyForPaperSoakReview
        : soak?.state === "SOAK_ACCEPTED";
      const paperCycles = strategyId === "cross-exchange-arbitrage"
        ? strategyOnePaper.consecutivePasses
        : soak?.closedCycles ?? 0;
      const requirements = REQUIREMENTS[strategyId].map((capability) => ({
        capability,
        available: architecture[capability],
      }));
      const blockers: string[] = [];
      if (!registration) blockers.push("STRATEGY_CONTROLLER_NOT_REGISTERED");
      if (!paperAccepted) blockers.push(...(strategyId === "cross-exchange-arbitrage"
        ? strategyOnePaper.blockers.map((item) => `PAPER:${item}`)
        : (soak?.blockers ?? ["PAPER_SOAK_EVIDENCE_NO_DATA"]).map((item) => `PAPER:${item}`)));
      blockers.push(...requirements.filter((item) => !item.available).map((item) => `ARCHITECTURE:${item.capability}`));
      blockers.push("LIVE_COMPILE_TIME_GATE_DISABLED");
      blockers.push("FRESH_ACTION_TIME_OPERATOR_CONFIRMATION_REQUIRED");
      const architectureReady = requirements.every((item) => item.available);
      return freeze({
        strategyId,
        strategyNumber: registration?.metadata.strategyNumber ?? ACTUAL_STRATEGIES.indexOf(strategyId) + 1,
        displayName: registration?.metadata.displayName ?? strategyId,
        controllerRegistered: registration !== null,
        controllerRunning: registration?.runtime.running ?? false,
        paperEvidence: {accepted: paperAccepted, closedCycles: paperCycles, state: strategyId === "cross-exchange-arbitrage"
          ? paperAccepted ? "SOAK_ACCEPTED" as const : "SOAK_IN_PROGRESS" as const
          : soak?.state ?? "NO_DATA" as const},
        architectureReady,
        requirements,
        state: !paperAccepted ? "PAPER_PROOF_REQUIRED" as const
          : !architectureReady ? "ARCHITECTURE_BLOCKED" as const
          : "ACTIVATION_REVIEW_ONLY" as const,
        blockers: Array.from(new Set(blockers)),
        liveExecutionAllowed: false as const,
        orderSubmissionAllowed: false as const,
      });
    });

    const registeredAdapters = adapters.filter((item) => item.adapterRegistered).length;
    const verifiedAdapters = adapters.filter((item) => item.verificationState === "VERIFIED" && item.readOnlyVerificationFresh).length;
    return freeze({
      version: "82.0" as const,
      generatedAt: now,
      mode: "EIGHT_STRATEGY_CONTROLLED_LIVE_PREPARATION_AUDIT" as const,
      decision: "NO_GO" as const,
      actualStrategyTarget: 8 as const,
      registeredActualStrategies: strategies.filter((item) => item.controllerRegistered).length,
      paperAcceptedStrategies: strategies.filter((item) => item.paperEvidence.accepted).length,
      architectureReadyStrategies: strategies.filter((item) => item.architectureReady).length,
      activationReviewOnlyStrategies: strategies.filter((item) => item.state === "ACTIVATION_REVIEW_ONLY").length,
      strategies,
      centralPaper: {state: centralPaper.state, blockers: [...centralPaper.blockers],
        lifecycleImplemented: centralPaper.safety.oneCentralAdmission && centralPaper.safety.oneDurableQueue && centralPaper.safety.executablePaperRecovery},
      adapters: {target: CAT_PRO_TARGET_EXCHANGES.length, registered: registeredAdapters, readVerified: verifiedAdapters,
        exchanges: adapters.map((item) => ({...item}))},
      architecture: {...architecture},
      blockers: [
        "LIVE_COMPILE_TIME_GATE_DISABLED",
        "FRESH_ACTION_TIME_OPERATOR_CONFIRMATION_REQUIRED",
        ...(strategies.some((item) => !item.paperEvidence.accepted) ? ["ONE_OR_MORE_STRATEGIES_LACK_ACCEPTED_REAL_PAPER_SOAK"] : []),
        ...(strategies.some((item) => !item.architectureReady) ? ["ONE_OR_MORE_STRATEGIES_LACK_REQUIRED_LIVE_ARCHITECTURE"] : []),
      ],
      safety: {readOnlyAudit: true, paperEvidenceDoesNotGrantLiveAuthority: true, authenticatedReadDoesNotGrantOrderAuthority: true,
        noAutomaticPromotion: true, liveExecutionAllowed: false, orderSubmissionAllowed: false, orderSubmissionPerformed: false},
    });
  }
}

class DefaultCentralStrategyLiveReadinessPort implements CentralStrategyLiveReadinessPort {
  getRegistered(now: number) { return strategyRegistry.getSnapshot(now).strategies; }
  getCentralPaper(now: number) { return centralPaperLifecycleReadModelService.getSnapshot(now); }
  getCentralSoak(now: number) { return centralPaperSoakAcceptanceService.getReport(now).strategies; }
  getStrategyOnePaper() { return strategyOnePaperRuntimeAcceptanceService.getReport(); }
  getLiveAdapters() { return liveExecutionService.getExchangeStatuses(CAT_PRO_TARGET_EXCHANGES); }
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

export const centralStrategyLiveReadinessService = new CentralStrategyLiveReadinessService();
