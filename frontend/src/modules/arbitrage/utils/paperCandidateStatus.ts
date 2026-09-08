import type {
  PersonalOpportunityCandidateConversion,
} from "@/modules/strategies/types/PersonalStrategyOneBot";

export interface PaperCandidateSnapshotState {
  hasSnapshot: boolean;

  isPending: boolean;

  isFetching: boolean;

  isError: boolean;
}

export interface PaperCandidateStatus {
  state:
    | "CHECKING"
    | "WAITING"
    | "READY";

  label: string;

  reason: string;
}

export function resolvePaperCandidateStatus(
  candidate:
    PersonalOpportunityCandidateConversion |
    undefined,
  snapshot:
    PaperCandidateSnapshotState,
): PaperCandidateStatus {
  if (
    snapshot.isError
  ) {
    return {
      state:
        "WAITING",
      label:
        "PAPER STATUS UNAVAILABLE",
      reason:
        "The authoritative PAPER conversion snapshot could not be refreshed. No PAPER readiness is being inferred from analytical data.",
    };
  }

  if (
    !candidate
  ) {
    if (
      snapshot.isPending ||
      snapshot.isFetching ||
      !snapshot.hasSnapshot
    ) {
      return {
        state:
          "CHECKING",
        label:
          "PAPER STATUS CHECKING",
        reason:
          "Waiting for the authoritative PAPER conversion snapshot.",
      };
    }

    return {
      state:
        "WAITING",
      label:
        "PAPER NOT OBSERVED",
      reason:
        "This analytical route is absent from the current authoritative PAPER conversion snapshot, so it is not PAPER-ready.",
    };
  }

  if (
    candidate.selectableForPaper
  ) {
    return {
      state:
        "READY",
      label:
        "PAPER READY",
      reason:
        candidate.reason,
    };
  }

  const firstFailure =
    candidate.failedCheckDetails[0];
  const blocker =
    candidate.failedChecks[0] ??
    candidate.currentStage;

  return {
    state:
      "WAITING",
    label:
      `PAPER WAIT · ${paperBlockerLabel(
        blocker,
      )}`,
    reason:
      firstFailure
        ? `${candidate.reason} ${firstFailure.reason}`
        : candidate.reason,
  };
}

function paperBlockerLabel(
  blocker:
    string,
): string {
  const normalized =
    blocker
      .trim()
      .toLowerCase();

  if (
    normalized.includes(
      "fresh",
    )
  ) {
    return "BOOK SYNC";
  }

  if (
    normalized.includes(
      "liquid",
    )
  ) {
    return "DEPTH";
  }

  if (
    normalized.includes(
      "profitstability",
    ) ||
    normalized.includes(
      "profit_stability",
    )
  ) {
    return "PROFIT STABILITY";
  }

  if (
    normalized.includes(
      "consecutive",
    ) ||
    normalized.includes(
      "persistence",
    )
  ) {
    return "PERSISTENCE";
  }

  return normalized
    .replaceAll(
      "_",
      " ",
    )
    .toUpperCase();
}
