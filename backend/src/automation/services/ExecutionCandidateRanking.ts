import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

export type CandidateRouteReturnResolver = (
  qualification:
    CandidateQualificationRecord,
) => number | null;

export type CandidateRebalanceBonusResolver = (
  qualification:
    CandidateQualificationRecord,
) => number;

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

export function resolveCandidateRankingEquivalentProfitInr(
  qualification:
    CandidateQualificationRecord,

  rebalanceBonusBps =
    0,

  capitalOverrideInr?:
    number,
): number {
  const actualModeledProfit = capitalOverrideInr !== undefined
    ? capitalOverrideInr *
        resolveModeledCandidateNetProfitPercent(qualification) /
        100
    : resolveModeledCandidateProfitInr(qualification);
  const capitalAware = qualification.liquidityAssessment.capitalAware;
  const referenceCapital = capitalOverrideInr ?? (
    Number.isFinite(capitalAware.validationCapital) &&
    capitalAware.validationCapital > 0
      ? capitalAware.validationCapital
      : qualification.candidate.latest.requestedCapitalInr ?? 0
  );
  const safeBonusBps =
    qualification.qualified &&
    resolveModeledCandidateNetProfitPercent(qualification) > 0 &&
    Number.isFinite(rebalanceBonusBps)
      ? Math.max(0, Math.min(25, rebalanceBonusBps))
      : 0;

  return actualModeledProfit + referenceCapital * safeBonusBps / 10_000;
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

  resolveRebalanceBonus?:
    CandidateRebalanceBonusResolver,
): number {
  const firstModeledProfit =
    resolveModeledCandidateProfitInr(
      first,
    );

  const secondModeledProfit =
    resolveModeledCandidateProfitInr(
      second,
    );

  const firstRankingProfit =
    resolveCandidateRankingEquivalentProfitInr(
      first,
      resolveRebalanceBonus?.(first) ?? 0,
    );

  const secondRankingProfit =
    resolveCandidateRankingEquivalentProfitInr(
      second,
      resolveRebalanceBonus?.(second) ?? 0,
    );

  if (
    firstRankingProfit !==
    secondRankingProfit
  ) {
    return (
      secondRankingProfit -
      firstRankingProfit
    );
  }

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

  resolveRebalanceBonus?:
    CandidateRebalanceBonusResolver,
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
        resolveRebalanceBonus,
      ),
  );
}
