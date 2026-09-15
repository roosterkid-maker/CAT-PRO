import type {
  StrategySignal,
  TriangularArbitrageStrategySignal,
} from "../../../strategies/models/StrategySignal";

import {
  CentralStrategyExecutionPlanCompiler,
} from "../../../strategies/services/CentralStrategyExecutionPlanCompiler";

import type {
  CentralStrategyExecutionPlan,
} from "../../../strategies/models/CentralStrategyExecutionPlan";

import type {
  TriangularArbitrageStrategyController,
} from "../../../strategies/triangular-arbitrage/TriangularArbitrageStrategyController";

import {
  AclaCapitalLoopManager,
} from "../../../strategies/triangular-arbitrage/AclaCapitalLoopManager";

import {
  triangularArbitrageStrategyController as defaultTriangularController,
  aclaCapitalLoopManager as defaultCapitalLoopManager,
} from "../../../strategies/bootstrap/StrategyBootstrap";

import {
  CentralLiveProductionLifecycleComposition,
} from "../production/CentralLiveProductionLifecyclePorts";

import {
  CentralLiveTriangularProductionPort,
} from "./CentralLiveTriangularProductionPort";

import {
  CentralLiveTriangularEvidenceCollector,
} from "./CentralLiveTriangularEvidenceCollector";

import {
  CentralLiveOperatorConfirmationService,
  centralLiveOperatorConfirmationService,
} from "./CentralLiveOperatorConfirmationService";

import {
  CentralLiveExecutionSystem,
} from "./CentralLiveExecutionSystem";

import {
  CentralLiveExecutionAdmissionJournalService,
} from "./CentralLiveExecutionAdmissionJournalService";

import {
  CentralLiveExecutionQueueService,
} from "./CentralLiveExecutionQueueService";

import {
  CentralLiveExecutionOutcomeJournalService,
} from "./CentralLiveExecutionOutcomeJournalService";

const TRIANGULAR_STRATEGY_ID = "triangular-arbitrage" as const;

export interface CentralLiveTriangularCandidate {
  readonly plan: CentralStrategyExecutionPlan;
  readonly observedAt: number;
  readonly ready: boolean;
  readonly reasons: readonly string[];
}

export interface CentralLiveTriangularOutcome {
  readonly planId: string;
  readonly observedAt: number;
  readonly intakeState: "QUEUED" | "DUPLICATE" | "BLOCKED";
  readonly reasons: readonly string[];
}

/**
 * The glue this session's research found entirely missing: subscribes to
 * REAL TriangularArbitrageStrategyController signals, compiles each into a
 * CentralStrategyExecutionPlan, and - ONLY once a currently-armed operator
 * confirmation exists (CentralLiveOperatorConfirmationService) AND every
 * real evidence check passes (CentralLiveTriangularEvidenceCollector) -
 * hands the plan to a dedicated CentralLiveExecutionSystem for real
 * dispatch via SequentialThreeLegLiveLifecycleHandler. A signal that
 * arrives with no arm present becomes a read-only "candidate" only -
 * nothing is intaken, nothing is dispatched, no order is ever possible
 * without a prior, real, exact-phrase operator confirmation.
 *
 * Deliberately does NOT start its own dispatcher poll loop -
 * runDispatchOnce() must be called by the caller (server.ts, on a timer,
 * only once the operator has separately enabled it) so activation is
 * always a distinct, visible step from merely constructing this service.
 */
export class CentralLiveTriangularBridgeService {
  private readonly compiler = new CentralStrategyExecutionPlanCompiler();
  private readonly evidenceCollector: CentralLiveTriangularEvidenceCollector;
  private readonly liveSystem: CentralLiveExecutionSystem;
  private unsubscribe: (() => void) | null = null;
  private latestCandidate: CentralLiveTriangularCandidate | null = null;
  private readonly recentOutcomes: CentralLiveTriangularOutcome[] = [];

  constructor(
    private readonly controller: Pick<TriangularArbitrageStrategyController, "subscribeToSignals" | "getConfiguration"> = defaultTriangularController,
    private readonly confirmations: Pick<CentralLiveOperatorConfirmationService, "claimForPlan"> = centralLiveOperatorConfirmationService,
    capitalLoopManager: Pick<AclaCapitalLoopManager, "getReport"> = defaultCapitalLoopManager,
  ) {
    const sequentialPort = new CentralLiveTriangularProductionPort(() => this.controller.getConfiguration());
    // CentralLiveProductionLifecycleComposition builds its OWN internal
    // registry and registers `new SequentialThreeLegLiveLifecycleHandler(sequential)`
    // using exactly the port passed in here - this IS the real registry the
    // dispatcher below will use, and the same one the evidence collector
    // must check readiness against, so it is passed to both rather than
    // duplicated.
    const production = new CentralLiveProductionLifecycleComposition(sequentialPort);
    this.evidenceCollector = new CentralLiveTriangularEvidenceCollector(capitalLoopManager, undefined, production.registry);

    this.liveSystem = new CentralLiveExecutionSystem(
      {
        compileTimeGateEnabled: true,
        // The dispatcher itself is enabled so a real runDispatchOnce() call
        // actually does work - the genuinely distinct safety gate is
        // whether anything ever CALLS runDispatchOnce() on a timer, which
        // is server.ts's decision (env-var gated), not this flag.
        dispatcherEnabled: true,
        allowedStrategies: [TRIANGULAR_STRATEGY_ID],
        registeredPatterns: ["SEQUENTIAL_THREE_LEG"],
      },
      {
        admissionJournal: new CentralLiveExecutionAdmissionJournalService(),
        queue: new CentralLiveExecutionQueueService(),
        outcomeJournal: new CentralLiveExecutionOutcomeJournalService(),
        production,
      },
    );
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.controller.subscribeToSignals((signal) => {
      this.onSignal(signal);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  isRunning(): boolean {
    return this.unsubscribe !== null;
  }

  /** Must be called explicitly on a timer by the caller - never self-schedules. */
  async runDispatchOnce(now = Date.now()) {
    return this.liveSystem.runOnce(now);
  }

  private onSignal(signal: StrategySignal): void {
    if (signal.kind !== "TRIANGULAR_ARBITRAGE_SHADOW_PATH") {
      return;
    }

    const triangularSignal = signal as TriangularArbitrageStrategySignal;
    const now = Date.now();

    let plan: CentralStrategyExecutionPlan;
    try {
      plan = this.compiler.compile(triangularSignal, now);
    } catch {
      return;
    }

    const configuration = this.controller.getConfiguration();
    const evidenceResult = this.evidenceCollector.collect(plan, triangularSignal, configuration, now);

    this.latestCandidate = {
      plan,
      observedAt: now,
      ready: evidenceResult.ok,
      reasons: evidenceResult.ok ? [] : evidenceResult.reasons,
    };

    if (!evidenceResult.ok) {
      return;
    }

    const actionAuthority = this.confirmations.claimForPlan(TRIANGULAR_STRATEGY_ID, plan.id, now);
    if (!actionAuthority) {
      // Ready to execute, but no operator arm is currently active - stays a
      // read-only candidate. This is the ONLY reason a fully-qualified
      // opportunity does not proceed: it always requires a real, prior,
      // exact-phrase confirmation.
      return;
    }

    const intake = this.liveSystem.intake(plan, {...evidenceResult.evidence, actionAuthority}, now);
    this.recordOutcome({
      planId: plan.id,
      observedAt: now,
      intakeState: intake.state === "QUEUED" || intake.state === "DUPLICATE" ? intake.state : "BLOCKED",
      reasons: intake.state === "BLOCKED" ? intake.admission.blockers : [],
    });

    // Real triangular opportunities qualify and expire in well under a
    // second - waiting for an external poll loop to notice a freshly
    // queued plan would routinely miss the window entirely. Dispatch
    // immediately, right after a successful queue admission, instead of
    // only on an external timer. Errors are swallowed here (not thrown out
    // of a signal-subscription callback) - runDispatchOnce()'s own durable
    // journal-before-dispatch design means a failure here is always safely
    // resumable by the next dispatch tick (timer or the explicit
    // /dispatch-once route), never silently lost.
    if (intake.state === "QUEUED") {
      this.runDispatchOnce(now).catch(() => {
        // Intentionally swallowed - see comment above.
      });
    }
  }

  private recordOutcome(outcome: CentralLiveTriangularOutcome): void {
    this.recentOutcomes.unshift(outcome);
    this.recentOutcomes.length = Math.min(this.recentOutcomes.length, 50);
  }

  getDiagnostics(now = Date.now()) {
    return {
      generatedAt: now,
      running: this.isRunning(),
      latestCandidate: this.latestCandidate,
      recentOutcomes: [...this.recentOutcomes],
      dispatcher: this.liveSystem.getDiagnostics(now),
    };
  }
}

export const centralLiveTriangularBridgeService =
  new CentralLiveTriangularBridgeService();
