import {
  opportunityDiagnosticsRunner,
} from "../../arbitrage/services/OpportunityDiagnosticsRunner";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import type {
  AcceptedOpportunityCaptureDiagnosticsReport,
  AcceptedOpportunityCaptureTrace,
} from "../models/AcceptedOpportunityCaptureDiagnostics";

import {
  automationSchedulerService,
} from "./AutomationSchedulerService";

import {
  opportunityMonitorService,
} from "./OpportunityMonitorService";

const HISTORY_LIMIT =
  200;

const TRACE_LIMIT =
  100;

export class AcceptedOpportunityCaptureDiagnosticsService {
  getReport():
    AcceptedOpportunityCaptureDiagnosticsReport {
    const now =
      Date.now();

    const engineStatus =
      opportunityDiagnosticsRunner
        .getStatus();

    const scheduler =
      automationSchedulerService
        .getDiagnostics();

    const monitor =
      opportunityMonitorService
        .getDiagnostics();

    const engineSnapshots =
      opportunityService
        .getRecentOpportunitySnapshotHistory(
          HISTORY_LIMIT,
        );

    const monitorSnapshots =
      opportunityMonitorService
        .getRecentProcessedSnapshots(
          HISTORY_LIMIT,
        );

    const monitorSnapshotsByTimestamp =
      new Map(
        monitorSnapshots.map(
          (
            snapshot,
          ) => [
            snapshot
              .snapshotGeneratedAt,

            snapshot,
          ] as const,
        ),
      );

    const monitorCandidatesByKey =
      new Map(
        monitor.candidates.map(
          (
            candidate,
          ) => [
            candidate.key,
            candidate,
          ] as const,
        ),
      );

    const traces:
      AcceptedOpportunityCaptureTrace[] =
      [];

    let acceptedSnapshotsProcessedByMonitor =
      0;

    let acceptedSnapshotsMissedByMonitor =
      0;

    const uniqueAcceptedRoutes =
      new Set<string>();

    for (
      let snapshotIndex =
        0;

      snapshotIndex <
      engineSnapshots.length;

      snapshotIndex +=
        1
    ) {
      const snapshot =
        engineSnapshots[
          snapshotIndex
        ];

      if (
        !snapshot ||
        snapshot.opportunityCount ===
          0
      ) {
        continue;
      }

      const nextSnapshot =
        engineSnapshots[
          snapshotIndex +
            1
        ] ??
        null;

      /*
       * The snapshot remains the authoritative
       * latest snapshot until the next engine
       * evaluation overwrites it.
       */
      const visibilityWindowMs =
        nextSnapshot
          ? Math.max(
              0,

              nextSnapshot
                .generatedAt -
              snapshot
                .generatedAt,
            )
          : Math.max(
              0,

              now -
              snapshot.generatedAt,
            );

      const monitorProcessed =
        monitorSnapshotsByTimestamp
          .get(
            snapshot.generatedAt,
          ) ??
        null;

      if (
        monitorProcessed
      ) {
        acceptedSnapshotsProcessedByMonitor +=
          1;
      } else {
        acceptedSnapshotsMissedByMonitor +=
          1;
      }

      for (
        const opportunity
        of snapshot.opportunities
      ) {
        uniqueAcceptedRoutes.add(
          opportunity.key,
        );

        const monitorCandidate =
          monitorCandidatesByKey
            .get(
              opportunity.key,
            ) ??
          null;

        const monitorCapturedRoute =
          monitorProcessed
            ?.candidateKeys
            .includes(
              opportunity.key,
            ) ??
          false;

        const captureLatencyMs =
          monitorCapturedRoute &&
          monitorCandidate
            ? Math.max(
                0,

                monitorCandidate
                  .firstSeenAt -
                snapshot
                  .generatedAt,
              )
            : null;

        const shortWindow =
          visibilityWindowMs <
          scheduler.intervalMs;

        const result =
          monitorCapturedRoute
            ? "CAPTURED"
            : shortWindow
              ? "MISSED_SHORT_WINDOW"
              : "MISSED_DESPITE_SCHEDULER_WINDOW";

        traces.push({
          snapshotGeneratedAt:
            snapshot.generatedAt,

          nextSnapshotGeneratedAt:
            nextSnapshot
              ?.generatedAt ??
            null,

          visibilityWindowMs,

          opportunityKey:
            opportunity.key,

          market:
            opportunity.market,

          buyExchange:
            opportunity.buyExchange,

          sellExchange:
            opportunity.sellExchange,

          netProfitPercent:
            opportunity
              .netProfitPercent,

          monitorProcessedSnapshot:
            monitorProcessed !==
            null,

          monitorCapturedRoute,

          monitorCandidateExists:
            monitorCandidate !==
            null,

          monitorFirstSeenAt:
            monitorCandidate
              ?.firstSeenAt ??
            null,

          monitorLastSeenAt:
            monitorCandidate
              ?.lastSeenAt ??
            null,

          captureLatencyMs,

          schedulerIntervalMs:
            scheduler.intervalMs,

          visibilityShorterThanSchedulerInterval:
            shortWindow,

          result,
        });
      }
    }

    traces.sort(
      (
        first,
        second,
      ) =>
        second
          .snapshotGeneratedAt -
        first
          .snapshotGeneratedAt,
    );

    const capturedOpportunityObservations =
      traces.filter(
        (
          trace,
        ) =>
          trace.result ===
          "CAPTURED",
      ).length;

    const missedShortVisibilityObservations =
      traces.filter(
        (
          trace,
        ) =>
          trace.result ===
          "MISSED_SHORT_WINDOW",
      ).length;

    const missedDespiteSchedulerWindowObservations =
      traces.filter(
        (
          trace,
        ) =>
          trace.result ===
          "MISSED_DESPITE_SCHEDULER_WINDOW",
      ).length;

    const missedOpportunityObservations =
      missedShortVisibilityObservations +
      missedDespiteSchedulerWindowObservations;

    const snapshotsWithAccepted =
      engineSnapshots.filter(
        (
          snapshot,
        ) =>
          snapshot.opportunityCount >
          0,
      ).length;

    const classification =
      this.classify(
        engineSnapshots.length,
        snapshotsWithAccepted,
        traces.length,
        missedShortVisibilityObservations,
        missedDespiteSchedulerWindowObservations,
      );

    const observations:
      string[] =
      [];

    observations.push(
      `Opportunity engine is event-driven with a ${engineStatus.minimumEventScanIntervalMs} ms minimum scan interval and a ${engineStatus.intervalMs} ms safety backstop; automation scheduler interval is ${scheduler.intervalMs} ms.`,
    );

    if (
      snapshotsWithAccepted ===
      0
    ) {
      observations.push(
        "No accepted opportunity has been recorded since this diagnostic history started.",
      );
    } else {
      observations.push(
        `${snapshotsWithAccepted} recent engine snapshot(s) contained at least one accepted opportunity.`,
      );
    }

    if (
      missedShortVisibilityObservations >
      0
    ) {
      observations.push(
        `${missedShortVisibilityObservations} accepted opportunity observation(s) disappeared within a window shorter than the scheduler interval.`,
      );
    }

    if (
      missedDespiteSchedulerWindowObservations >
      0
    ) {
      observations.push(
        `${missedDespiteSchedulerWindowObservations} accepted opportunity observation(s) remained authoritative for at least one scheduler interval but still were not captured by OpportunityMonitor; this requires scheduler/plumbing investigation.`,
      );
    }

    if (
      capturedOpportunityObservations >
      0
    ) {
      observations.push(
        `${capturedOpportunityObservations} accepted opportunity observation(s) were captured by OpportunityMonitor.`,
      );
    }

    observations.push(
      `Capture classification: ${classification}.`,

      "This diagnostic measures opportunities the engine actually accepted. No system can measure a market move that never reaches one of its subscribed executable order-book feeds.",

      "No opportunity scan interval, scheduler interval, persistence threshold, qualification threshold, shadow policy, paper policy, or LIVE setting is modified.",
    );

    return {
      generatedAt:
        now,

      version:
        "17.4",

      build:
        "4",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      classification,

      configuration: {
        opportunityScanIntervalMs:
          engineStatus.intervalMs,

        opportunityEventDriven:
          engineStatus.eventDriven,

        opportunityMinimumEventScanIntervalMs:
          engineStatus.minimumEventScanIntervalMs,

        automationSchedulerIntervalMs:
          scheduler.intervalMs,

        schedulerMaximumSnapshotAgeMs:
          scheduler
            .maximumSnapshotAgeMs,
      },

      summary: {
        recordedEngineSnapshots:
          engineSnapshots.length,

        engineSnapshotsWithAcceptedOpportunity:
          snapshotsWithAccepted,

        acceptedOpportunityObservations:
          traces.length,

        uniqueAcceptedRoutes:
          uniqueAcceptedRoutes.size,

        acceptedSnapshotsProcessedByMonitor,

        acceptedSnapshotsMissedByMonitor,

        capturedOpportunityObservations,

        missedOpportunityObservations,

        missedShortVisibilityObservations,

        missedDespiteSchedulerWindowObservations,

        monitorProcessedSnapshots:
          monitorSnapshots.length,
      },

      traces:
        traces.slice(
          0,
          TRACE_LIMIT,
        ),

      observations,
    };
  }

  private classify(
    totalSnapshots:
      number,

    snapshotsWithAccepted:
      number,

    acceptedObservations:
      number,

    shortWindowMisses:
      number,

    schedulerWindowMisses:
      number,
  ): AcceptedOpportunityCaptureDiagnosticsReport[
    "classification"
  ] {
    if (
      totalSnapshots <
      3
    ) {
      return "INSUFFICIENT_HISTORY";
    }

    if (
      snapshotsWithAccepted ===
      0 ||
      acceptedObservations ===
      0
    ) {
      return "NO_ACCEPTED_SNAPSHOTS";
    }

    if (
      schedulerWindowMisses ===
        0 &&
      shortWindowMisses ===
        0
    ) {
      return "CAPTURE_HEALTHY";
    }

    if (
      schedulerWindowMisses ===
        0 &&
      shortWindowMisses >
        0
    ) {
      return "SHORT_VISIBILITY_WINDOW";
    }

    if (
      schedulerWindowMisses >
        0 &&
      shortWindowMisses ===
        0
    ) {
      return "SCHEDULER_CAPTURE_GAP";
    }

    return "MIXED_CAPTURE_GAP";
  }
}

export const acceptedOpportunityCaptureDiagnosticsService =
  new AcceptedOpportunityCaptureDiagnosticsService();
