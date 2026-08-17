import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import {
  automatedPaperTradingService,
} from "../../trading/execution/AutomatedPaperTradingService";

import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import type {
  AutomatedPaperCandidateSummary,
  AutomatedPaperCandidateAttemptWindow,
  AutomatedPaperControllerCycleResult,
  AutomatedPaperExecutionControllerConfig,
  AutomatedPaperExecutionControllerDiagnostics,
} from "../models/AutomatedPaperExecutionController";

import type {
  ShadowPerformanceAnalytics,
} from "../models/ShadowPerformanceAnalytics";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  shadowPerformanceAnalyticsService,
} from "./ShadowPerformanceAnalyticsService";

import {
  cloneStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import {
  strategyIntentService,
} from "../../strategies/bootstrap/StrategyBootstrap";

import {
  personalBotRuntimeControlService,
} from "../../strategies/services/PersonalBotRuntimeControlService";

import {
  paperCapitalConfigurationService,
} from "../../trading/capital/PaperCapitalConfigurationService";

const PAPER_CONFIRMATION =
  "ENABLE_AUTOMATED_PAPER_TRADING";

const DEFAULT_CONFIG:
  AutomatedPaperExecutionControllerConfig = {
  maximumCapitalPerTrade:
    1_000,

  minimumNetProfitPercent:
    0.5,

  maximumSnapshotAgeMs:
    7_500,

  routeCooldownMs:
    30_000,

  maximumHistory:
    250,
};

export function assessAutomatedPaperCandidateAttemptWindow(
  input: {
    candidateKey: string;
    candidateGeneration: string;
    generationAlreadyAttempted: boolean;
    lastRouteAttemptAt: number | null;
    routeCooldownMs: number;
    now: number;
  },
): AutomatedPaperCandidateAttemptWindow {
  const routeCooldownRemainingMs =
    input.lastRouteAttemptAt ===
      null
      ? 0
      : Math.max(
          0,
          input.routeCooldownMs -
            Math.max(
              0,
              input.now -
                input.lastRouteAttemptAt,
            ),
        );

  const eligible =
    !input.generationAlreadyAttempted &&
    routeCooldownRemainingMs ===
      0;

  return {
    candidateKey:
      input.candidateKey,
    candidateGeneration:
      input.candidateGeneration,
    eligible,
    generationAlreadyAttempted:
      input.generationAlreadyAttempted,
    routeCooldownRemainingMs,
    reason:
      input.generationAlreadyAttempted
        ? "This continuous candidate generation was already attempted."
        : routeCooldownRemainingMs >
            0
          ? `Route cooldown has ${routeCooldownRemainingMs} ms remaining.`
          : "Candidate generation and route attempt window are eligible.",
  };
}

export class AutomatedPaperExecutionControllerService {
  private readonly configOverrides:
    Partial<AutomatedPaperExecutionControllerConfig>;

  private readonly configProvider:
    (() => Partial<AutomatedPaperExecutionControllerConfig>) | null;

  private get config():
    AutomatedPaperExecutionControllerConfig {
    return {
      ...DEFAULT_CONFIG,
      ...(
        this.configProvider?.() ??
        {}
      ),
      ...this.configOverrides,
    };
  }

  private readonly attemptedGenerations =
    new Set<string>();

  private readonly routeLastAttemptAt =
    new Map<
      string,
      number
    >();

  private readonly recentCycles:
    AutomatedPaperControllerCycleResult[] =
    [];

  private runningCycle =
    false;

  private totalCycles =
    0;

  private blockedReadiness =
    0;

  private blockedNotArmed =
    0;

  private accountBlocked =
    0;

  private noCandidate =
    0;

  private executionAttempts =
    0;

  private executed =
    0;

  private executionRejected =
    0;

  private lastCycleAt:
    number | null =
    null;

  private lastExecutionAt:
    number | null =
    null;

  private lastCycle:
    AutomatedPaperControllerCycleResult | null =
    null;

  constructor(
    config:
      Partial<AutomatedPaperExecutionControllerConfig> = {},

    configProvider:
      (() => Partial<AutomatedPaperExecutionControllerConfig>) | null =
        null,
  ) {
    this.configOverrides = {
      ...config,
    };

    this.configProvider =
      configProvider;

    this.validateConfig();
  }

  async run(
    now =
      Date.now(),
  ): Promise<AutomatedPaperControllerCycleResult> {
    return this.runInternal(
      null,
      null,
      now,
    );
  }

  /*
   * Version 16.2
   *
   * Allows the batch scheduler to ask the
   * existing Version 16.0 controller to
   * execute ONE specific candidate.
   *
   * All original controller safety gates
   * remain active.
   */
  async runCandidate(
    candidateKey:
      string,

    requestedCapital?:
      number,

    now =
      Date.now(),
  ): Promise<AutomatedPaperControllerCycleResult> {
    const normalizedKey =
      candidateKey
        .trim();

    if (
      !normalizedKey
    ) {
      throw new Error(
        "Candidate key is required for specific paper execution.",
      );
    }

    return this.runInternal(
      normalizedKey,
      requestedCapital ??
        null,
      now,
    );
  }

  async runCandidateWithReadiness(
    candidateKey:
      string,

    requestedCapital:
      number,

    readiness:
      ShadowPerformanceAnalytics["readiness"],

    now =
      Date.now(),
  ): Promise<AutomatedPaperControllerCycleResult> {
    const normalizedKey =
      candidateKey.trim();

    if (
      !normalizedKey
    ) {
      throw new Error(
        "Candidate key is required for specific paper execution.",
      );
    }

    return this.runInternal(
      normalizedKey,
      requestedCapital,
      now,
      readiness,
    );
  }

  getDiagnostics():
    AutomatedPaperExecutionControllerDiagnostics {
    const readiness =
      shadowPerformanceAnalyticsService
        .getAnalytics()
        .readiness;

    const armed =
      this.isPaperExecutionArmed();

    return {
      generatedAt:
        Date.now(),

      mode:
        "PAPER",

      automaticEvaluationEnabled:
        true,

      paperExecutionArmed:
        armed,

      paperExecutionAllowed:
        armed &&
        readiness
          .readyForPaperAutomation,

      liveExecutionAllowed:
        false,

      confirmationVariable:
        "AUTOMATED_PAPER_TRADING_CONFIRMATION",

      config:
        structuredClone(
          this.config,
        ),

      runningCycle:
        this.runningCycle,

      totalCycles:
        this.totalCycles,

      blockedReadiness:
        this.blockedReadiness,

      blockedNotArmed:
        this.blockedNotArmed,

      accountBlocked:
        this.accountBlocked,

      noCandidate:
        this.noCandidate,

      executionAttempts:
        this.executionAttempts,

      executed:
        this.executed,

      executionRejected:
        this.executionRejected,

      attemptedCandidateGenerations:
        this.attemptedGenerations
          .size,

      lastCycleAt:
        this.lastCycleAt,

      lastExecutionAt:
        this.lastExecutionAt,

      lastCycle:
        this.lastCycle
          ? structuredClone(
              this.lastCycle,
            )
          : null,

      recentCycles:
        this.recentCycles.map(
          (
            cycle,
          ) =>
            structuredClone(
              cycle,
            ),
        ),
    };
  }

  /**
   * Lightweight control-plane read for latency-sensitive routing. This is the
   * exact flag used by diagnostics, without rebuilding historical SHADOW
   * analytics merely to decide whether the PAPER owner is armed.
   */
  isPaperExecutionArmed():
    boolean {
    return (
      personalBotRuntimeControlService
        .getControl()
        .enabled &&
      process.env
        .AUTOMATED_PAPER_TRADING_CONFIRMATION
        ?.trim() ===
      PAPER_CONFIRMATION
    );
  }

  /**
   * Read-only admission window shared with the batch scheduler. Keeping this
   * truth in the controller prevents an already-attempted generation or a
   * cooling route from consuming allocation work and a limited batch slot.
   */
  getCandidateAttemptWindow(
    qualification:
      CandidateQualificationRecord,

    now =
      Date.now(),
  ): AutomatedPaperCandidateAttemptWindow {
    const candidateGeneration =
      this.createGeneration(
        qualification,
      );

    const generationAlreadyAttempted =
      this.attemptedGenerations.has(
        candidateGeneration,
      );

    const lastRouteAttempt =
      this.routeLastAttemptAt.get(
        qualification.key,
      );

    return assessAutomatedPaperCandidateAttemptWindow({
      candidateKey:
        qualification.key,
      candidateGeneration,
      generationAlreadyAttempted,
      lastRouteAttemptAt:
        lastRouteAttempt ??
        null,
      routeCooldownMs:
        this.config.routeCooldownMs,
      now,
    });
  }

  /**
   * Return only controller cycles not yet seen by a downstream reconciler.
   * The regular diagnostics endpoint keeps its complete bounded history.
   */
  getRecentCyclesAfter(
    cycleId:
      number,
  ): AutomatedPaperControllerCycleResult[] {
    return this.recentCycles
      .filter(
        (
          cycle,
        ) =>
          cycle.cycleId >
          cycleId,
      )
      .map(
        (
          cycle,
        ) =>
          structuredClone(
            cycle,
          ),
      );
  }

  private async runInternal(
    requestedCandidateKey:
      string | null,

    requestedCapitalOverride:
      number | null,

    now:
      number,

    suppliedReadiness?:
      ShadowPerformanceAnalytics["readiness"],
  ): Promise<AutomatedPaperControllerCycleResult> {
    if (
      this.runningCycle
    ) {
      return this.createImmediateResult(
        "CYCLE_IN_PROGRESS",
        now,
        [
          "Another automated paper execution controller cycle is already running.",
        ],
      );
    }

    this.runningCycle =
      true;

    this.totalCycles +=
      1;

    const cycleId =
      this.totalCycles;

    const startedAt =
      now;

    try {
      const performance =
        suppliedReadiness ===
          undefined
          ? shadowPerformanceAnalyticsService
              .getAnalytics()
          : {
              readiness:
                suppliedReadiness,
            };

      /*
       * Gate 1:
       * Shadow performance evidence.
       */
      if (
        !performance
          .readiness
          .readyForPaperAutomation
      ) {
        this.blockedReadiness +=
          1;

        return this.completeCycle({
          cycleId,

          status:
            "BLOCKED_READINESS",

          startedAt,

          readinessScore:
            performance
              .readiness
              .score,

          readinessLevel:
            performance
              .readiness
              .level,

          paperExecutionArmed:
            this.isPaperExecutionArmed(),

          requestedCapital:
            null,

          candidate:
            null,

          result:
            null,

          reasons: [
            "Automated paper execution is blocked because shadow performance has not reached READY_FOR_PAPER.",
            ...performance
              .readiness
              .reasons,
          ],
        });
      }

      /*
       * Gate 2:
       * Explicit PAPER automation arm.
       */
      if (
        !this.isPaperExecutionArmed()
      ) {
        this.blockedNotArmed +=
          1;

        return this.completeCycle({
          cycleId,

          status:
            "BLOCKED_NOT_ARMED",

          startedAt,

          readinessScore:
            performance
              .readiness
              .score,

          readinessLevel:
            performance
              .readiness
              .level,

          paperExecutionArmed:
            false,

          requestedCapital:
            null,

          candidate:
            null,

          result:
            null,

          reasons: [
            "Shadow performance is ready for paper automation, but automated PAPER execution has not been explicitly armed.",
            `Set AUTOMATED_PAPER_TRADING_CONFIRMATION=${PAPER_CONFIRMATION} only when automated PAPER execution is intentionally required.`,
            "Live execution remains disabled.",
          ],
        });
      }

      const account =
        tradingAccountService
          .getAccount();

      if (
        account.mode !==
        "PAPER"
      ) {
        this.accountBlocked +=
          1;

        return this.completeCycle({
          cycleId,

          status:
            "ACCOUNT_BLOCKED",

          startedAt,

          readinessScore:
            performance
              .readiness
              .score,

          readinessLevel:
            performance
              .readiness
              .level,

          paperExecutionArmed:
            true,

          requestedCapital:
            null,

          candidate:
            null,

          result:
            null,

          reasons: [
            `Automated paper controller requires account mode PAPER. Current mode: ${account.mode}.`,
          ],
        });
      }

      const snapshot =
        opportunityService
          .getLastOpportunitySnapshot();

      if (
        !snapshot
      ) {
        this.noCandidate +=
          1;

        return this.completeCycle({
          cycleId,

          status:
            "NO_CANDIDATE",

          startedAt,

          readinessScore:
            performance
              .readiness
              .score,

          readinessLevel:
            performance
              .readiness
              .level,

          paperExecutionArmed:
            true,

          requestedCapital:
            null,

          candidate:
            null,

          result:
            null,

          reasons: [
            "No authoritative opportunity snapshot is currently available.",
          ],
        });
      }

      const snapshotAgeMs =
        Math.max(
          0,

          now -
            snapshot.generatedAt,
        );

      if (
        snapshotAgeMs >
        this.config
          .maximumSnapshotAgeMs
      ) {
        this.noCandidate +=
          1;

        return this.completeCycle({
          cycleId,

          status:
            "NO_CANDIDATE",

          startedAt,

          readinessScore:
            performance
              .readiness
              .score,

          readinessLevel:
            performance
              .readiness
              .level,

          paperExecutionArmed:
            true,

          requestedCapital:
            null,

          candidate:
            null,

          result:
            null,

          reasons: [
            `Opportunity snapshot is ${snapshotAgeMs} ms old, above the ${this.config.maximumSnapshotAgeMs} ms paper-controller limit.`,
          ],
        });
      }

      const selected =
        this.selectCandidate(
          candidateQualificationService
            .getQualifiedCandidates(),

          snapshot.opportunities,

          now,

          requestedCandidateKey,
        );

      if (
        !selected
      ) {
        this.noCandidate +=
          1;

        return this.completeCycle({
          cycleId,

          status:
            "NO_CANDIDATE",

          startedAt,

          readinessScore:
            performance
              .readiness
              .score,

          readinessLevel:
            performance
              .readiness
              .level,

          paperExecutionArmed:
            true,

          requestedCapital:
            null,

          candidate:
            null,

          result:
            null,

          reasons: [
            requestedCandidateKey
              ? `Requested candidate ${requestedCandidateKey} is not currently eligible for automated PAPER execution.`
              : "No currently QUALIFIED candidate passed Version 16.0 paper execution gates.",

            `Minimum required net profit is ${this.config.minimumNetProfitPercent}%.`,

            "Previously attempted continuous candidate generations are not retried until they disappear and reappear.",

            "Route cooldown protection remains active.",
          ],
        });
      }

      const capitalResolution =
        this.resolveCapital(
          requestedCapitalOverride,
        );

      if (
        capitalResolution
          .reasons
          .length >
        0
      ) {
        this.accountBlocked +=
          1;

        return this.completeCycle({
          cycleId,

          status:
            "ACCOUNT_BLOCKED",

          startedAt,

          readinessScore:
            performance
              .readiness
              .score,

          readinessLevel:
            performance
              .readiness
              .level,

          paperExecutionArmed:
            true,

          requestedCapital:
            capitalResolution
              .capital,

          candidate:
            this.toCandidateSummary(
              selected.qualification,
              selected.opportunity,
            ),

          result:
            null,

          reasons:
            capitalResolution
              .reasons,
        });
      }

      const requestedCapital =
        capitalResolution
          .capital;

      const accountCheck =
        tradingAccountService
          .evaluateTrade(
            requestedCapital,
          );

      if (
        !accountCheck.approved
      ) {
        this.accountBlocked +=
          1;

        return this.completeCycle({
          cycleId,

          status:
            "ACCOUNT_BLOCKED",

          startedAt,

          readinessScore:
            performance
              .readiness
              .score,

          readinessLevel:
            performance
              .readiness
              .level,

          paperExecutionArmed:
            true,

          requestedCapital,

          candidate:
            this.toCandidateSummary(
              selected.qualification,
              selected.opportunity,
            ),

          result:
            null,

          reasons:
            accountCheck.reasons,
        });
      }

      const generation =
        this.createGeneration(
          selected.qualification,
        );

      /*
       * One execution attempt per continuous
       * candidate generation.
       */
      this.attemptedGenerations
        .add(
          generation,
        );

      this.routeLastAttemptAt
        .set(
          selected
            .qualification
            .key,

          now,
        );

      this.executionAttempts +=
        1;

      const intentProposal =
        strategyIntentService
          .proposePaper({
            strategyAttribution:
              selected
                .qualification
                .candidate
                .strategyAttribution,
            sourceOpportunityId:
              selected
                .opportunity
                .id,
            candidateGeneration:
              generation,
            market:
              selected
                .opportunity
                .pair
                .market,
            buyExchange:
              selected
                .opportunity
                .pair
                .buy
                .exchange,
            sellExchange:
              selected
                .opportunity
                .pair
                .sell
                .exchange,
            proposedCapital:
              requestedCapital,
            createdAt:
              now,
            expiresAt:
              now +
              Math.max(
                1,
                this.config
                  .maximumSnapshotAgeMs -
                  snapshotAgeMs,
              ),
          });

      const executionAttribution =
        intentProposal
          .strategyAttribution;

      const execution =
        await automatedPaperTradingService
          .execute({
            strategyAttribution:
              cloneStrategyAttribution(
                executionAttribution,
              ),

            opportunity:
              selected.opportunity,

            requestedCapital,
          });

      if (
        !execution.approved ||
        !execution.result
      ) {
        this.executionRejected +=
          1;

        return this.completeCycle({
          cycleId,

          status:
            "EXECUTION_REJECTED",

          startedAt,

          readinessScore:
            performance
              .readiness
              .score,

          readinessLevel:
            performance
              .readiness
              .level,

          paperExecutionArmed:
            true,

          requestedCapital,

          candidate:
            this.toCandidateSummary(
              selected.qualification,
              selected.opportunity,
              executionAttribution,
            ),

          result:
            execution.result,

          reasons: [
            "Candidate reached the automated PAPER execution layer but the existing trading pipeline rejected execution.",
            execution.lifecycle
              ?.status ===
              "RECOVERY_REQUIRED"
              ? "Incomplete PAPER legs were reconciled and handed to shared recovery; realized P&L was not booked."
              : "Rejected execution did not become a completed PAPER trade.",
            ...execution.reasons,
          ],
        });
      }

      this.executed +=
        1;

      this.lastExecutionAt =
        Date.now();

      return this.completeCycle({
        cycleId,

        status:
          "EXECUTED",

        startedAt,

        readinessScore:
          performance
            .readiness
            .score,

        readinessLevel:
          performance
            .readiness
            .level,

        paperExecutionArmed:
          true,

        requestedCapital,

        candidate:
          this.toCandidateSummary(
            selected.qualification,
            selected.opportunity,
            executionAttribution,
          ),

        result:
          execution.result,

        reasons: [
          "Qualified candidate passed automated PAPER execution gates.",
          "Existing AutomatedPaperTradingService executed the PAPER trade.",
          "Paper account and paper trade store were updated by the existing trading pipeline.",
          intentProposal.intent
            ? "A non-authorizing StrategyIntent was attached as proposal evidence after all existing PAPER eligibility gates passed."
            : "No StrategyIntent was fabricated because the candidate did not carry explicit strategy attribution.",
          "No live exchange order was submitted.",
          ...execution.reasons,
        ],
      });
    } catch (
      error:
        unknown
    ) {
      this.executionRejected +=
        1;

      const readiness =
        shadowPerformanceAnalyticsService
          .getAnalytics()
          .readiness;

      return this.completeCycle({
        cycleId,

        status:
          "EXECUTION_REJECTED",

        startedAt,

        readinessScore:
          readiness.score,

        readinessLevel:
          readiness.level,

        paperExecutionArmed:
          this.isPaperExecutionArmed(),

        requestedCapital:
          requestedCapitalOverride,

        candidate:
          null,

        result:
          null,

        reasons: [
          error instanceof Error
            ? error.message
            : "Unknown automated paper execution controller error.",
        ],
      });
    } finally {
      this.runningCycle =
        false;
    }
  }

  private selectCandidate(
    qualifications:
      CandidateQualificationRecord[],

    opportunities:
      ArbitrageOpportunity[],

    now:
      number,

    requestedCandidateKey:
      string | null,
  ): {
    qualification:
      CandidateQualificationRecord;

    opportunity:
      ArbitrageOpportunity;
  } | null {
    for (
      const qualification
      of qualifications
    ) {
      if (
        requestedCandidateKey &&
        qualification.key !==
          requestedCandidateKey
      ) {
        continue;
      }

      if (
        !qualification.qualified
      ) {
        continue;
      }

      if (
        qualification
          .candidate
          .status !==
        "ACTIVE"
      ) {
        continue;
      }

      if (
        qualification
          .candidate
          .latest
          .netProfitPercent <
        this.config
          .minimumNetProfitPercent
      ) {
        continue;
      }

      if (
        !this
          .getCandidateAttemptWindow(
            qualification,
            now,
          )
          .eligible
      ) {
        continue;
      }

      const opportunity =
        opportunities.find(
          (
            candidate,
          ) =>
            candidate.id ===
              qualification
                .candidate
                .latestOpportunityId &&
            this.createOpportunityKey(
              candidate,
            ) ===
              qualification.key,
        );

      if (
        !opportunity
      ) {
        continue;
      }

      if (
        !opportunity
          .quotesAreFresh
      ) {
        continue;
      }

      if (
        opportunity
          .usedLastPriceFallback
      ) {
        continue;
      }

      if (
        opportunity
          .netProfitPercent <
        this.config
          .minimumNetProfitPercent
      ) {
        continue;
      }

      return {
        qualification,
        opportunity,
      };
    }

    return null;
  }

  private resolveCapital(
    requestedCapitalOverride:
      number | null,
  ): {
    capital: number;

    reasons: string[];
  } {
    const account =
      tradingAccountService
        .getAccount();

    if (
      requestedCapitalOverride !==
      null
    ) {
      const reasons:
        string[] =
        [];

      if (
        !Number.isFinite(
          requestedCapitalOverride,
        ) ||
        requestedCapitalOverride <=
          0
      ) {
        reasons.push(
          "Requested PAPER capital must be positive.",
        );
      }

      if (
        requestedCapitalOverride >
        this.config
          .maximumCapitalPerTrade
      ) {
        reasons.push(
          `Version 16.0 maximum automated PAPER capital per trade is ${this.config.maximumCapitalPerTrade}.`,
        );
      }

      if (
        requestedCapitalOverride >
        account
          .limits
          .maximumCapitalPerTrade
      ) {
        reasons.push(
          "Trading account maximum capital per trade would be exceeded.",
        );
      }

      if (
        requestedCapitalOverride >
        account.availableCapital
      ) {
        reasons.push(
          "Insufficient available PAPER capital.",
        );
      }

      return {
        capital:
          this.round(
            requestedCapitalOverride,
            2,
          ),

        reasons,
      };
    }

    const capital =
      Math.min(
        this.config
          .maximumCapitalPerTrade,

        account
          .limits
          .maximumCapitalPerTrade,

        account
          .availableCapital,
      );

    if (
      !Number.isFinite(
        capital,
      ) ||
      capital <=
        0
    ) {
      return {
        capital:
          0,

        reasons: [
          "No positive PAPER capital is available for automated execution.",
        ],
      };
    }

    return {
      capital:
        this.round(
          capital,
          2,
        ),

      reasons: [],
    };
  }

  private toCandidateSummary(
    qualification:
      CandidateQualificationRecord,

    opportunity:
      ArbitrageOpportunity,

    strategyAttribution =
      qualification
        .candidate
        .strategyAttribution,
  ): AutomatedPaperCandidateSummary {
    const candidate =
      qualification.candidate;

    return {
      strategyAttribution:
        cloneStrategyAttribution(
          strategyAttribution,
        ),

      candidateKey:
        qualification.key,

      candidateGeneration:
        this.createGeneration(
          qualification,
        ),

      opportunityId:
        opportunity.id,

      market:
        opportunity
          .pair
          .market,

      buyExchange:
        opportunity
          .pair
          .buy
          .exchange,

      sellExchange:
        opportunity
          .pair
          .sell
          .exchange,

      qualificationScore:
        qualification.score,

      netProfitPercent:
        opportunity
          .netProfitPercent,

      liquidityScore:
        opportunity
          .liquidityScore,

      freshnessScore:
        opportunity
          .freshnessScore,

      consecutiveObservations:
        candidate
          .consecutiveObservations,

      persistenceMs:
        Math.max(
          candidate
            .lifetimeMs,

          Date.now() -
            candidate
              .firstSeenAt,
        ),
    };
  }

  private createGeneration(
    qualification:
      CandidateQualificationRecord,
  ): string {
    const candidate =
      qualification.candidate;

    return [
      candidate.key,
      candidate.firstSeenAt,
      candidate.reappearances,
    ].join(
      "|",
    );
  }

  private createOpportunityKey(
    opportunity:
      ArbitrageOpportunity,
  ): string {
    return [
      opportunity
        .pair
        .market
        .trim()
        .toUpperCase(),

      opportunity
        .pair
        .buy
        .exchange
        .trim()
        .toLowerCase(),

      opportunity
        .pair
        .sell
        .exchange
        .trim()
        .toLowerCase(),
    ].join(
      "|",
    );
  }

  private completeCycle(
    input:
      Omit<
        AutomatedPaperControllerCycleResult,
        "completedAt" |
        "durationMs"
      >,
  ): AutomatedPaperControllerCycleResult {
    const completedAt =
      Date.now();

    const result:
      AutomatedPaperControllerCycleResult = {
      ...input,

      completedAt,

      durationMs:
        Math.max(
          0,

          completedAt -
            input.startedAt,
        ),
    };

    this.lastCycleAt =
      completedAt;

    this.lastCycle =
      structuredClone(
        result,
      );

    this.recentCycles.unshift(
      structuredClone(
        result,
      ),
    );

    if (
      this.recentCycles.length >
      this.config.maximumHistory
    ) {
      this.recentCycles.length =
        this.config.maximumHistory;
    }

    return structuredClone(
      result,
    );
  }

  private createImmediateResult(
    status:
      AutomatedPaperControllerCycleResult["status"],

    now:
      number,

    reasons:
      string[],
  ): AutomatedPaperControllerCycleResult {
    const readiness =
      shadowPerformanceAnalyticsService
        .getAnalytics()
        .readiness;

    return {
      cycleId:
        this.totalCycles,

      status,

      startedAt:
        now,

      completedAt:
        now,

      durationMs:
        0,

      readinessScore:
        readiness.score,

      readinessLevel:
        readiness.level,

      paperExecutionArmed:
        this.isPaperExecutionArmed(),

      requestedCapital:
        null,

      candidate:
        null,

      result:
        null,

      reasons,
    };
  }

  private round(
    value:
      number,

    digits:
      number,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    const multiplier =
      10 **
      digits;

    return (
      Math.round(
        (
          value +
          Number.EPSILON
        ) *
          multiplier,
      ) /
      multiplier
    );
  }

  private validateConfig():
    void {
    if (
      !Number.isFinite(
        this.config
          .maximumCapitalPerTrade,
      ) ||
      this.config
        .maximumCapitalPerTrade <=
        0
    ) {
      throw new Error(
        "Paper controller maximumCapitalPerTrade must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .minimumNetProfitPercent,
      ) ||
      this.config
        .minimumNetProfitPercent <=
        0
    ) {
      throw new Error(
        "Paper controller minimumNetProfitPercent must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .maximumSnapshotAgeMs,
      ) ||
      this.config
        .maximumSnapshotAgeMs <=
        0
    ) {
      throw new Error(
        "Paper controller maximumSnapshotAgeMs must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .routeCooldownMs,
      ) ||
      this.config
        .routeCooldownMs <
        0
    ) {
      throw new Error(
        "Paper controller routeCooldownMs must be zero or greater.",
      );
    }

    if (
      !Number.isInteger(
        this.config
          .maximumHistory,
      ) ||
      this.config
        .maximumHistory <
        1
    ) {
      throw new Error(
        "Paper controller maximumHistory must be a positive integer.",
      );
    }
  }
}

export const automatedPaperExecutionControllerService =
  new AutomatedPaperExecutionControllerService(
    {},
    () => ({
      maximumCapitalPerTrade:
        paperCapitalConfigurationService
          .getConfiguration()
          .maximumCapitalPerTrade,
    }),
  );
