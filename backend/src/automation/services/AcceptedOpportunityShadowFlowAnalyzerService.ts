import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import type {
  ExecutionCandidateQueueItem,
} from "../models/ExecutionCandidateQueue";

import type {
  MonitoredOpportunityCandidate,
} from "../models/OpportunityMonitor";

import type {
  ShadowDispatchRecord,
} from "../models/ShadowExecutionDispatcher";

import type {
  ShadowTradeOutcomeRecord,
} from "../models/ShadowTradeOutcome";

import type {
  AcceptedOpportunityShadowFlowReport,
  AcceptedOpportunityShadowFlowStatus,
  AcceptedOpportunityShadowFlowTrace,
} from "../models/AcceptedOpportunityShadowFlow";

import {
  automationSchedulerService,
} from "./AutomationSchedulerService";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  executionCandidateQueueService,
} from "./ExecutionCandidateQueueService";

import {
  opportunityMonitorService,
} from "./OpportunityMonitorService";

import {
  shadowExecutionDispatcherService,
} from "./ShadowExecutionDispatcherService";

import {
  shadowTradeOutcomeTrackerService,
} from "./ShadowTradeOutcomeTrackerService";

const MAXIMUM_TRACE_COUNT =
  50;

export class AcceptedOpportunityShadowFlowAnalyzerService {
  getReport():
    AcceptedOpportunityShadowFlowReport {
    const snapshot =
      opportunityService
        .getLastOpportunitySnapshot();

    const monitor =
      opportunityMonitorService
        .getDiagnostics();

    const qualification =
      candidateQualificationService
        .getDiagnostics();

    const queue =
      executionCandidateQueueService
        .getDiagnostics();

    const dispatcher =
      shadowExecutionDispatcherService
        .getDiagnostics();

    const outcomes =
      shadowTradeOutcomeTrackerService
        .getDiagnostics();

    const scheduler =
      automationSchedulerService
        .getDiagnostics();

    /*
     * Current accepted opportunities indexed
     * using the exact same logical key format
     * as OpportunityMonitorService:
     *
     * MARKET|buyExchange|sellExchange
     */
    const currentByKey =
      new Map<
        string,
        ArbitrageOpportunity
      >();

    for (
      const opportunity
      of snapshot
        ?.opportunities ??
        []
    ) {
      currentByKey.set(
        this.opportunityKey(
          opportunity,
        ),

        opportunity,
      );
    }

    const monitorByKey =
      new Map(
        monitor
          .candidates
          .map(
            (
              candidate,
            ) =>
              [
                candidate.key,
                candidate,
              ] as const,
          ),
      );

    const qualificationByKey =
      new Map(
        qualification
          .qualifications
          .map(
            (
              record,
            ) =>
              [
                record.key,
                record,
              ] as const,
          ),
      );

    /*
     * Diagnostics arrays are already sorted
     * newest/highest-priority first.
     *
     * First record for each candidate key is
     * therefore the relevant current/latest
     * pipeline record.
     */
    const queueByKey =
      this.latestByCandidateKey(
        queue.items,
      );

    const dispatchByKey =
      this.latestByCandidateKey(
        dispatcher.records,
      );

    const outcomeByKey =
      this.latestByCandidateKey(
        outcomes.records,
      );

    /*
     * Always include:
     *
     * 1. every CURRENT accepted route
     * 2. every ACTIVE monitored candidate
     *
     * This lets us diagnose a route that was
     * accepted seconds ago but disappeared from
     * the latest engine frame.
     */
    const keys =
      new Set<string>(
        currentByKey.keys(),
      );

    for (
      const candidate
      of monitor.candidates
    ) {
      if (
        candidate.status ===
        "ACTIVE"
      ) {
        keys.add(
          candidate.key,
        );
      }
    }

    const traces =
      Array.from(
        keys,
      )
        .map(
          (
            key,
          ) =>
            this.buildTrace(
              key,

              currentByKey.get(
                key,
              ) ??
                null,

              monitorByKey.get(
                key,
              ) ??
                null,

              qualificationByKey.get(
                key,
              ) ??
                null,

              queueByKey.get(
                key,
              ) ??
                null,

              dispatchByKey.get(
                key,
              ) ??
                null,

              outcomeByKey.get(
                key,
              ) ??
                null,
            ),
        )
        .sort(
          (
            first,
            second,
          ) => {
            if (
              first.currentAccepted !==
              second.currentAccepted
            ) {
              return first
                .currentAccepted
                ? -1
                : 1;
            }

            return (
              second
                .currentNetProfitPercent ??
              Number.NEGATIVE_INFINITY
            ) -
              (
                first
                  .currentNetProfitPercent ??
                Number.NEGATIVE_INFINITY
              );
          },
        )
        .slice(
          0,
          MAXIMUM_TRACE_COUNT,
        );

    const primaryBottleneck =
      this.primaryBottleneck(
        traces,
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "17.4",

      build:
        "3",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      summary: {
        currentAcceptedOpportunities:
          snapshot
            ?.opportunities
            .length ??
          0,

        monitoredCandidates:
          monitor
            .candidates
            .length,

        activeMonitoredCandidates:
          monitor
            .activeCandidates,

        qualifiedCandidates:
          qualification
            .qualified,

        readyQueueItems:
          queue.ready,

        shadowDispatches:
          dispatcher
            .totalDispatched,

        trackedOutcomes:
          outcomes
            .trackedDispatches,

        schedulerRunning:
          scheduler.running,

        schedulerCyclesWithOpportunity:
          scheduler
            .cyclesWithOpportunity,

        schedulerCyclesWithoutOpportunity:
          scheduler
            .cyclesWithoutOpportunity,
      },

      /*
       * Report actual current config.
       *
       * We do NOT duplicate or guess threshold
       * values inside this analyzer.
       */
      qualificationConfig:
        structuredClone(
          qualification.config,
        ),

      primaryBottleneck,

      traces,

      observations: [
        `Latest opportunity snapshot contains ${snapshot?.opportunities.length ?? 0} accepted opportunity route(s).`,

        `Opportunity monitor currently has ${monitor.activeCandidates} ACTIVE candidate(s), ${qualification.qualified} QUALIFIED candidate(s), and ${queue.ready} READY queue item(s).`,

        `Shadow dispatcher has recorded ${dispatcher.totalDispatched} dispatch(es); outcome tracker has ${outcomes.trackedDispatches} tracked dispatch(es).`,

        `Primary downstream bottleneck: ${primaryBottleneck}.`,

        "The analyzer is read-only. It does not modify persistence, qualification, queue TTL, shadow dispatch, paper, or LIVE policies.",
      ],
    };
  }

  private buildTrace(
    key:
      string,

    opportunity:
      ArbitrageOpportunity | null,

    candidate:
      MonitoredOpportunityCandidate | null,

    qualification:
      CandidateQualificationRecord | null,

    queue:
      ExecutionCandidateQueueItem | null,

    dispatch:
      ShadowDispatchRecord | null,

    outcome:
      ShadowTradeOutcomeRecord | null,
  ): AcceptedOpportunityShadowFlowTrace {
    const failedChecks =
      qualification
        ? Object.entries(
            qualification.checks,
          )
            .filter(
              (
                [
                  ,
                  check,
                ],
              ) =>
                !check.passed,
            )
            .map(
              (
                [
                  name,
                ],
              ) =>
                name,
            )
        : [];

    const flow =
      this.resolveFlow(
        candidate,

        qualification,

        queue,

        dispatch,

        outcome,
      );

    const parsed =
      this.parseKey(
        key,
      );

    return {
      candidateKey:
        key,

      market:
        opportunity
          ?.pair
          .market
          .trim()
          .toUpperCase() ??
        candidate
          ?.market ??
        parsed.market,

      buyExchange:
        opportunity
          ?.pair
          .buy
          .exchange
          .trim()
          .toLowerCase() ??
        candidate
          ?.buyExchange ??
        parsed.buyExchange,

      sellExchange:
        opportunity
          ?.pair
          .sell
          .exchange
          .trim()
          .toLowerCase() ??
        candidate
          ?.sellExchange ??
        parsed.sellExchange,

      currentAccepted:
        opportunity !==
        null,

      currentOpportunityId:
        opportunity
          ?.id ??
        null,

      currentNetProfitPercent:
        opportunity
          ?.netProfitPercent ??
        null,

      currentLiquidityScore:
        opportunity
          ?.liquidityScore ??
        null,

      currentFreshnessScore:
        opportunity
          ?.freshnessScore ??
        null,

      flowStatus:
        flow.status,

      bottleneck:
        flow.bottleneck,

      monitor: {
        found:
          candidate !==
          null,

        status:
          candidate
            ?.status ??
          null,

        firstSeenAt:
          candidate
            ?.firstSeenAt ??
          null,

        lastSeenAt:
          candidate
            ?.lastSeenAt ??
          null,

        lifetimeMs:
          candidate
            ?.lifetimeMs ??
          null,

        totalObservations:
          candidate
            ?.totalObservations ??
          null,

        consecutiveObservations:
          candidate
            ?.consecutiveObservations ??
          null,

        reappearances:
          candidate
            ?.reappearances ??
          null,

        latestOpportunityId:
          candidate
            ?.latestOpportunityId ??
          null,

        latestNetProfitPercent:
          candidate
            ?.latest
            .netProfitPercent ??
          null,

        bestNetProfitPercent:
          candidate
            ?.best
            .netProfitPercent ??
          null,
      },

      qualification: {
        found:
          qualification !==
          null,

        status:
          qualification
            ?.status ??
          null,

        qualified:
          qualification
            ?.qualified ??
          false,

        score:
          qualification
            ?.score ??
          null,

        profitDrawdownPercent:
          qualification
            ?.profitDrawdownPercent ??
          null,

        checks:
          qualification
            ? structuredClone(
                qualification
                  .checks,
              )
            : null,

        failedChecks,

        reasons:
          qualification
            ? structuredClone(
                qualification
                  .reasons,
              )
            : [],
      },

      queue: {
        found:
          queue !==
          null,

        id:
          queue
            ?.id ??
          null,

        status:
          queue
            ?.status ??
          null,

        priorityScore:
          queue
            ?.priorityScore ??
          null,

        enqueuedAt:
          queue
            ?.enqueuedAt ??
          null,

        expiresAt:
          queue
            ?.expiresAt ??
          null,

        renewals:
          queue
            ?.renewals ??
          null,

        reason:
          queue
            ?.reason ??
          null,
      },

      shadowDispatch: {
        found:
          dispatch !==
          null,

        id:
          dispatch
            ?.id ??
          null,

        status:
          dispatch
            ?.status ??
          null,

        candidateGeneration:
          dispatch
            ?.candidateGeneration ??
          null,

        dispatchedAt:
          dispatch
            ?.dispatchedAt ??
          null,

        reasons:
          dispatch
            ? structuredClone(
                dispatch
                  .reasons,
              )
            : [],
      },

      outcome: {
        found:
          outcome !==
          null,

        status:
          outcome
            ?.status ??
          null,

        totalSamples:
          outcome
            ?.totalSamples ??
          null,

        freshSamples:
          outcome
            ?.freshSamples ??
          null,

        executableSamples:
          outcome
            ?.executableSamples ??
          null,

        profitableSamples:
          outcome
            ?.profitableSamples ??
          null,

        averageObservedNetProfit:
          outcome
            ?.averageObservedNetProfit ??
          null,

        finalReason:
          outcome
            ?.finalReason ??
          null,
      },
    };
  }

  private resolveFlow(
    candidate:
      MonitoredOpportunityCandidate | null,

    qualification:
      CandidateQualificationRecord | null,

    queue:
      ExecutionCandidateQueueItem | null,

    dispatch:
      ShadowDispatchRecord | null,

    outcome:
      ShadowTradeOutcomeRecord | null,
  ): {
    status:
      AcceptedOpportunityShadowFlowStatus;

    bottleneck:
      string;
  } {
    /*
     * Furthest downstream evidence wins.
     */
    if (
      outcome
    ) {
      switch (
        outcome.status
      ) {
        case "TRACKING":
          return {
            status:
              "OUTCOME_TRACKING",

            bottleneck:
              "NONE_SHADOW_TRACKING",
          };

        case "SUCCESS":
          return {
            status:
              "OUTCOME_SUCCESS",

            bottleneck:
              "NONE_SHADOW_SUCCESS",
          };

        case "FAILED":
          return {
            status:
              "OUTCOME_FAILED",

            bottleneck:
              "SHADOW_OUTCOME_FAILED",
          };

        case "DATA_UNAVAILABLE":
          return {
            status:
              "OUTCOME_DATA_UNAVAILABLE",

            bottleneck:
              "SHADOW_DATA_UNAVAILABLE",
          };
      }
    }

    if (
      dispatch
    ) {
      if (
        dispatch.status ===
        "SHADOW_DISPATCHED"
      ) {
        return {
          status:
            "SHADOW_DISPATCHED",

          bottleneck:
            "OUTCOME_NOT_TRACKED_YET",
        };
      }

      if (
        dispatch.status ===
        "REVALIDATION_FAILED"
      ) {
        return {
          status:
            "SHADOW_REVALIDATION_FAILED",

          bottleneck:
            "SHADOW_REVALIDATION",
        };
      }

      return {
        status:
          "SHADOW_DUPLICATE_SUPPRESSED",

        bottleneck:
          "DUPLICATE_GENERATION",
      };
    }

    if (
      queue
    ) {
      if (
        queue.status ===
        "READY"
      ) {
        return {
          status:
            "QUEUED_READY",

          bottleneck:
            "SHADOW_DISPATCH_PENDING",
        };
      }

      return {
        status:
          "QUEUE_TERMINAL",

        bottleneck:
          `QUEUE_${queue.status}`,
      };
    }

    if (
      qualification
    ) {
      if (
        qualification.status ===
        "QUALIFIED"
      ) {
        return {
          status:
            "QUALIFIED_NOT_QUEUED",

          bottleneck:
            "QUEUE_SYNCHRONIZATION",
        };
      }

      if (
        qualification.status ===
          "REJECTED" ||
        qualification.status ===
          "EXPIRED"
      ) {
        const failed =
          Object.entries(
            qualification.checks,
          )
            .filter(
              (
                [
                  ,
                  check,
                ],
              ) =>
                !check.passed,
            )
            .map(
              (
                [
                  name,
                ],
              ) =>
                name,
            )
            .join(
              ",",
            );

        return {
          status:
            "QUALIFICATION_REJECTED",

          bottleneck:
            failed
              ? `QUALIFICATION:${failed}`
              : `QUALIFICATION:${qualification.status}`,
        };
      }

      /*
       * OBSERVING means quality currently passes,
       * but persistence and/or observation count
       * has not matured yet.
       */
      return {
        status:
          "OBSERVING",

        bottleneck:
          "PERSISTENCE_OBSERVATION",
      };
    }

    if (
      candidate
    ) {
      return {
        status:
          "OBSERVING",

        bottleneck:
          "QUALIFICATION_NOT_EVALUATED",
      };
    }

    return {
      status:
        "NOT_MONITORED",

      bottleneck:
        "OPPORTUNITY_MONITOR",
    };
  }

  private primaryBottleneck(
    traces:
      AcceptedOpportunityShadowFlowTrace[],
  ): string {
    if (
      traces.length ===
      0
    ) {
      return "NO_ACCEPTED_OR_ACTIVE_CANDIDATE";
    }

    const counts =
      new Map<
        string,
        number
      >();

    /*
     * Primary bottleneck should describe CURRENT
     * accepted opportunities, not historical
     * disappeared candidates.
     */
    for (
      const trace
      of traces
    ) {
      if (
        !trace.currentAccepted
      ) {
        continue;
      }

      counts.set(
        trace.bottleneck,

        (
          counts.get(
            trace.bottleneck,
          ) ??
          0
        ) +
          1,
      );
    }

    if (
      counts.size ===
      0
    ) {
      return "NO_CURRENT_ACCEPTED_OPPORTUNITY";
    }

    return Array.from(
      counts.entries(),
    )
      .sort(
        (
          first,
          second,
        ) =>
          second[1] -
          first[1],
      )[0]
      ?.[0] ??
      "UNKNOWN";
  }

  private latestByCandidateKey<
    T extends {
      candidateKey:
        string;
    },
  >(
    records:
      T[],
  ): Map<
    string,
    T
  > {
    const result =
      new Map<
        string,
        T
      >();

    for (
      const record
      of records
    ) {
      if (
        !result.has(
          record.candidateKey,
        )
      ) {
        result.set(
          record.candidateKey,
          record,
        );
      }
    }

    return result;
  }

  private opportunityKey(
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

  private parseKey(
    key:
      string,
  ): {
    market:
      string;

    buyExchange:
      string;

    sellExchange:
      string;
  } {
    const [
      market =
        "UNKNOWN",

      buyExchange =
        "unknown",

      sellExchange =
        "unknown",
    ] =
      key.split(
        "|",
      );

    return {
      market,

      buyExchange,

      sellExchange,
    };
  }
}

export const acceptedOpportunityShadowFlowAnalyzerService =
  new AcceptedOpportunityShadowFlowAnalyzerService();