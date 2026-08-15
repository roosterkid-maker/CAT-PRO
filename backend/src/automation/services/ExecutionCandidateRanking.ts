import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

export type CandidateRouteReturnResolver = (
  qualification:
    CandidateQualificationRecord,
) => number | null;

export function resolveModeledCandidateNetProfitPercent(
  qualification:
    CandidateQualificationRecord,
): number {
  const capitalAware =
    qualification
      .liquidityAssessment
      .capitalAware;

  return (
    capitalAware.simulationSuccess &&
    capitalAware.fullyExecutable &&
    capitalAware.fillPercent !==
      null &&
    capitalAware.fillPercent >=
      100 &&
    capitalAware.netProfitPercent !==
      null &&
    Number.isFinite(
      capitalAware.netProfitPercent,
    )
  )
    ? capitalAware.netProfitPercent
    : qualification
        .candidate
        .latest
        .netProfitPercent;
}

/**
 * Conservative INR profit represented by the candidate's current full-depth
 * evidence. Headline spread is deliberately not used when a capital-aware
 * simulation is available.
 */
export function resolveModeledCandidateProfitInr(
  qualification:
    CandidateQualificationRecord,
): number {
  const capitalAware =
    qualification
      .liquidityAssessment
      .capitalAware;

  if (
    capitalAware.simulationSuccess &&
    capitalAware.fullyExecutable &&
    capitalAware.fillPercent !==
      null &&
    capitalAware.fillPercent >=
      100 &&
    capitalAware.netProfitPercent !==
      null &&
    Number.isFinite(
      capitalAware.netProfitPercent,
    ) &&
    Number.isFinite(
      capitalAware.validationCapital,
    ) &&
    capitalAware.validationCapital >
      0
  ) {
    return (
      capitalAware.validationCapital *
      resolveModeledCandidateNetProfitPercent(
        qualification,
      ) /
      100
    );
  }

  const referenceCapital =
    qualification
      .candidate
      .latest
      .requestedCapitalInr;

  return (
    referenceCapital !==
      undefined &&
    Number.isFinite(
      referenceCapital,
    ) &&
    referenceCapital >
      0
  )
    ? referenceCapital *
        qualification
          .candidate
          .latest
          .netProfitPercent /
        100
    : Number.NEGATIVE_INFINITY;
}

/**
 * Shared, deterministic priority for a simultaneous Strategy #1 candidate
 * set. Every caller therefore sees the same best-executable-first ordering.
 */
export function compareCandidateExecutionPriority(
  first:
    CandidateQualificationRecord,

  second:
    CandidateQualificationRecord,

  resolveRouteReturn?:
    CandidateRouteReturnResolver,
): number {
  const firstModeledProfit =
    resolveModeledCandidateProfitInr(
      first,
    );

  const secondModeledProfit =
    resolveModeledCandidateProfitInr(
      second,
    );

  if (
    firstModeledProfit !==
    secondModeledProfit
  ) {
    return (
      secondModeledProfit -
      firstModeledProfit
    );
  }

  const firstRouteReturn =
    resolveRouteReturn?.(
      first,
    ) ??
    Number.NEGATIVE_INFINITY;

  const secondRouteReturn =
    resolveRouteReturn?.(
      second,
    ) ??
    Number.NEGATIVE_INFINITY;

  if (
    firstRouteReturn !==
    secondRouteReturn
  ) {
    return (
      secondRouteReturn -
      firstRouteReturn
    );
  }

  if (
    first.score !==
    second.score
  ) {
    return (
      second.score -
      first.score
    );
  }

  const firstFreshness =
    first
      .candidate
      .latest
      .freshnessScore;

  const secondFreshness =
    second
      .candidate
      .latest
      .freshnessScore;

  if (
    firstFreshness !==
    secondFreshness
  ) {
    return (
      secondFreshness -
      firstFreshness
    );
  }

  const firstProfitPercent =
    first
      .candidate
      .latest
      .netProfitPercent;

  const secondProfitPercent =
    second
      .candidate
      .latest
      .netProfitPercent;

  if (
    firstProfitPercent !==
    secondProfitPercent
  ) {
    return (
      secondProfitPercent -
      firstProfitPercent
    );
  }

  const firstObservations =
    first
      .candidate
      .consecutiveObservations;

  const secondObservations =
    second
      .candidate
      .consecutiveObservations;

  if (
    firstObservations !==
    secondObservations
  ) {
    return (
      secondObservations -
      firstObservations
    );
  }

  const firstLastSeenAt =
    first
      .candidate
      .lastSeenAt;

  const secondLastSeenAt =
    second
      .candidate
      .lastSeenAt;

  if (
    firstLastSeenAt !==
    secondLastSeenAt
  ) {
    return (
      secondLastSeenAt -
      firstLastSeenAt
    );
  }

  return first.key.localeCompare(
    second.key,
  );
}

export function rankCandidatesForExecution(
  qualifications:
    readonly CandidateQualificationRecord[],

  resolveRouteReturn?:
    CandidateRouteReturnResolver,
): CandidateQualificationRecord[] {
  return [
    ...qualifications,
  ].sort(
    (
      first,
      second,
    ) =>
      compareCandidateExecutionPriority(
        first,
        second,
        resolveRouteReturn,
      ),
  );
}
