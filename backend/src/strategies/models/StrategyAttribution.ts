import type {
  StrategyId,
} from "./StrategyMetadata";

import type {
  StrategySignal,
} from "./StrategySignal";

import type {
  StrategyIntent,
} from "./StrategyIntent";

export type StrategyAttributionStatus =
  | "ATTRIBUTED"
  | "UNATTRIBUTED_LEGACY";

export interface AttributedStrategyEvidence {
  readonly attributionStatus: "ATTRIBUTED";

  readonly strategyId: StrategyId;

  readonly signalId: string;

  readonly intentId:
    string | null;
}

export interface UnattributedLegacyStrategyEvidence {
  readonly attributionStatus: "UNATTRIBUTED_LEGACY";

  readonly strategyId: null;

  readonly signalId: null;

  readonly intentId: null;
}

export type StrategyAttribution =
  | AttributedStrategyEvidence
  | UnattributedLegacyStrategyEvidence;

export interface StrategyAttributionCoverage {
  readonly evidenceStatus:
    | "AVAILABLE"
    | "NO_DATA";

  readonly totalRecords: number;

  readonly attributedToStrategy: number;

  readonly attributedToOtherStrategies: number;

  readonly unattributedLegacy: number;

  readonly attributionCoveragePercent: number | null;
}

export interface StrategyAttributionEvidenceSummary {
  readonly generatedAt: number;

  readonly strategyId: StrategyId;

  readonly shadowOutcomes: StrategyAttributionCoverage;

  readonly paperTrades: StrategyAttributionCoverage;
}

export function strategyAttributionFromSignal(
  signal: StrategySignal,
): AttributedStrategyEvidence {
  if (
    signal.evidenceStatus !== "AVAILABLE" ||
    signal.executionAuthorized !== false ||
    signal.automaticExecutionAllowed !== false ||
    !signal.strategyId.trim() ||
    !signal.id.trim()
  ) {
    throw new Error(
      "Strategy attribution requires genuine non-executable StrategySignal evidence.",
    );
  }

  return immutableAttribution({
    attributionStatus: "ATTRIBUTED",
    strategyId: signal.strategyId,
    signalId: signal.id,
    intentId: null,
  });
}

export function unattributedLegacyStrategyEvidence():
  UnattributedLegacyStrategyEvidence {
  return immutableAttribution({
    attributionStatus: "UNATTRIBUTED_LEGACY",
    strategyId: null,
    signalId: null,
    intentId: null,
  });
}

export function strategyAttributionFromIntent(
  attribution:
    StrategyAttribution,

  intent:
    StrategyIntent,
): AttributedStrategyEvidence {
  if (
    attribution.attributionStatus !==
      "ATTRIBUTED" ||
    attribution.intentId !==
      null ||
    attribution.strategyId !==
      intent.strategyId ||
    attribution.signalId !==
      intent.signalId ||
    intent.proposedMode !==
      "PAPER" ||
    intent.status !==
      "PROPOSED" ||
    intent.executionAuthorized !==
      false ||
    intent.automaticExecutionAllowed !==
      false
  ) {
    throw new Error(
      "Strategy intent attribution requires matching non-executable signal evidence and a genuine PAPER proposal.",
    );
  }

  return immutableAttribution({
    attributionStatus:
      "ATTRIBUTED",
    strategyId:
      intent.strategyId,
    signalId:
      intent.signalId,
    intentId:
      intent.id,
  });
}

/**
 * Historical JSONL evidence predates strategy identity.
 * Missing, partial, or invalid attribution is explicitly
 * classified as legacy; it is never inferred from route data.
 */
export function normalizeStrategyAttribution(
  value: unknown,
): StrategyAttribution {
  if (
    value &&
    typeof value === "object"
  ) {
    const candidate = value as Partial<AttributedStrategyEvidence>;

    if (
      candidate.attributionStatus === "ATTRIBUTED" &&
      typeof candidate.strategyId === "string" &&
      candidate.strategyId.trim().length > 0 &&
      typeof candidate.signalId === "string" &&
      candidate.signalId.trim().length > 0 &&
      (
        candidate.intentId ===
          null ||
        (
          typeof candidate.intentId ===
            "string" &&
          candidate.intentId
            .trim()
            .length >
            0
        )
      )
    ) {
      return immutableAttribution({
        attributionStatus: "ATTRIBUTED",
        strategyId: candidate.strategyId,
        signalId: candidate.signalId,
        intentId:
          candidate.intentId,
      });
    }
  }

  return unattributedLegacyStrategyEvidence();
}

export function cloneStrategyAttribution(
  attribution: StrategyAttribution,
): StrategyAttribution {
  return normalizeStrategyAttribution(attribution);
}

function immutableAttribution<T extends StrategyAttribution>(
  attribution: T,
): T {
  return Object.freeze(
    structuredClone(attribution),
  );
}
