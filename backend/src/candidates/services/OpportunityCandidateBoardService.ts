import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import {
  opportunityRejectionStore,
  type OpportunityRejectionCode,
  type OpportunityRejectionRecord,
  type OpportunityRejectionStage,
} from "../../arbitrage/services/OpportunityRejectionStore";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityCandidateDistanceAnalyzer,
  type CandidateExecutionReadiness,
  type OpportunityCandidateDistanceAnalysis,
} from "./OpportunityCandidateDistanceAnalyzer";

export type OpportunityCandidateStatus =
  | "ACCEPTED"
  | "REJECTED";

export type OpportunityCandidateDecision =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export interface OpportunityCandidate {
  id:
    string;

  status:
    OpportunityCandidateStatus;

  market:
    string;

  buyExchange:
    string;

  sellExchange:
    string;

  buyPrice:
    number | null;

  sellPrice:
    number | null;

  rawSpread:
    number | null;

  rawSpreadPercent:
    number | null;

  estimatedFees:
    number | null;

  netProfit:
    number | null;

  netProfitPercent:
    number | null;

  requiredQuantity:
    number | null;

  availableQuantity:
    number | null;

  executableQuantity:
    number | null;

  liquidityPercent:
    number | null;

  overallScore:
    number | null;

  decision:
    OpportunityCandidateDecision;

  rejectionStage:
    OpportunityRejectionStage | null;

  rejectionCode:
    OpportunityRejectionCode | null;

  reason:
    string;

  observedAt:
    number;
}

export interface OpportunityCandidateBoardItem
  extends OpportunityCandidate {
  rank:
    number;

  distance:
    OpportunityCandidateDistanceAnalysis;
}

export interface OpportunityCandidateBoard {
  generatedAt:
    number;

  opportunitySnapshotGeneratedAt:
    number | null;

  totalCandidates:
    number;

  acceptedCount:
    number;

  rejectedCount:
    number;

  readyCount:
    number;

  nearReadyCount:
    number;

  notReadyCount:
    number;

  unknownReadinessCount:
    number;

  candidates:
    OpportunityCandidateBoardItem[];
}

const DEFAULT_BOARD_LIMIT =
  20;

const MAXIMUM_BOARD_LIMIT =
  100;

const MAXIMUM_REJECTION_SOURCE_RECORDS =
  200;

export class OpportunityCandidateBoardService {
  getBoard(
    limit =
      DEFAULT_BOARD_LIMIT,
  ): OpportunityCandidateBoard {
    const normalizedLimit =
      this.normalizeLimit(
        limit,
      );

    const allCandidates =
      this.buildAnalyzedCandidates();

    const selectedCandidates =
      allCandidates
        .slice(
          0,
          normalizedLimit,
        )
        .map(
          (
            candidate,
            index,
          ): OpportunityCandidateBoardItem => ({
            ...candidate,

            rank:
              index +
              1,
          }),
        );

    const opportunitySnapshot =
      opportunityService
        .getLastOpportunitySnapshot();

    return {
      generatedAt:
        Date.now(),

      opportunitySnapshotGeneratedAt:
        opportunitySnapshot
          ?.generatedAt ??
        null,

      totalCandidates:
        allCandidates.length,

      acceptedCount:
        allCandidates.filter(
          (
            candidate,
          ) =>
            candidate.status ===
            "ACCEPTED",
        ).length,

      rejectedCount:
        allCandidates.filter(
          (
            candidate,
          ) =>
            candidate.status ===
            "REJECTED",
        ).length,

      readyCount:
        selectedCandidates.filter(
          (
            candidate,
          ) =>
            candidate.distance
              .readiness ===
            "READY",
        ).length,

      nearReadyCount:
        selectedCandidates.filter(
          (
            candidate,
          ) =>
            candidate.distance
              .readiness ===
            "NEAR_READY",
        ).length,

      notReadyCount:
        selectedCandidates.filter(
          (
            candidate,
          ) =>
            candidate.distance
              .readiness ===
            "NOT_READY",
        ).length,

      unknownReadinessCount:
        selectedCandidates.filter(
          (
            candidate,
          ) =>
            candidate.distance
              .readiness ===
            "UNKNOWN",
        ).length,

      candidates:
        structuredClone(
          selectedCandidates,
        ),
    };
  }

  getCandidateById(
    candidateId:
      string,
  ): OpportunityCandidateBoardItem | null {
    const normalizedId =
      candidateId.trim();

    if (
      normalizedId.length ===
      0
    ) {
      return null;
    }

    const candidates =
      this.buildAnalyzedCandidates();

    const index =
      candidates.findIndex(
        (
          candidate,
        ) =>
          candidate.id ===
          normalizedId,
      );

    if (
      index ===
      -1
    ) {
      return null;
    }

    const candidate =
      candidates[
        index
      ];

    if (
      !candidate
    ) {
      return null;
    }

    return structuredClone({
      ...candidate,

      rank:
        index +
        1,
    });
  }

  private buildAnalyzedCandidates():
    OpportunityCandidateBoardItem[] {
    const opportunitySnapshot =
      opportunityService
        .getLastOpportunitySnapshot();

    const acceptedCandidates =
      (
        opportunitySnapshot
          ?.opportunities ??
        []
      ).map(
        (
          opportunity,
        ) =>
          this.fromAcceptedOpportunity(
            opportunity,
          ),
      );

    const rejectionRecords =
      opportunityRejectionStore
        .getRecent(
          MAXIMUM_REJECTION_SOURCE_RECORDS,
        );

    const rejectedCandidates =
      this.buildLatestRejectedCandidates(
        rejectionRecords,
      );

    /*
     * If the current opportunity snapshot contains
     * an accepted route, do not simultaneously show
     * an older rejection record for the same route.
     */
    const acceptedKeys =
      new Set(
        acceptedCandidates.map(
          (
            candidate,
          ) =>
            this.createCandidateKey(
              candidate.market,
              candidate.buyExchange,
              candidate.sellExchange,
            ),
        ),
      );

    const filteredRejectedCandidates =
      rejectedCandidates.filter(
        (
          candidate,
        ) =>
          !acceptedKeys.has(
            this.createCandidateKey(
              candidate.market,
              candidate.buyExchange,
              candidate.sellExchange,
            ),
          ),
      );

    const sourceCandidates:
      OpportunityCandidate[] = [
        ...acceptedCandidates,
        ...filteredRejectedCandidates,
      ];

    const analyzedCandidates =
      sourceCandidates.map(
        (
          candidate,
        ): OpportunityCandidateBoardItem => {
          const distance =
            opportunityCandidateDistanceAnalyzer
              .analyze(
                candidate,
              );

          const normalized =
            this.enforceStateConsistency(
              candidate,
              distance,
            );

          return {
            ...normalized.candidate,

            rank:
              0,

            distance:
              normalized.distance,
          };
        },
      );

    analyzedCandidates.sort(
      (
        first,
        second,
      ) =>
        this.compareCandidates(
          first,
          second,
        ),
    );

    return analyzedCandidates.map(
      (
        candidate,
        index,
      ) => ({
        ...candidate,

        rank:
          index +
          1,
      }),
    );
  }

  /*
   * Candidate state invariants:
   *
   * REJECTED
   *   -> decision must be SKIP
   *   -> can never be READY
   *
   * ACCEPTED + EXECUTE
   *   -> may be READY
   *
   * ACCEPTED + REVIEW
   *   -> maximum NEAR_READY
   *
   * ACCEPTED + SKIP
   *   -> NOT_READY
   *
   * DistanceAnalyzer already implements these
   * rules. This method is a defensive board-level
   * guard so future refactors cannot expose an
   * impossible state to API consumers.
   */
  private enforceStateConsistency(
    candidate:
      OpportunityCandidate,

    distance:
      OpportunityCandidateDistanceAnalysis,
  ): {
    candidate:
      OpportunityCandidate;

    distance:
      OpportunityCandidateDistanceAnalysis;
  } {
    if (
      candidate.status ===
      "REJECTED"
    ) {
      return {
        candidate: {
          ...candidate,

          decision:
            "SKIP",
        },

        distance: {
          ...distance,

          readiness:
            distance.readiness ===
            "READY"
              ? "NOT_READY"
              : distance.readiness,

          readinessPercent:
            distance.readiness ===
            "READY"
              ? 0
              : distance.readinessPercent,

          blockingStage:
            distance.blockingStage ??
            candidate.rejectionStage ??
            "REJECTION",

          blockingReason:
            distance.blockingReason ??
            candidate.reason,
        },
      };
    }

    switch (
      candidate.decision
    ) {
      case "EXECUTE": {
        if (
          distance.readiness ===
          "READY"
        ) {
          return {
            candidate,

            distance,
          };
        }

        /*
         * An EXECUTE decision can still be held below
         * READY if future analyzers introduce another
         * blocking condition.
         */
        return {
          candidate,

          distance,
        };
      }

      case "REVIEW": {
        const readiness:
          CandidateExecutionReadiness =
          distance.readiness ===
            "READY"
            ? "NEAR_READY"
            : distance.readiness ===
                "UNKNOWN"
              ? "NEAR_READY"
              : distance.readiness;

        return {
          candidate,

          distance: {
            ...distance,

            readiness,

            readinessPercent:
              this.capReadinessPercent(
                distance.readinessPercent,
                99,
                65,
              ),

            blockingStage:
              distance.blockingStage ??
              "DECISION",

            blockingReason:
              distance.blockingReason ??
              this.resolveDecisionReason(
                candidate,
                "Candidate requires review before execution.",
              ),
          },
        };
      }

      case "SKIP": {
        return {
          candidate,

          distance: {
            ...distance,

            readiness:
              "NOT_READY",

            readinessPercent:
              this.capReadinessPercent(
                distance.readinessPercent,
                64.99,
                0,
              ),

            blockingStage:
              distance.blockingStage ??
              "DECISION",

            blockingReason:
              distance.blockingReason ??
              this.resolveDecisionReason(
                candidate,
                "Candidate execution decision is SKIP.",
              ),
          },
        };
      }
    }
  }

  private fromAcceptedOpportunity(
    opportunity:
      ArbitrageOpportunity,
  ): OpportunityCandidate {
    const liquidityPercent =
      this.calculateLiquidityPercent(
        opportunity.requiredQty,
        opportunity.availableExecutableQty,
      );

    return {
      id:
        opportunity.id,

      status:
        "ACCEPTED",

      market:
        opportunity
          .pair
          .market
          .trim()
          .toUpperCase(),

      buyExchange:
        opportunity
          .pair
          .buy
          .exchange
          .trim()
          .toLowerCase(),

      sellExchange:
        opportunity
          .pair
          .sell
          .exchange
          .trim()
          .toLowerCase(),

      buyPrice:
        this.normalizeNumber(
          opportunity.buyPrice,
        ),

      sellPrice:
        this.normalizeNumber(
          opportunity.sellPrice,
        ),

      rawSpread:
        this.normalizeNumber(
          opportunity.rawSpread,
        ),

      rawSpreadPercent:
        this.normalizeNumber(
          opportunity.rawSpreadPercent,
        ),

      estimatedFees:
        this.normalizeNumber(
          opportunity.estimatedFees,
        ),

      netProfit:
        this.normalizeNumber(
          opportunity.netProfit,
        ),

      netProfitPercent:
        this.normalizeNumber(
          opportunity.netProfitPercent,
        ),

      requiredQuantity:
        this.normalizeNumber(
          opportunity.requiredQty,
        ),

      availableQuantity:
        this.normalizeNumber(
          opportunity.availableExecutableQty,
        ),

      executableQuantity:
        this.normalizeNumber(
          opportunity.executableQty,
        ),

      liquidityPercent,

      overallScore:
        this.normalizeNumber(
          opportunity.score,
        ),

      decision:
        this.normalizeDecision(
          opportunity.decision,
        ),

      rejectionStage:
        null,

      rejectionCode:
        null,

      reason:
        this.resolveAcceptedReason(
          opportunity,
        ),

      observedAt:
        this.normalizeTimestamp(
          opportunity.timestamp,
        ),
    };
  }

  private buildLatestRejectedCandidates(
    records:
      readonly OpportunityRejectionRecord[],
  ): OpportunityCandidate[] {
    const latestByKey =
      new Map<
        string,
        OpportunityRejectionRecord
      >();

    /*
     * OpportunityRejectionStore.getRecent()
     * returns newest records first.
     *
     * Therefore the first record encountered for
     * a route is the authoritative latest rejection.
     */
    for (
      const record
      of records
    ) {
      const key =
        this.createCandidateKey(
          record.market,
          record.buyExchange,
          record.sellExchange,
        );

      if (
        latestByKey.has(
          key,
        )
      ) {
        continue;
      }

      latestByKey.set(
        key,
        record,
      );
    }

    return Array.from(
      latestByKey.values(),
      (
        record,
      ) =>
        this.fromRejectionRecord(
          record,
        ),
    );
  }

  private fromRejectionRecord(
    record:
      OpportunityRejectionRecord,
  ): OpportunityCandidate {
    return {
      id:
        record.id,

      status:
        "REJECTED",

      market:
        record.market
          .trim()
          .toUpperCase(),

      buyExchange:
        record.buyExchange
          .trim()
          .toLowerCase(),

      sellExchange:
        record.sellExchange
          .trim()
          .toLowerCase(),

      buyPrice:
        this.normalizeNullableNumber(
          record.buyPrice,
        ),

      sellPrice:
        this.normalizeNullableNumber(
          record.sellPrice,
        ),

      rawSpread:
        this.normalizeNullableNumber(
          record.rawSpread,
        ),

      rawSpreadPercent:
        this.normalizeNullableNumber(
          record.rawSpreadPercent,
        ),

      estimatedFees:
        this.normalizeNullableNumber(
          record.estimatedFees,
        ),

      netProfit:
        this.normalizeNullableNumber(
          record.netProfit,
        ),

      netProfitPercent:
        this.normalizeNullableNumber(
          record.netProfitPercent,
        ),

      requiredQuantity:
        this.normalizeNullableNumber(
          record.requestedQuantity,
        ),

      availableQuantity:
        this.normalizeNullableNumber(
          record.availableQuantity,
        ),

      executableQuantity:
        this.normalizeNullableNumber(
          record.executableQuantity,
        ),

      liquidityPercent:
        this.normalizeNullableNumber(
          record.liquidityPercent,
        ),

      overallScore:
        this.normalizeNullableNumber(
          record.overallScore,
        ),

      decision:
        "SKIP",

      rejectionStage:
        record.stage,

      rejectionCode:
        record.code,

      reason:
        this.normalizeReason(
          record.reason,
          "Opportunity was rejected by the arbitrage pipeline.",
        ),

      observedAt:
        this.normalizeTimestamp(
          record.rejectedAt,
        ),
    };
  }

  private compareCandidates(
    first:
      OpportunityCandidateBoardItem,

    second:
      OpportunityCandidateBoardItem,
  ): number {
    /*
     * Accepted routes remain above rejected
     * diagnostic routes.
     */
    if (
      first.status !==
      second.status
    ) {
      return first.status ===
        "ACCEPTED"
        ? -1
        : 1;
    }

    /*
     * Within the same status:
     *
     * READY
     * NEAR_READY
     * NOT_READY
     * UNKNOWN
     */
    const readinessDifference =
      this.getReadinessPriority(
        second.distance
          .readiness,
      ) -
      this.getReadinessPriority(
        first.distance
          .readiness,
      );

    if (
      readinessDifference !==
      0
    ) {
      return readinessDifference;
    }

    /*
     * EXECUTE should rank above REVIEW and SKIP
     * when readiness otherwise ties.
     */
    const decisionDifference =
      this.getDecisionPriority(
        second.decision,
      ) -
      this.getDecisionPriority(
        first.decision,
      );

    if (
      decisionDifference !==
      0
    ) {
      return decisionDifference;
    }

    const readinessPercentDifference =
      this.compareNullableDescending(
        first.distance
          .readinessPercent,

        second.distance
          .readinessPercent,
      );

    if (
      readinessPercentDifference !==
      0
    ) {
      return readinessPercentDifference;
    }

    const scoreDifference =
      this.compareNullableDescending(
        first.overallScore,
        second.overallScore,
      );

    if (
      scoreDifference !==
      0
    ) {
      return scoreDifference;
    }

    const netProfitDifference =
      this.compareNullableDescending(
        first.netProfitPercent,
        second.netProfitPercent,
      );

    if (
      netProfitDifference !==
      0
    ) {
      return netProfitDifference;
    }

    const spreadDifference =
      this.compareNullableDescending(
        first.rawSpreadPercent,
        second.rawSpreadPercent,
      );

    if (
      spreadDifference !==
      0
    ) {
      return spreadDifference;
    }

    return (
      second.observedAt -
      first.observedAt
    );
  }

  private getReadinessPriority(
    readiness:
      CandidateExecutionReadiness,
  ): number {
    switch (
      readiness
    ) {
      case "READY":
        return 4;

      case "NEAR_READY":
        return 3;

      case "NOT_READY":
        return 2;

      case "UNKNOWN":
        return 1;
    }
  }

  private getDecisionPriority(
    decision:
      OpportunityCandidateDecision,
  ): number {
    switch (
      decision
    ) {
      case "EXECUTE":
        return 3;

      case "REVIEW":
        return 2;

      case "SKIP":
        return 1;
    }
  }

  private compareNullableDescending(
    first:
      number | null,

    second:
      number | null,
  ): number {
    if (
      first ===
        null &&
      second ===
        null
    ) {
      return 0;
    }

    if (
      first ===
      null
    ) {
      return 1;
    }

    if (
      second ===
      null
    ) {
      return -1;
    }

    return (
      second -
      first
    );
  }

  private resolveAcceptedReason(
    opportunity:
      ArbitrageOpportunity,
  ): string {
    const summary =
      opportunity
        .analysisSummary
        .filter(
          (
            reason,
          ) =>
            typeof reason ===
              "string" &&
            reason
              .trim()
              .length >
              0,
        );

    if (
      summary.length ===
      0
    ) {
      switch (
        opportunity.decision
      ) {
        case "EXECUTE":
          return "Opportunity passed execution analysis with an EXECUTE decision.";

        case "REVIEW":
          return "Opportunity passed core analysis but requires execution review.";

        case "SKIP":
          return "Opportunity passed initial acceptance but execution analysis currently recommends SKIP.";
      }
    }

    return summary.join(
      " ",
    );
  }

  private resolveDecisionReason(
    candidate:
      OpportunityCandidate,

    fallback:
      string,
  ): string {
    return this.normalizeReason(
      candidate.reason,
      fallback,
    );
  }

  private normalizeReason(
    reason:
      string,

    fallback:
      string,
  ): string {
    const normalized =
      reason.trim();

    return normalized.length >
      0
      ? normalized
      : fallback;
  }

  private calculateLiquidityPercent(
    requiredQuantity:
      number,

    availableQuantity:
      number,
  ): number | null {
    if (
      !Number.isFinite(
        requiredQuantity,
      ) ||
      requiredQuantity <=
        0 ||
      !Number.isFinite(
        availableQuantity,
      ) ||
      availableQuantity <
        0
    ) {
      return null;
    }

    return (
      availableQuantity /
      requiredQuantity
    ) *
      100;
  }

  private createCandidateKey(
    market:
      string,

    buyExchange:
      string,

    sellExchange:
      string,
  ): string {
    return [
      market
        .trim()
        .toUpperCase(),

      buyExchange
        .trim()
        .toLowerCase(),

      sellExchange
        .trim()
        .toLowerCase(),
    ].join(
      "|",
    );
  }

  private normalizeDecision(
    value:
      ArbitrageOpportunity["decision"],
  ): OpportunityCandidateDecision {
    switch (
      value
    ) {
      case "EXECUTE":
        return "EXECUTE";

      case "REVIEW":
        return "REVIEW";

      case "SKIP":
        return "SKIP";

      default:
        return "SKIP";
    }
  }

  private normalizeNumber(
    value:
      number,
  ): number | null {
    return Number.isFinite(
      value,
    )
      ? value
      : null;
  }

  private normalizeNullableNumber(
    value:
      number | null |
      undefined,
  ): number | null {
    if (
      value ===
        null ||
      value ===
        undefined ||
      !Number.isFinite(
        value,
      )
    ) {
      return null;
    }

    return value;
  }

  private normalizeTimestamp(
    timestamp:
      number,
  ): number {
    if (
      !Number.isFinite(
        timestamp,
      ) ||
      timestamp <=
        0
    ) {
      return Date.now();
    }

    return timestamp;
  }

  private capReadinessPercent(
    value:
      number | null,

    maximum:
      number,

    fallback:
      number,
  ): number {
    if (
      value ===
        null ||
      !Number.isFinite(
        value,
      )
    ) {
      return fallback;
    }

    return Math.max(
      0,
      Math.min(
        maximum,
        value,
      ),
    );
  }

  private normalizeLimit(
    limit:
      number,
  ): number {
    if (
      !Number.isSafeInteger(
        limit,
      ) ||
      limit <=
        0
    ) {
      throw new Error(
        "Candidate board limit must be a positive integer.",
      );
    }

    return Math.min(
      limit,
      MAXIMUM_BOARD_LIMIT,
    );
  }
}

export const opportunityCandidateBoardService =
  new OpportunityCandidateBoardService();