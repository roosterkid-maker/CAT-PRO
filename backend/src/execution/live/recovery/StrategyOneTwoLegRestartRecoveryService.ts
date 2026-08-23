import {
  strategyOneTwoLegLiveExecutionService,
  type StrategyOneTwoLegSessionRecord,
} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";

import {
  strategyOneTwoLegRecoveryResolutionService,
} from "./StrategyOneTwoLegRecoveryResolutionService";

interface PairEvidencePort {
  listSessions(): readonly StrategyOneTwoLegSessionRecord[];
  getDiagnostics(now?: number): {
    readonly persistence: {
      readonly writeFailures: number;
      readonly malformedRecordsIgnored: number;
      readonly lastError: string | null;
    };
  };
}

interface ResolutionPort {
  isSessionResolved(sessionId: string): boolean;
}

const UNRESOLVED_STATES =
  new Set<StrategyOneTwoLegSessionRecord["state"]>([
    "PREPARED",
    "DISPATCHING",
    "POSSIBLE_EXPOSURE",
    "RECOVERY_REQUIRED",
  ]);

export class StrategyOneTwoLegRestartRecoveryService {
  constructor(
    private readonly pairs: PairEvidencePort = strategyOneTwoLegLiveExecutionService,
    private readonly resolutions: ResolutionPort = strategyOneTwoLegRecoveryResolutionService,
  ) {}

  getReport(
    now = Date.now(),
  ) {
    const diagnostics = this.pairs.getDiagnostics(now);
    const unresolved = this.pairs.listSessions()
      .filter((session) =>
        UNRESOLVED_STATES.has(session.state) &&
        !this.resolutions.isSessionResolved(session.sessionId));
    const possibleExposure = unresolved.filter((session) =>
      session.state === "DISPATCHING" ||
      session.state === "POSSIBLE_EXPOSURE" ||
      session.state === "RECOVERY_REQUIRED");
    const persistenceProblems = [
      ...(diagnostics.persistence.lastError
        ? [`Strategy #1 pair persistence error: ${diagnostics.persistence.lastError}`]
        : []),
      ...(diagnostics.persistence.writeFailures > 0
        ? [`Strategy #1 pair persistence has ${diagnostics.persistence.writeFailures} write failure(s).`]
        : []),
      ...(diagnostics.persistence.malformedRecordsIgnored > 0
        ? [`Strategy #1 pair persistence ignored ${diagnostics.persistence.malformedRecordsIgnored} malformed record(s).`]
        : []),
    ];
    const classification =
      possibleExposure.length > 0
        ? "POSSIBLE_EXPOSURE" as const
        : unresolved.length > 0 || persistenceProblems.length > 0
          ? "REVIEW_REQUIRED" as const
          : "CLEAN" as const;

    return Object.freeze({
      schemaVersion: "109.0" as const,
      generatedAt: now,
      classification,
      allowNewLivePreparation: classification === "CLEAN",
      unresolved: unresolved.map((session) => ({
        sessionId: session.sessionId,
        state: session.state,
        updatedAt: session.updatedAt,
        buyDispatchedAt: session.buyDispatchedAt,
        sellDispatchedAt: session.sellDispatchedAt,
        reasons: [...session.reasons],
      })),
      summary: {
        unresolvedSessions: unresolved.length,
        possibleExposureSessions: possibleExposure.length,
        persistenceIntegrityProblems: persistenceProblems.length,
      },
      persistenceProblems,
      safety: {
        failClosed: true,
        automaticRetryAllowed: false,
        automaticCancelAllowed: false,
        automaticHedgeAllowed: false,
        automaticUnwindAllowed: false,
        explicitEvidenceBoundResolutionRequired: true,
      },
    });
  }
}

export const strategyOneTwoLegRestartRecoveryService =
  new StrategyOneTwoLegRestartRecoveryService();
