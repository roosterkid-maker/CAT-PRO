import {
  randomUUID,
} from "node:crypto";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import type {
  MultiOpportunityPaperBatchResult,
  MultiOpportunityPaperExecutionItem,
  MultiOpportunityPaperSchedulerConfig,
  MultiOpportunityPaperSchedulerDiagnostics,
  MultiOpportunityPaperSkippedCandidate,
} from "../models/MultiOpportunityPaperScheduler";

import {
  adaptivePaperCapitalAllocatorService,
} from "./AdaptivePaperCapitalAllocatorService";

import {
  automatedPaperExecutionControllerService,
} from "./AutomatedPaperExecutionControllerService";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  shadowPerformanceAnalyticsService,
} from "./ShadowPerformanceAnalyticsService";

import {
  postGuardProfitValidationLedgerService,
  type PostGuardRouteProfitability,
} from "../../trading/services/PostGuardProfitValidationLedgerService";

import {
  paperCapitalConfigurationService,
} from "../../trading/capital/PaperCapitalConfigurationService";

import {
  strategyOneFundedRouteService,
} from "../../trading/execution/StrategyOneFundedRouteService";

import {
  compareCandidateExecutionPriority,
  rankCandidatesForExecution,
  resolveCandidateRankingEquivalentProfitInr,
} from "./ExecutionCandidateRanking";

import {
  inventoryRebalancingScoreService,
} from "../../rebalancing/services/InventoryRebalancingScoreService";

const DEFAULT_CONFIG:
  MultiOpportunityPaperSchedulerConfig = {
  maximumExecutionsPerBatch:
    3,

  maximumCandidatesConsidered:
    20,

  /*
   * This remains a hard scheduler ceiling.
   *
   * Version 16.3 may allocate LESS.
   */
  maximumCapitalPerTrade:
    1_000,

  maximumBatchCapital:
    3_000,

  maximumExchangeExposurePercent:
    70,

  minimumQualificationScore:
    85,

  minimumNetProfitPercent:
    0.5,

  maximumHistory:
    100,
};

export class MultiOpportunityPaperSchedulerService {
  private readonly configOverrides:
    Partial<MultiOpportunityPaperSchedulerConfig>;

  private readonly configProvider:
    (() => Partial<MultiOpportunityPaperSchedulerConfig>) | null;

  private get config():
    MultiOpportunityPaperSchedulerConfig {
    return {
      ...DEFAULT_CONFIG,
      ...(
        this.configProvider?.() ??
        {}
      ),
      ...this.configOverrides,
    };
  }

  private readonly recentBatches:
    MultiOpportunityPaperBatchResult[] =
    [];

  private batchInProgress =
    false;

  private totalBatches =
    0;

  private blockedReadiness =
    0;

  private blockedNotArmed =
    0;

  private accountBlocked =
    0;

  private noCandidateBatches =
    0;

  private totalExecutionAttempts =
    0;

  private totalExecuted =
    0;

  private totalRejected =
    0;

  private lastBatchAt:
    number | null =
    null;

  private lastExecutionAt:
    number | null =
    null;

  private lastBatch:
    MultiOpportunityPaperBatchResult | null =
    null;

  constructor(
    config:
      Partial<MultiOpportunityPaperSchedulerConfig> = {},

    configProvider:
      (() => Partial<MultiOpportunityPaperSchedulerConfig>) | null =
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

    allowedCandidateKeys?:
      ReadonlySet<string>,
  ): Promise<MultiOpportunityPaperBatchResult> {
    if (
      this.batchInProgress
    ) {
      return this.createImmediateResult(
        "BATCH_IN_PROGRESS",
        now,
        [
          "Another multi-opportunity PAPER batch is already running.",
        ],
      );
    }

    this.batchInProgress =
      true;

    this.totalBatches +=
      1;

    const batchNumber =
      this.totalBatches;

    const startedAt =
      now;

    try {
      const readiness =
        shadowPerformanceAnalyticsService
          .getAnalytics();

      const paperExecutionArmed =
        automatedPaperExecutionControllerService
          .isPaperExecutionArmed();

      if (
        !readiness
          .readiness
          .readyForPaperAutomation
      ) {
        this.blockedReadiness +=
          1;

        return this.completeBatch({
          id:
            randomUUID(),

          batchNumber,

          status:
            "BLOCKED_READINESS",

          startedAt,

          readinessScore:
            readiness
              .readiness
              .score,

          readinessLevel:
            readiness
              .readiness
              .level,

          paperExecutionArmed:
            paperExecutionArmed,

          candidatesConsidered:
            0,

          candidatesSelected:
            0,

          executionAttempts:
            0,

          executed:
            0,

          rejected:
            0,

          capitalScheduled:
            0,

          capitalExecuted:
            0,

          projectedExchangeCapital:
            {},

          executions: [],

          skipped: [],

          reasons: [
            "Version 16.3 adaptive PAPER scheduling is blocked because shadow performance has not reached READY_FOR_PAPER.",
            ...readiness
              .readiness
              .reasons,
          ],
        });
      }

      if (
        !paperExecutionArmed
      ) {
        this.blockedNotArmed +=
          1;

        return this.completeBatch({
          id:
            randomUUID(),

          batchNumber,

          status:
            "BLOCKED_NOT_ARMED",

          startedAt,

          readinessScore:
            readiness
              .readiness
              .score,

          readinessLevel:
            readiness
              .readiness
              .level,

          paperExecutionArmed:
            false,

          candidatesConsidered:
            0,

          candidatesSelected:
            0,

          executionAttempts:
            0,

          executed:
            0,

          rejected:
            0,

          capitalScheduled:
            0,

          capitalExecuted:
            0,

          projectedExchangeCapital:
            {},

          executions: [],

          skipped: [],

          reasons: [
            "Shadow readiness passed, but automated PAPER execution is not armed.",
            "Adaptive capital allocation did not execute any trade.",
            "Live execution remains disabled.",
          ],
        });
      }

      const account =
        tradingAccountService
          .getAccount();

      if (
        account.mode !==
          "PAPER" ||
        !account.enabled ||
        account.emergencyStop
      ) {
        this.accountBlocked +=
          1;

        return this.completeBatch({
          id:
            randomUUID(),

          batchNumber,

          status:
            "ACCOUNT_BLOCKED",

          startedAt,

          readinessScore:
            readiness
              .readiness
              .score,

          readinessLevel:
            readiness
              .readiness
              .level,

          paperExecutionArmed:
            true,

          candidatesConsidered:
            0,

          candidatesSelected:
            0,

          executionAttempts:
            0,

          executed:
            0,

          rejected:
            0,

          capitalScheduled:
            0,

          capitalExecuted:
            0,

          projectedExchangeCapital:
            {},

          executions: [],

          skipped: [],

          reasons: [
            account.mode !==
            "PAPER"
              ? `Trading account mode is ${account.mode}; PAPER mode is required.`
              : !account.enabled
                ? "Trading account is disabled."
                : "Trading account emergency stop is active.",
          ],
        });
      }

      const snapshot =
        opportunityService
          .getLastOpportunitySnapshot();

      if (
        !snapshot
      ) {
        this.noCandidateBatches +=
          1;

        return this.completeBatch({
          id:
            randomUUID(),

          batchNumber,

          status:
            "NO_CANDIDATES",

          startedAt,

          readinessScore:
            readiness
              .readiness
              .score,

          readinessLevel:
            readiness
              .readiness
              .level,

          paperExecutionArmed:
            true,

          candidatesConsidered:
            0,

          candidatesSelected:
            0,

          executionAttempts:
            0,

          executed:
            0,

          rejected:
            0,

          capitalScheduled:
            0,

          capitalExecuted:
            0,

          projectedExchangeCapital:
            {},

          executions: [],

          skipped: [],

          reasons: [
            "No authoritative opportunity snapshot is available.",
          ],
        });
      }

      const skipped:
        MultiOpportunityPaperSkippedCandidate[] =
        [];

      /*
       * One O(n) index replaces a repeated snapshot scan for every qualified
       * candidate. This is important when many markets become executable in
       * the same event-driven batch.
       */
      const opportunitiesById =
        new Map(
          snapshot
            .opportunities
            .map(
              (opportunity) => [
                opportunity.id,
                opportunity,
              ] as const,
            ),
        );

      /*
       * Read exact-route post-guard truth once per PAPER batch. Previously a
       * quarantined high-ranked route could consume one of the limited
       * selection slots and fail later in AutomatedPaperTradingService while
       * a profitable admitted route waited behind it.
       */
      const profitRoutes =
        new Map(
          postGuardProfitValidationLedgerService
            .getReport(now)
            .routes
            .map(
              (route) => [
                route.routeKey,
                route,
              ] as const,
            ),
        );

      const qualifications =
        this.rankCandidates(
          candidateQualificationService
            .getQualifiedCandidates()
            .filter(
              (
                qualification,
              ) =>
                allowedCandidateKeys ===
                  undefined ||
                allowedCandidateKeys
                  .has(
                    qualification.key,
                  ),
            ),
          profitRoutes,
        )
          .filter(
            (qualification) => {
              const route =
                profitRoutes.get(
                  this.createProfitRouteKey(
                    qualification,
                  ),
                );

              if (
                !route ||
                route.paperAdmissionAllowed
              ) {
                return true;
              }

              skipped.push(
                this.toSkipped(
                  qualification,
                  `Exact route is ${route.state} after ${route.metrics.trades} post-guard settlement(s); it was excluded before capital allocation.`,
                ),
              );

              return false;
            },
          )
          .slice(
            0,
            this.config
              .maximumCandidatesConsidered,
          );

      const selected:
        {
          qualification:
            CandidateQualificationRecord;

          capital:
            number;
        }[] =
        [];

      const projectedExchangeCapital =
        new Map<
          string,
          number
        >();

      let scheduledCapital =
        0;

      const exchangeExposureLimit =
        (
          this.config
            .maximumBatchCapital *
          this.config
            .maximumExchangeExposurePercent
        ) /
        100;

      for (
        const qualification
        of qualifications
      ) {
        if (
          selected.length >=
          this.config
            .maximumExecutionsPerBatch
        ) {
          break;
        }

        const candidate =
          qualification.candidate;

        if (
          candidate.status !==
          "ACTIVE"
        ) {
          skipped.push(
            this.toSkipped(
              qualification,
              "Candidate is not ACTIVE.",
            ),
          );

          continue;
        }

        if (
          qualification.score <
          this.config
            .minimumQualificationScore
        ) {
          skipped.push(
            this.toSkipped(
              qualification,
              `Qualification score is below ${this.config.minimumQualificationScore}.`,
            ),
          );

          continue;
        }

        if (
          candidate
            .latest
            .netProfitPercent <
          this.config
            .minimumNetProfitPercent
        ) {
          skipped.push(
            this.toSkipped(
              qualification,
              `Net profit is below ${this.config.minimumNetProfitPercent}%.`,
            ),
          );

          continue;
        }

        const attemptWindow =
          automatedPaperExecutionControllerService
            .getCandidateAttemptWindow(
              qualification,
              now,
            );

        if (
          !attemptWindow.eligible
        ) {
          skipped.push(
            this.toSkipped(
              qualification,
              `Controller attempt window rejected candidate before allocation: ${attemptWindow.reason}`,
            ),
          );

          continue;
        }

        const exactOpportunity =
          opportunitiesById.get(
            candidate
              .latestOpportunityId,
          );

        if (
          !exactOpportunity
        ) {
          skipped.push(
            this.toSkipped(
              qualification,
              "Exact latest opportunity is no longer present in the authoritative snapshot.",
            ),
          );

          continue;
        }

        const remainingBatchCapital =
          Math.max(
            0,

            this.config
              .maximumBatchCapital -
              scheduledCapital,
          );

        const buyExchange =
          candidate.buyExchange;

        const sellExchange =
          candidate.sellExchange;

        /*
         * Version 16.3
         *
         * Fixed ₹1,000 allocation is replaced
         * by adaptive sizing.
         *
         * Allocator considers:
         *
         * - qualification quality
         * - net-profit strength
         * - liquidity
         * - freshness
         * - persistence
         * - account capital
         * - batch headroom
         * - exchange concentration
         * - existing ExecutionSimulator
         */
        const allocation =
          adaptivePaperCapitalAllocatorService
            .allocate(
              qualification,

              {
                remainingBatchCapital,

                exchangeExposureLimit,

                currentBuyExchangeExposure:
                  projectedExchangeCapital
                    .get(
                      buyExchange,
                    ) ??
                  0,

                currentSellExchangeExposure:
                  projectedExchangeCapital
                    .get(
                      sellExchange,
                    ) ??
                  0,
              },

              now,
            );

        if (
          allocation.status !==
            "ALLOCATED" ||
          allocation.allocatedCapital <=
            0
        ) {
          skipped.push(
            this.toSkipped(
              qualification,
              `Adaptive capital allocation rejected candidate: ${allocation.reason}`,
            ),
          );

          continue;
        }

        /*
         * Scheduler ceiling remains an
         * independent safety gate.
         */
        const capital =
          Math.min(
            allocation
              .allocatedCapital,

            this.config
              .maximumCapitalPerTrade,

            remainingBatchCapital,
          );

        if (
          capital <=
          0
        ) {
          skipped.push(
            this.toSkipped(
              qualification,
              "Adaptive allocation left no usable batch capital.",
            ),
          );

          continue;
        }

        /*
         * Personal Strategy #1 isolated PAPER capacity boundary.
         *
         * This is deliberately evaluated before a route consumes one of the
         * limited batch slots. Current depth, fees, PAPER capital and exchange
         * rules remain authoritative; real wallets belong to separate future
         * LIVE-readiness evidence and cannot block PAPER simulation.
         */
        const funding =
          strategyOneFundedRouteService
            .evaluate({
              opportunity:
                exactOpportunity,
              requestedCapitalInr:
                capital,

              fundingBoundary:
                "ISOLATED_PAPER",
            });

        if (
          funding.state ===
            "BLOCKED" ||
          funding.executableQuantity ===
            null
        ) {
          skipped.push(
            this.toSkipped(
              qualification,
              `Isolated PAPER capacity rejected the route: ${funding.blockers.join(" | ")}`,
            ),
          );

          continue;
        }

        const projectedBuy =
          (
            projectedExchangeCapital
              .get(
                buyExchange,
              ) ??
            0
          ) +
          capital;

        const projectedSell =
          (
            projectedExchangeCapital
              .get(
                sellExchange,
              ) ??
            0
          ) +
          capital;

        /*
         * Defense in depth.
         *
         * Allocator already checked exchange
         * headroom, but scheduler verifies it
         * again before selecting the route.
         */
        if (
          projectedBuy >
            exchangeExposureLimit ||
          projectedSell >
            exchangeExposureLimit
        ) {
          skipped.push(
            this.toSkipped(
              qualification,
              `Final projected exchange exposure would exceed ${this.config.maximumExchangeExposurePercent}% of the PAPER batch-capital limit.`,
            ),
          );

          continue;
        }

        selected.push({
          qualification,

          capital:
            this.round(
              capital,
              2,
            ),
        });

        scheduledCapital +=
          capital;

        projectedExchangeCapital
          .set(
            buyExchange,
            projectedBuy,
          );

        projectedExchangeCapital
          .set(
            sellExchange,
            projectedSell,
          );
      }

      /*
       * Allocation and exchange headroom can change the expected INR result
       * among the selected set. Execute the strongest final sized candidate
       * first; stable candidate priority provides the deterministic fallback.
       */
      const resolveRebalanceBonus =
        inventoryRebalancingScoreService
          .createBonusResolver();

      selected.sort(
        (
          first,
          second,
        ) => {
          const firstExpectedProfit =
            resolveCandidateRankingEquivalentProfitInr(
              first.qualification,
              resolveRebalanceBonus(first.qualification),
              first.capital,
            );

          const secondExpectedProfit =
            resolveCandidateRankingEquivalentProfitInr(
              second.qualification,
              resolveRebalanceBonus(second.qualification),
              second.capital,
            );

          if (
            firstExpectedProfit !==
            secondExpectedProfit
          ) {
            return (
              secondExpectedProfit -
              firstExpectedProfit
            );
          }

          return compareCandidateExecutionPriority(
            first.qualification,
            second.qualification,
            (qualification) =>
              profitRoutes.get(
                this.createProfitRouteKey(
                  qualification,
                ),
              )
                ?.metrics
                .averageNetReturnPercent ??
              null,
            resolveRebalanceBonus,
          );
        },
      );

      if (
        selected.length ===
        0
      ) {
        this.noCandidateBatches +=
          1;

        return this.completeBatch({
          id:
            randomUUID(),

          batchNumber,

          status:
            "NO_CANDIDATES",

          startedAt,

          readinessScore:
            readiness
              .readiness
              .score,

          readinessLevel:
            readiness
              .readiness
              .level,

          paperExecutionArmed:
            true,

          candidatesConsidered:
            qualifications.length,

          candidatesSelected:
            0,

          executionAttempts:
            0,

          executed:
            0,

          rejected:
            0,

          capitalScheduled:
            0,

          capitalExecuted:
            0,

          projectedExchangeCapital:
            this.mapToRecord(
              projectedExchangeCapital,
            ),

          executions: [],

          skipped,

          reasons: [
            "No qualified candidate passed Version 16.3 adaptive-capital allocation and exposure gates.",
          ],
        });
      }

      /*
       * PAPER executions intentionally remain
       * sequential.
       *
       * Adaptive sizing does NOT introduce
       * parallel account mutations.
       */
      const executions:
        MultiOpportunityPaperExecutionItem[] =
        [];

      let executed =
        0;

      let rejected =
        0;

      let capitalExecuted =
        0;

      for (
        const selection
        of selected
      ) {
        this.totalExecutionAttempts +=
          1;

        const result =
          await automatedPaperExecutionControllerService
            .runCandidateWithReadiness(
              selection
                .qualification
                .key,

              selection.capital,

              readiness.readiness,
            );

        executions.push({
          candidateKey:
            selection
              .qualification
              .key,

          market:
            selection
              .qualification
              .market,

          buyExchange:
            selection
              .qualification
              .buyExchange,

          sellExchange:
            selection
              .qualification
              .sellExchange,

          requestedCapital:
            selection.capital,

          qualificationScore:
            selection
              .qualification
              .score,

          netProfitPercent:
            selection
              .qualification
              .candidate
              .latest
              .netProfitPercent,

          result,
        });

        if (
          result.status ===
            "EXECUTED" &&
          result.result
        ) {
          executed +=
            1;

          this.totalExecuted +=
            1;

          capitalExecuted +=
            result.result
              .capitalUsed;

          this.lastExecutionAt =
            Date.now();
        } else {
          rejected +=
            1;

          this.totalRejected +=
            1;
        }
      }

      let status:
        MultiOpportunityPaperBatchResult["status"];

      if (
        executed ===
        executions.length
      ) {
        status =
          "EXECUTED";
      } else if (
        executed >
        0
      ) {
        status =
          "PARTIAL";
      } else {
        status =
          "ALL_REJECTED";
      }

      return this.completeBatch({
        id:
          randomUUID(),

        batchNumber,

        status,

        startedAt,

        readinessScore:
          readiness
            .readiness
            .score,

        readinessLevel:
          readiness
            .readiness
            .level,

        paperExecutionArmed:
          true,

        candidatesConsidered:
          qualifications.length,

        candidatesSelected:
          selected.length,

        executionAttempts:
          executions.length,

        executed,

        rejected,

        capitalScheduled:
          this.round(
            scheduledCapital,
            2,
          ),

        capitalExecuted:
          this.round(
            capitalExecuted,
            12,
          ),

        projectedExchangeCapital:
          this.mapToRecord(
            projectedExchangeCapital,
          ),

        executions,

        skipped,

        reasons: [
          `Version 16.3 adaptively sized ${selected.length} PAPER candidate(s).`,
          `Total planned capital: ${this.round(scheduledCapital, 2)}.`,
          `Executed ${executed} PAPER trade(s); ${rejected} execution attempt(s) were rejected.`,
          "Existing CapitalOptimizer and ExecutionSimulator determined executable capital sizes.",
          "Executions remained sequential to preserve account integrity.",
          "Live execution remained disabled.",
        ],
      });
    } finally {
      this.batchInProgress =
        false;
    }
  }

  getDiagnostics():
    MultiOpportunityPaperSchedulerDiagnostics {
    return {
      generatedAt:
        Date.now(),

      mode:
        "PAPER",

      automaticSchedulingEnabled:
        true,

      liveExecutionAllowed:
        false,

      concurrentExecutionAllowed:
        false,

      config:
        structuredClone(
          this.config,
        ),

      batchInProgress:
        this.batchInProgress,

      totalBatches:
        this.totalBatches,

      blockedReadiness:
        this.blockedReadiness,

      blockedNotArmed:
        this.blockedNotArmed,

      accountBlocked:
        this.accountBlocked,

      noCandidateBatches:
        this.noCandidateBatches,

      totalExecutionAttempts:
        this.totalExecutionAttempts,

      totalExecuted:
        this.totalExecuted,

      totalRejected:
        this.totalRejected,

      lastBatchAt:
        this.lastBatchAt,

      lastExecutionAt:
        this.lastExecutionAt,

      lastBatch:
        this.lastBatch
          ? structuredClone(
              this.lastBatch,
            )
          : null,

      recentBatches:
        this.recentBatches.map(
          (
            batch,
          ) =>
            structuredClone(
              batch,
            ),
        ),
    };
  }

  private rankCandidates(
    qualifications:
      CandidateQualificationRecord[],

    profitRoutes:
      ReadonlyMap<
        string,
        PostGuardRouteProfitability
      >,
  ): CandidateQualificationRecord[] {
    const resolveRebalanceBonus =
      inventoryRebalancingScoreService
        .createBonusResolver();

    return rankCandidatesForExecution(
      qualifications,
      (qualification) =>
        profitRoutes.get(
          this.createProfitRouteKey(
            qualification,
          ),
        )
          ?.metrics
          .averageNetReturnPercent ??
        null,
      resolveRebalanceBonus,
    );
  }

  private createProfitRouteKey(
    qualification:
      CandidateQualificationRecord,
  ): string {
    return `${qualification.market.trim().toUpperCase()}|${qualification.buyExchange.trim().toLowerCase()}>${qualification.sellExchange.trim().toLowerCase()}`;
  }

  private toSkipped(
    qualification:
      CandidateQualificationRecord,

    reason:
      string,
  ): MultiOpportunityPaperSkippedCandidate {
    return {
      candidateKey:
        qualification.key,

      market:
        qualification.market,

      buyExchange:
        qualification.buyExchange,

      sellExchange:
        qualification.sellExchange,

      qualificationScore:
        qualification.score,

      netProfitPercent:
        qualification
          .candidate
          .latest
          .netProfitPercent,

      reason,
    };
  }

  private completeBatch(
    input:
      Omit<
        MultiOpportunityPaperBatchResult,
        "completedAt" |
        "durationMs"
      >,
  ): MultiOpportunityPaperBatchResult {
    const completedAt =
      Date.now();

    const batch:
      MultiOpportunityPaperBatchResult = {
      ...input,

      completedAt,

      durationMs:
        Math.max(
          0,

          completedAt -
            input.startedAt,
        ),
    };

    this.lastBatchAt =
      completedAt;

    this.lastBatch =
      structuredClone(
        batch,
      );

    this.recentBatches.unshift(
      structuredClone(
        batch,
      ),
    );

    if (
      this.recentBatches.length >
      this.config.maximumHistory
    ) {
      this.recentBatches.length =
        this.config.maximumHistory;
    }

    return structuredClone(
      batch,
    );
  }

  private createImmediateResult(
    status:
      MultiOpportunityPaperBatchResult["status"],

    now:
      number,

    reasons:
      string[],
  ): MultiOpportunityPaperBatchResult {
    const readiness =
      shadowPerformanceAnalyticsService
        .getAnalytics()
        .readiness;

    const controller =
      automatedPaperExecutionControllerService
        .getDiagnostics();

    return {
      id:
        randomUUID(),

      batchNumber:
        this.totalBatches,

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
        controller
          .paperExecutionArmed,

      candidatesConsidered:
        0,

      candidatesSelected:
        0,

      executionAttempts:
        0,

      executed:
        0,

      rejected:
        0,

      capitalScheduled:
        0,

      capitalExecuted:
        0,

      projectedExchangeCapital:
        {},

      executions: [],

      skipped: [],

      reasons,
    };
  }

  private mapToRecord(
    map:
      Map<
        string,
        number
      >,
  ): Record<
    string,
    number
  > {
    return Object.fromEntries(
      Array.from(
        map.entries(),
      )
        .map(
          (
            [
              exchange,
              capital,
            ],
          ) => [
            exchange,

            this.round(
              capital,
              2,
            ),
          ],
        ),
    );
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
      !Number.isInteger(
        this.config
          .maximumExecutionsPerBatch,
      ) ||
      this.config
        .maximumExecutionsPerBatch <
        1
    ) {
      throw new Error(
        "maximumExecutionsPerBatch must be a positive integer.",
      );
    }

    if (
      !Number.isInteger(
        this.config
          .maximumCandidatesConsidered,
      ) ||
      this.config
        .maximumCandidatesConsidered <
        this.config
          .maximumExecutionsPerBatch
    ) {
      throw new Error(
        "maximumCandidatesConsidered must be at least maximumExecutionsPerBatch.",
      );
    }

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
        "maximumCapitalPerTrade must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .maximumBatchCapital,
      ) ||
      this.config
        .maximumBatchCapital <=
        0
    ) {
      throw new Error(
        "maximumBatchCapital must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .maximumExchangeExposurePercent,
      ) ||
      this.config
        .maximumExchangeExposurePercent <=
        0 ||
      this.config
        .maximumExchangeExposurePercent >
        100
    ) {
      throw new Error(
        "maximumExchangeExposurePercent must be between 0 and 100.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .minimumQualificationScore,
      ) ||
      this.config
        .minimumQualificationScore <
        0 ||
      this.config
        .minimumQualificationScore >
        100
    ) {
      throw new Error(
        "minimumQualificationScore must be between 0 and 100.",
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
        "minimumNetProfitPercent must be positive.",
      );
    }

    if (
      !Number.isInteger(
        this.config.maximumHistory,
      ) ||
      this.config.maximumHistory <
        1
    ) {
      throw new Error(
        "maximumHistory must be a positive integer.",
      );
    }
  }
}

export const multiOpportunityPaperSchedulerService =
  new MultiOpportunityPaperSchedulerService(
    {},
    () => {
      const configuration =
        paperCapitalConfigurationService
          .getConfiguration();

      return {
        maximumExecutionsPerBatch:
          configuration.maximumExecutionsPerBatch,

        maximumCapitalPerTrade:
          configuration.maximumCapitalPerTrade,

        maximumBatchCapital:
          configuration.maximumBatchCapital,
      };
    },
  );
