import {
  classifyProfitTier,
  PROFIT_TIER_POLICY,
} from "../config/profitTiers";

import type {
  OpportunityRejectionCode,
  OpportunityRejectionRecord,
  OpportunityRejectionStage,
} from "./OpportunityRejectionStore";

import {
  opportunityRejectionStore,
} from "./OpportunityRejectionStore";

import {
  opportunityService,
} from "./OpportunityService";

export type SpreadBand =
  | "NEGATIVE"
  | "ZERO_TO_DISCOVERY"
  | "DISCOVERY_TO_QUALIFICATION"
  | "QUALIFICATION_TO_LIVE"
  | "LIVE_PLUS";

export interface OpportunityNearMissRoute {
  market: string;

  buyExchange: string;

  sellExchange: string;

  status:
    | "REJECTED"
    | "ACCEPTED";

  classification:
    | "SUSPICIOUS_BOOK"
    | "SMALL_CAP_CANDIDATE"
    | "REJECTED"
    | "ACCEPTED";

  blockers: readonly {
    stage: string;
    code: string;
    reason: string;
  }[];

  requestedCapitalInr: number | null;

  quoteAsset: string | null;

  requestedQuoteCapital: number | null;

  executableQuoteCapital: number | null;

  executableCapitalInr: number | null;

  rejectionStage:
    OpportunityRejectionStage | null;

  rejectionCode:
    OpportunityRejectionCode | null;

  rejectionReason:
    string | null;

  buyPrice:
    number | null;

  sellPrice:
    number | null;

  rawSpreadPercent:
    number | null;

  netProfitPercent:
    number | null;

  estimatedFees:
    number | null;

  spreadBand:
    SpreadBand | null;

  profitTier:
    ReturnType<
      typeof classifyProfitTier
    > | null;

  distanceToDiscoveryPercent:
    number | null;

  distanceToQualificationPercent:
    number | null;

  distanceToLivePercent:
    number | null;

  rejectedAt:
    number | null;
}

export interface OpportunityNearMissAnalyticsReport {
  generatedAt: number;

  scanStartedAt: number | null;

  scanCompletedAt: number | null;

  mode:
    "READ_ONLY_NEAR_MISS_ANALYTICS";

  executionAllowed:
    false;

  policy: {
    minimumSpreadPercent:
      number | null;

    discoveryMinimumNetProfitPercent:
      number;

    qualificationMinimumNetProfitPercent:
      number;

    liveMinimumNetProfitPercent:
      number;
  };

  pipeline: {
    cachedQuotes:
      number;

    executionQualityEligibleQuotes:
      number;

    marketSnapshots:
      number;

    exchangePairs:
      number;

    acceptedOpportunities:
      number;

    economicallyEvaluatedPairs:
      number;

    rawPositiveSpreads:
      number;

    feePositiveSpreads:
      number;

    evaluatorRejectedPairs:
      number;
  };

  best: {
    rawSpreadPercent:
      number | null;

    netProfitPercent:
      number | null;

    route:
      OpportunityNearMissRoute | null;
  };

  spreadBands: {
    negative:
      number;

    zeroToDiscovery:
      number;

    discoveryToQualification:
      number;

    qualificationToLive:
      number;

    livePlus:
      number;
  };

  rejectionSummary: {
    totalCurrentScanRejections:
      number;

    economicallyEvaluatedRejections:
      number;

    notEconomicallyEvaluated:
      number;

    byStage:
      Partial<
        Record<
          OpportunityRejectionStage,
          number
        >
      >;

    byCode:
      Partial<
        Record<
          OpportunityRejectionCode,
          number
        >
      >;
  };

  topNearMisses:
    OpportunityNearMissRoute[];

  notEconomicallyEvaluatedSamples:
    OpportunityNearMissRoute[];

  observations:
    string[];
}

export class OpportunityNearMissAnalyticsService {
  getReport(
    limit =
      20,
  ): OpportunityNearMissAnalyticsReport {
    const normalizedLimit =
      this.normalizeLimit(
        limit,
      );

    const diagnostics =
      opportunityService
        .getLastDiagnostics();

    const snapshot =
      opportunityService
        .getLastOpportunitySnapshot();

    if (
      !diagnostics
    ) {
      return this.emptyReport(
        normalizedLimit,
      );
    }

    const currentScanRejections =
      opportunityRejectionStore
        .getAll()
        .filter(
          (
            record,
          ) =>
            record.rejectedAt >=
              diagnostics.scanStartedAt &&
            record.rejectedAt <=
              diagnostics.generatedAt,
        );

    const rejectedRoutes =
      currentScanRejections
        .map(
          (
            record,
          ) =>
            this.fromRejection(
              record,
            ),
        );

    const acceptedRoutes =
      (
        snapshot
          ?.opportunities ??
        []
      ).map(
        (
          opportunity,
        ) =>
          this.fromAccepted(
            opportunity,
          ),
      );

    /*
     * Economically evaluated means the evaluator
     * successfully reached executable price + fee
     * calculation.
     *
     * Freshness/pair-sync failures are intentionally
     * excluded from spread rankings because their
     * prices are not valid same-moment economic
     * comparisons.
     */
    const economicRoutes = [
      ...rejectedRoutes.filter(
        (
          route,
        ) =>
          route
            .rawSpreadPercent !==
            null,
      ),

      ...acceptedRoutes,
    ];

    const sortedEconomicRoutes = [
      ...economicRoutes,
    ].sort(
      (
        first,
        second,
      ) => {
        const firstSuspicious =
          first.classification ===
          "SUSPICIOUS_BOOK";

        const secondSuspicious =
          second.classification ===
          "SUSPICIOUS_BOOK";

        if (
          firstSuspicious !==
          secondSuspicious
        ) {
          return firstSuspicious
            ? 1
            : -1;
        }

        return (
          second
            .rawSpreadPercent ??
          Number.NEGATIVE_INFINITY
        ) -
        (
          first
            .rawSpreadPercent ??
          Number.NEGATIVE_INFINITY
        );
      },
    );

    const bestRoute =
      sortedEconomicRoutes[
        0
      ] ??
      null;

    const bestNet =
      economicRoutes
        .filter(
          (
            route,
          ) =>
            route
              .netProfitPercent !==
            null,
        )
        .sort(
          (
            first,
            second,
          ) =>
            (
              second
                .netProfitPercent ??
              Number.NEGATIVE_INFINITY
            ) -
            (
              first
                .netProfitPercent ??
              Number.NEGATIVE_INFINITY
            ),
        )[
          0
        ] ??
      null;

    const spreadBands = {
      negative:
        0,

      zeroToDiscovery:
        0,

      discoveryToQualification:
        0,

      qualificationToLive:
        0,

      livePlus:
        0,
    };

    for (
      const route
      of economicRoutes
    ) {
      switch (
        route.spreadBand
      ) {
        case "NEGATIVE":
          spreadBands.negative +=
            1;
          break;

        case "ZERO_TO_DISCOVERY":
          spreadBands.zeroToDiscovery +=
            1;
          break;

        case "DISCOVERY_TO_QUALIFICATION":
          spreadBands.discoveryToQualification +=
            1;
          break;

        case "QUALIFICATION_TO_LIVE":
          spreadBands.qualificationToLive +=
            1;
          break;

        case "LIVE_PLUS":
          spreadBands.livePlus +=
            1;
          break;
      }
    }

    const byStage:
      OpportunityNearMissAnalyticsReport[
        "rejectionSummary"
      ]["byStage"] =
      {};

    const byCode:
      OpportunityNearMissAnalyticsReport[
        "rejectionSummary"
      ]["byCode"] =
      {};

    for (
      const rejection
      of currentScanRejections
    ) {
      byStage[
        rejection.stage
      ] =
        (
          byStage[
            rejection.stage
          ] ??
          0
        ) +
        1;

      byCode[
        rejection.code
      ] =
        (
          byCode[
            rejection.code
          ] ??
          0
        ) +
        1;
    }

    const notEconomicallyEvaluated =
      rejectedRoutes.filter(
        (
          route,
        ) =>
          route.rawSpreadPercent ===
          null,
      );

    const rejectedEconomicRoutes =
      sortedEconomicRoutes.filter(
        (route) =>
          route.status ===
          "REJECTED",
      );

    const suspiciousRoutes =
      rejectedEconomicRoutes.filter(
        (route) =>
          route.classification ===
          "SUSPICIOUS_BOOK",
      );

    const suspiciousQuota =
      suspiciousRoutes.length >
        0
        ? Math.min(
            5,
            Math.max(
              1,
              Math.floor(
                normalizedLimit /
                4,
              ),
            ),
          )
        : 0;

    const displayedNearMisses = [
      ...rejectedEconomicRoutes
        .filter(
          (route) =>
            route.classification !==
            "SUSPICIOUS_BOOK",
        )
        .slice(
          0,
          normalizedLimit -
            suspiciousQuota,
        ),
      ...suspiciousRoutes.slice(
        0,
        suspiciousQuota,
      ),
    ];

    return {
      generatedAt:
        Date.now(),

      scanStartedAt:
        diagnostics
          .scanStartedAt,

      scanCompletedAt:
        diagnostics
          .generatedAt,

      mode:
        "READ_ONLY_NEAR_MISS_ANALYTICS",

      executionAllowed:
        false,

      policy: {
        minimumSpreadPercent:
          currentScanRejections
            .find(
              (
                rejection,
              ) =>
                rejection
                  .minimumSpreadPercent !==
                null,
            )
            ?.minimumSpreadPercent ??
          null,

        discoveryMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .discoveryMinimumNetProfitPercent,

        qualificationMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .qualificationMinimumNetProfitPercent,

        liveMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .liveMinimumNetProfitPercent,
      },

      pipeline: {
        cachedQuotes:
          diagnostics
            .cachedQuotes,

        executionQualityEligibleQuotes:
          diagnostics
            .executionQualityEligibleQuotes,

        marketSnapshots:
          diagnostics
            .marketSnapshots,

        exchangePairs:
          diagnostics
            .exchangePairs,

        acceptedOpportunities:
          diagnostics
            .acceptedOpportunities,

        economicallyEvaluatedPairs:
          economicRoutes.length,

        rawPositiveSpreads:
          economicRoutes.filter(
            (
              route,
            ) =>
              route
                .rawSpreadPercent !==
                null &&
              route
                .rawSpreadPercent >
                0,
          ).length,

        feePositiveSpreads:
          economicRoutes.filter(
            (
              route,
            ) =>
              route
                .netProfitPercent !==
                null &&
              route
                .netProfitPercent >
                0,
          ).length,

        evaluatorRejectedPairs:
          diagnostics
            .diagnostics
            .engine
            .evaluatorRejected,
      },

      best: {
        rawSpreadPercent:
          bestRoute
            ?.rawSpreadPercent ??
          null,

        netProfitPercent:
          bestNet
            ?.netProfitPercent ??
          null,

        route:
          bestRoute,
      },

      spreadBands,

      rejectionSummary: {
        totalCurrentScanRejections:
          currentScanRejections
            .length,

        economicallyEvaluatedRejections:
          rejectedRoutes.filter(
            (
              route,
            ) =>
              route
                .rawSpreadPercent !==
              null,
          ).length,

        notEconomicallyEvaluated:
          notEconomicallyEvaluated
            .length,

        byStage,

        byCode,
      },

      topNearMisses:
        displayedNearMisses,

      notEconomicallyEvaluatedSamples:
        notEconomicallyEvaluated
          .slice(
            0,
            Math.min(
              normalizedLimit,
              10,
            ),
          ),

      observations: [
        "Near-miss rankings use only pairs that reached executable-price and fee evaluation.",

        "Freshness and pair-synchronization rejects are reported separately and are never presented as valid economic opportunities.",

        "This endpoint is diagnostic-only and does not change spread, profit, freshness, liquidity, or execution policy.",

        "A positive raw spread can still have negative net profit after exchange fees.",

        "Qualification and LIVE thresholds remain separate from discovery visibility.",

        "Suspicious quote-integrity failures are sampled separately from credible near-miss ranking so fake spreads cannot displace useful routes.",
      ],
    };
  }

  private fromRejection(
    record:
      OpportunityRejectionRecord,
  ): OpportunityNearMissRoute {
    const blockers =
      this.extractBlockers(
        record,
      );

    const capital =
      this.readRecord(
        record.metadata.capital,
      );

    const quoteIntegrityFailed =
      blockers.some(
        (blocker) =>
          blocker.code ===
          "QUOTE_INTEGRITY_FAILED",
      );

    const liquidityOnly =
      blockers.length ===
        1 &&
      blockers[0]?.code ===
        "INSUFFICIENT_LIQUIDITY";

    return {
      market:
        record.market,

      buyExchange:
        record.buyExchange,

      sellExchange:
        record.sellExchange,

      status:
        "REJECTED",

      classification:
        quoteIntegrityFailed
          ? "SUSPICIOUS_BOOK"
          : liquidityOnly
            ? "SMALL_CAP_CANDIDATE"
            : "REJECTED",

      blockers,

      requestedCapitalInr:
        this.readNumber(
          capital?.requestedCapitalInr,
        ),

      quoteAsset:
        this.readString(
          capital?.quoteAsset,
        ),

      requestedQuoteCapital:
        this.readNumber(
          capital?.requestedQuoteCapital,
        ),

      executableQuoteCapital:
        this.readNumber(
          capital?.executableQuoteCapital,
        ),

      executableCapitalInr:
        this.readNumber(
          capital?.executableCapitalInr,
        ),

      rejectionStage:
        record.stage,

      rejectionCode:
        record.code,

      rejectionReason:
        record.reason,

      buyPrice:
        record.buyPrice,

      sellPrice:
        record.sellPrice,

      rawSpreadPercent:
        record
          .rawSpreadPercent,

      netProfitPercent:
        record
          .netProfitPercent,

      estimatedFees:
        record
          .estimatedFees,

      spreadBand:
        this.resolveSpreadBand(
          record
            .rawSpreadPercent,
        ),

      profitTier:
        record
          .netProfitPercent ===
        null
          ? null
          : classifyProfitTier(
              record
                .netProfitPercent,
            ),

      distanceToDiscoveryPercent:
        this.distanceTo(
          record
            .netProfitPercent,
          PROFIT_TIER_POLICY
            .discoveryMinimumNetProfitPercent,
        ),

      distanceToQualificationPercent:
        this.distanceTo(
          record
            .netProfitPercent,
          PROFIT_TIER_POLICY
            .qualificationMinimumNetProfitPercent,
        ),

      distanceToLivePercent:
        this.distanceTo(
          record
            .netProfitPercent,
          PROFIT_TIER_POLICY
            .liveMinimumNetProfitPercent,
        ),

      rejectedAt:
        record.rejectedAt,
    };
  }

  private fromAccepted(
    opportunity:
      ReturnType<
        typeof opportunityService.getLastOpportunities
      >[number],
  ): OpportunityNearMissRoute {
    return {
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

      status:
        "ACCEPTED",

      classification:
        "ACCEPTED",

      blockers:
        [],

      requestedCapitalInr:
        opportunity.requestedCapitalInr ??
        null,

      quoteAsset:
        opportunity.quoteAsset ??
        null,

      requestedQuoteCapital:
        opportunity.requestedQuoteCapital ??
        null,

      executableQuoteCapital:
        opportunity.executableQuoteCapital ??
        null,

      executableCapitalInr:
        opportunity.executableCapitalInr ??
        null,

      rejectionStage:
        null,

      rejectionCode:
        null,

      rejectionReason:
        null,

      buyPrice:
        opportunity
          .buyPrice,

      sellPrice:
        opportunity
          .sellPrice,

      rawSpreadPercent:
        opportunity
          .rawSpreadPercent,

      netProfitPercent:
        opportunity
          .netProfitPercent,

      estimatedFees:
        opportunity
          .estimatedFees,

      spreadBand:
        this.resolveSpreadBand(
          opportunity
            .rawSpreadPercent,
        ),

      profitTier:
        classifyProfitTier(
          opportunity
            .netProfitPercent,
        ),

      distanceToDiscoveryPercent:
        this.distanceTo(
          opportunity
            .netProfitPercent,
          PROFIT_TIER_POLICY
            .discoveryMinimumNetProfitPercent,
        ),

      distanceToQualificationPercent:
        this.distanceTo(
          opportunity
            .netProfitPercent,
          PROFIT_TIER_POLICY
            .qualificationMinimumNetProfitPercent,
        ),

      distanceToLivePercent:
        this.distanceTo(
          opportunity
            .netProfitPercent,
          PROFIT_TIER_POLICY
            .liveMinimumNetProfitPercent,
        ),

      rejectedAt:
        null,
    };
  }

  private resolveSpreadBand(
    rawSpreadPercent:
      number | null,
  ): SpreadBand | null {
    if (
      rawSpreadPercent ===
      null
    ) {
      return null;
    }

    if (
      rawSpreadPercent <
      0
    ) {
      return "NEGATIVE";
    }

    if (
      rawSpreadPercent <
      PROFIT_TIER_POLICY
        .discoveryMinimumNetProfitPercent
    ) {
      return "ZERO_TO_DISCOVERY";
    }

    if (
      rawSpreadPercent <
      PROFIT_TIER_POLICY
        .qualificationMinimumNetProfitPercent
    ) {
      return "DISCOVERY_TO_QUALIFICATION";
    }

    if (
      rawSpreadPercent <
      PROFIT_TIER_POLICY
        .liveMinimumNetProfitPercent
    ) {
      return "QUALIFICATION_TO_LIVE";
    }

    return "LIVE_PLUS";
  }

  private extractBlockers(
    record:
      OpportunityRejectionRecord,
  ): OpportunityNearMissRoute["blockers"] {
    const blockers:
      OpportunityNearMissRoute["blockers"][number][] =
      [];

    const gates = [
      {
        key:
          "quoteIntegrity",
        passedKey:
          "acceptable",
        stage:
          "QUOTE_INTEGRITY",
        code:
          "QUOTE_INTEGRITY_FAILED",
      },
      {
        key:
          "freshness",
        passedKey:
          "fresh",
        stage:
          "FRESHNESS",
        code:
          "STALE_EXECUTION_QUOTES",
      },
      {
        key:
          "fees",
        passedKey:
          "acceptable",
        stage:
          "FEES",
        code:
          "UNACCEPTABLE_FEES",
      },
      {
        key:
          "spread",
        passedKey:
          "acceptable",
        stage:
          "SPREAD_ANALYSIS",
        code:
          "UNACCEPTABLE_SPREAD",
      },
      {
        key:
          "liquidity",
        passedKey:
          "enough",
        stage:
          "LIQUIDITY",
        code:
          "INSUFFICIENT_LIQUIDITY",
      },
    ] as const;

    for (
      const gate
      of gates
    ) {
      const evidence =
        this.readRecord(
          record.metadata[
            gate.key
          ],
        );

      if (
        evidence?.[
          gate.passedKey
        ] !==
        false
      ) {
        continue;
      }

      blockers.push({
        stage:
          gate.stage,

        code:
          gate.code,

        reason:
          this.readString(
            evidence.reason,
          ) ??
          record.reason,
      });
    }

    if (
      blockers.length ===
      0
    ) {
      blockers.push({
        stage:
          record.stage,

        code:
          record.code,

        reason:
          record.reason,
      });
    }

    return blockers;
  }

  private readRecord(
    value:
      unknown,
  ): Record<string, unknown> | null {
    return typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
      ? value as Record<string, unknown>
      : null;
  }

  private readNumber(
    value:
      unknown,
  ): number | null {
    return typeof value ===
        "number" &&
      Number.isFinite(
        value,
      )
      ? value
      : null;
  }

  private readString(
    value:
      unknown,
  ): string | null {
    return typeof value ===
        "string" &&
      value.trim()
      ? value
      : null;
  }

  private distanceTo(
    value:
      number | null,

    threshold:
      number,
  ): number | null {
    if (
      value ===
      null
    ) {
      return null;
    }

    return Number(
      Math.max(
        0,
        threshold -
          value,
      ).toFixed(
        8,
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
      return 20;
    }

    return Math.min(
      limit,
      100,
    );
  }

  private emptyReport(
    _limit:
      number,
  ): OpportunityNearMissAnalyticsReport {
    return {
      generatedAt:
        Date.now(),

      scanStartedAt:
        null,

      scanCompletedAt:
        null,

      mode:
        "READ_ONLY_NEAR_MISS_ANALYTICS",

      executionAllowed:
        false,

      policy: {
        minimumSpreadPercent:
          null,

        discoveryMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .discoveryMinimumNetProfitPercent,

        qualificationMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .qualificationMinimumNetProfitPercent,

        liveMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .liveMinimumNetProfitPercent,
      },

      pipeline: {
        cachedQuotes:
          0,

        executionQualityEligibleQuotes:
          0,

        marketSnapshots:
          0,

        exchangePairs:
          0,

        acceptedOpportunities:
          0,

        economicallyEvaluatedPairs:
          0,

        rawPositiveSpreads:
          0,

        feePositiveSpreads:
          0,

        evaluatorRejectedPairs:
          0,
      },

      best: {
        rawSpreadPercent:
          null,

        netProfitPercent:
          null,

        route:
          null,
      },

      spreadBands: {
        negative:
          0,

        zeroToDiscovery:
          0,

        discoveryToQualification:
          0,

        qualificationToLive:
          0,

        livePlus:
          0,
      },

      rejectionSummary: {
        totalCurrentScanRejections:
          0,

        economicallyEvaluatedRejections:
          0,

        notEconomicallyEvaluated:
          0,

        byStage:
          {},

        byCode:
          {},
      },

      topNearMisses:
        [],

      notEconomicallyEvaluatedSamples:
        [],

      observations: [
        "No authoritative opportunity scan has completed yet.",
      ],
    };
  }
}

export const opportunityNearMissAnalyticsService =
  new OpportunityNearMissAnalyticsService();
