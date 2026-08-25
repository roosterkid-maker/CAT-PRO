import {
  personalBotRuntimeControlService,
} from "../../../strategies/services/PersonalBotRuntimeControlService";

import {
  strategyOnePilotPreflightService,
  type StrategyOnePilotPreviewReport,
} from "./StrategyOnePilotPreflightService";

import {
  strategyOneTinyLiveActionAuthorityService,
  type StrategyOneTinyLiveAuthorityRecord,
} from "./StrategyOneTinyLiveActionAuthorityService";

import {
  strategyOneTinyLiveAccountModeLeaseService,
} from "./StrategyOneTinyLiveAccountModeLeaseService";

import {
  strategyOneTinyLivePreArmService,
} from "./StrategyOneTinyLivePreArmService";

export type StrategyOneTinyLiveReadinessStageState =
  | "PASS"
  | "BLOCKED"
  | "WAITING";

export type StrategyOneTinyLiveOperationalState =
  | "BLOCKED_RUNTIME_CONFIGURATION"
  | "BLOCKED_PAPER_AUTOMATION_ACTIVE"
  | "READY_TO_ARM_DYNAMIC_POOL"
  | "ARMED_AWAITING_ACCOUNT_LEASE"
  | "ARMED_AWAITING_CURRENT_ROUTE"
  | "READY_FOR_ONE_TIME_AUTHORITY"
  | "AWAITING_FINAL_LAST_LOOK";

export interface StrategyOneTinyLiveReadinessStage {
  readonly key:
    | "RUNTIME_PROCESS_CONFIGURATION"
    | "PAPER_AUTOMATION_PAUSED"
    | "DYNAMIC_POOL_ARM"
    | "ACCOUNT_MODE_LEASE"
    | "CURRENT_EXACT_ROUTE_PREFLIGHT"
    | "ONE_TIME_ACTION_AUTHORITY"
    | "FINAL_LAST_LOOK_AND_ORDER_SUBMISSION";
  readonly state: StrategyOneTinyLiveReadinessStageState;
  readonly summary: string;
  readonly reasons: readonly string[];
}

interface RuntimeConfigurationEvidence {
  readonly tradingModeLive: boolean;
  readonly tradingExecutionModeLive: boolean;
  readonly liveTradingEnabled: boolean;
  readonly arbitrageConfirmationPresent: boolean;
  readonly strategyOneRuntimeConfirmationPresent: boolean;
  readonly liveExecutionConfirmationPresent: boolean;
  readonly liveOrderSubmissionConfirmationPresent: boolean;
}

interface StrategyOneTinyLiveReadinessWaterfallDependencies {
  getRuntimeConfiguration(): RuntimeConfigurationEvidence;
  isPaperAutomationPaused(): boolean;
  getPreArmDiagnostics(now: number): ReturnType<
    typeof strategyOneTinyLivePreArmService.getDiagnostics
  >;
  getAccountLeaseDiagnostics(now: number): ReturnType<
    typeof strategyOneTinyLiveAccountModeLeaseService.getDiagnostics
  >;
  getPilotPreview(): StrategyOnePilotPreviewReport;
  getActionDiagnostics(now: number): ReturnType<
    typeof strategyOneTinyLiveActionAuthorityService.getDiagnostics
  >;
}

const DEFAULT_DEPENDENCIES: StrategyOneTinyLiveReadinessWaterfallDependencies = {
  getRuntimeConfiguration: () => ({
    tradingModeLive:
      process.env.TRADING_MODE?.trim().toLowerCase() === "live",
    tradingExecutionModeLive:
      process.env.TRADING_EXECUTION_MODE?.trim().toLowerCase() === "live",
    liveTradingEnabled:
      process.env.LIVE_TRADING_ENABLED?.trim().toLowerCase() === "true",
    arbitrageConfirmationPresent:
      process.env.ARBITRAGE_LIVE_CONFIRMATION?.trim() ===
      "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION",
    strategyOneRuntimeConfirmationPresent:
      process.env.STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION?.trim() ===
      "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME",
    liveExecutionConfirmationPresent:
      process.env.LIVE_TRADING_CONFIRMATION?.trim() ===
      "ENABLE_CONFIRMED_LIVE_EXECUTION",
    liveOrderSubmissionConfirmationPresent:
      process.env.LIVE_ORDER_SUBMISSION_CONFIRMATION?.trim() ===
      "SUBMIT_CONFIRMED_LIVE_ORDER",
  }),
  isPaperAutomationPaused: () =>
    !personalBotRuntimeControlService.getControl().enabled,
  getPreArmDiagnostics: (now) =>
    strategyOneTinyLivePreArmService.getDiagnostics(now),
  getAccountLeaseDiagnostics: (now) =>
    strategyOneTinyLiveAccountModeLeaseService.getDiagnostics(now),
  getPilotPreview: () =>
    strategyOnePilotPreflightService.getPreview(),
  getActionDiagnostics: (now) =>
    strategyOneTinyLiveActionAuthorityService.getDiagnostics(now),
};

/**
 * Read-only gate waterfall for the real Strategy #1 order boundary.
 *
 * This report deliberately includes every process-start confirmation instead
 * of reusing the narrower pre-arm gate. It cannot arm, lease, authorize,
 * reserve capital, refresh permissions or submit an order.
 */
export class StrategyOneTinyLiveReadinessWaterfallService {
  private readonly dependencies: StrategyOneTinyLiveReadinessWaterfallDependencies;

  constructor(
    dependencies: Partial<StrategyOneTinyLiveReadinessWaterfallDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  getReport(now = Date.now()) {
    validateTime(now);

    const runtime = this.dependencies.getRuntimeConfiguration();
    const paperAutomationPaused = this.dependencies.isPaperAutomationPaused();
    const preArm = this.dependencies.getPreArmDiagnostics(now);
    const lease = this.dependencies.getAccountLeaseDiagnostics(now);
    const preview = this.dependencies.getPilotPreview();
    const action = this.dependencies.getActionDiagnostics(now);
    const runtimeReasons = runtimeConfigurationReasons(runtime);
    const candidateReasons = pilotCandidateReasons(preview);
    const currentAuthority = findCurrentAuthorizedAuthority(action.records, now);
    const unresolvedAuthority = action.blockingAuthorityPresent && !currentAuthority;
    const armActive = preArm.activeArm?.state === "ARMED";
    const leaseActive = lease.accountMode === "LIVE" && lease.activeLease?.state === "ACTIVE";
    const candidateReady = preview.selected !== null && candidateReasons.length === 0;

    const stages: readonly StrategyOneTinyLiveReadinessStage[] = [
      {
        key: "RUNTIME_PROCESS_CONFIGURATION",
        state: runtimeReasons.length === 0 ? "PASS" : "BLOCKED",
        summary: runtimeReasons.length === 0
          ? "All seven process-start LIVE and order-submission confirmations are present."
          : "The running backend process is not fully LIVE/order-submission capable.",
        reasons: runtimeReasons,
      },
      {
        key: "PAPER_AUTOMATION_PAUSED",
        state: paperAutomationPaused ? "PASS" : "BLOCKED",
        summary: paperAutomationPaused
          ? "PAPER automation is paused."
          : "PAPER automation must be paused before an arm or account lease can be created.",
        reasons: paperAutomationPaused
          ? []
          : ["Personal PAPER automation is currently enabled."],
      },
      {
        key: "DYNAMIC_POOL_ARM",
        state: armActive ? "PASS" : "WAITING",
        summary: armActive
          ? "A current durable dynamic USDT route-pool arm exists."
          : "No current dynamic route-pool arm exists.",
        reasons: armActive
          ? []
          : ["An exact pool-scoped operator arm is still required; no per-coin approval is required."],
      },
      {
        key: "ACCOUNT_MODE_LEASE",
        state: leaseActive
          ? "PASS"
          : lease.lastReconciliationError
            ? "BLOCKED"
            : "WAITING",
        summary: leaseActive
          ? "The account is LIVE only under the current bounded arm lease."
          : `The account remains ${lease.accountMode} with no active LIVE lease.`,
        reasons: leaseActive
          ? []
          : [
              lease.lastReconciliationError ??
              "A separate exact account-mode lease must bind the active arm before execution.",
            ],
      },
      {
        key: "CURRENT_EXACT_ROUTE_PREFLIGHT",
        state: candidateReady ? "PASS" : "BLOCKED",
        summary: candidateReady && preview.selected
          ? `${preview.selected.market} ${preview.selected.buyExchange}->${preview.selected.sellExchange} passes the current route preview.`
          : "No current exact route passes every immutable and book-dependent preview gate.",
        reasons: candidateReasons,
      },
      {
        key: "ONE_TIME_ACTION_AUTHORITY",
        state: currentAuthority
          ? "PASS"
          : unresolvedAuthority
            ? "BLOCKED"
            : "WAITING",
        summary: currentAuthority
          ? "A current three-second one-time action authority exists."
          : unresolvedAuthority
            ? "A consumed or unresolved authority blocks a new attempt."
            : "No one-time action authority currently exists.",
        reasons: currentAuthority
          ? []
          : [
              unresolvedAuthority
                ? "Resolve the existing durable authority/session evidence before another attempt."
                : "Authority is minted only after the armed exact route passes a fresh action-time preflight.",
            ],
      },
      {
        key: "FINAL_LAST_LOOK_AND_ORDER_SUBMISSION",
        state: "WAITING",
        summary: "Final books, fees, depth, stress net, time-in-force and lifecycle confirmation are evaluated synchronously at execution time.",
        reasons: [
          "A read-only readiness report cannot pre-approve or authorize the final exchange submission boundary.",
        ],
      },
    ];

    return deepFreeze({
      schemaVersion: "198.0" as const,
      generatedAt: now,
      mode: "READ_ONLY_STAGED_TINY_LIVE_AUTHORITY" as const,
      operationalState: operationalState({
        runtimeReady: runtimeReasons.length === 0,
        paperAutomationPaused,
        armActive,
        leaseActive,
        candidateReady,
        currentAuthority: currentAuthority !== null,
      }),
      firstIncompleteStage:
        stages.find((stage) => stage.state !== "PASS")?.key ?? null,
      runtime,
      currentRoute: preview.selected
        ? {
            opportunityId: preview.selected.opportunityId,
            market: preview.selected.market,
            buyExchange: preview.selected.buyExchange,
            sellExchange: preview.selected.sellExchange,
            previewState: preview.state,
          }
        : null,
      stages,
      authorityModel: {
        policyAndSettingsGrantOrderAuthority: false as const,
        dynamicPoolRequiresPerCoinApproval: false as const,
        armRequired: true as const,
        accountLeaseRequired: true as const,
        oneTimeAuthorityRequired: true as const,
        finalLastLookRequired: true as const,
      },
      safety: {
        readOnly: true as const,
        modeMutationPerformed: false as const,
        armCreated: false as const,
        leaseActivated: false as const,
        authorityCreated: false as const,
        capitalReserved: false as const,
        orderSubmissionAuthorized: false as const,
        orderSubmissionPerformed: false as const,
      },
    });
  }
}

function runtimeConfigurationReasons(
  evidence: RuntimeConfigurationEvidence,
): string[] {
  const checks: readonly [keyof RuntimeConfigurationEvidence, string][] = [
    ["tradingModeLive", "TRADING_MODE is not live."],
    ["tradingExecutionModeLive", "TRADING_EXECUTION_MODE is not live."],
    ["liveTradingEnabled", "LIVE_TRADING_ENABLED is not true."],
    ["arbitrageConfirmationPresent", "ARBITRAGE_LIVE_CONFIRMATION is absent or invalid."],
    ["strategyOneRuntimeConfirmationPresent", "STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION is absent or invalid."],
    ["liveExecutionConfirmationPresent", "LIVE_TRADING_CONFIRMATION is absent or invalid."],
    ["liveOrderSubmissionConfirmationPresent", "LIVE_ORDER_SUBMISSION_CONFIRMATION is absent or invalid."],
  ];

  return checks
    .filter(([key]) => !evidence[key])
    .map(([, reason]) => reason);
}

function pilotCandidateReasons(
  preview: StrategyOnePilotPreviewReport,
): string[] {
  if (!preview.selected) {
    return preview.blockers.length > 0
      ? [...preview.blockers]
      : ["No current fresh EXECUTE opportunity has a matching credible route."];
  }

  return preview.selected.checks
    .filter((check) => check.state !== "PASS")
    .flatMap((check) =>
      check.reasons.length > 0
        ? check.reasons.map((reason) => `${check.key}: ${reason}`)
        : [`${check.key}: ${check.message}`]);
}

function findCurrentAuthorizedAuthority(
  records: readonly StrategyOneTinyLiveAuthorityRecord[],
  now: number,
): StrategyOneTinyLiveAuthorityRecord | null {
  return records.find((record) =>
    record.state === "AUTHORIZED" &&
    record.authorityExpiresAt !== null &&
    record.authorityExpiresAt > now) ?? null;
}

function operationalState(input: {
  readonly runtimeReady: boolean;
  readonly paperAutomationPaused: boolean;
  readonly armActive: boolean;
  readonly leaseActive: boolean;
  readonly candidateReady: boolean;
  readonly currentAuthority: boolean;
}): StrategyOneTinyLiveOperationalState {
  if (!input.runtimeReady) {
    return "BLOCKED_RUNTIME_CONFIGURATION";
  }
  if (!input.paperAutomationPaused) {
    return "BLOCKED_PAPER_AUTOMATION_ACTIVE";
  }
  if (!input.armActive) {
    return "READY_TO_ARM_DYNAMIC_POOL";
  }
  if (!input.leaseActive) {
    return "ARMED_AWAITING_ACCOUNT_LEASE";
  }
  if (!input.candidateReady) {
    return "ARMED_AWAITING_CURRENT_ROUTE";
  }
  return input.currentAuthority
    ? "AWAITING_FINAL_LAST_LOOK"
    : "READY_FOR_ONE_TIME_AUTHORITY";
}

function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Tiny-LIVE readiness-waterfall timestamp must be positive.");
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export const strategyOneTinyLiveReadinessWaterfallService =
  new StrategyOneTinyLiveReadinessWaterfallService();
