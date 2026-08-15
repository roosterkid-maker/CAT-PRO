import type {
  PortfolioAssetPosition,
  PortfolioSnapshot,
} from "../../portfolio/models/PortfolioSnapshot";

import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

export interface HedgeInventoryExposureSnapshotSource {
  getPortfolioSnapshot(
    now?:
      number,
  ):
    PortfolioSnapshot | null;
}

export type HedgeInventoryExposureGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "CONTROLLER_NOT_RUNNING"
  | "PORTFOLIO_EVIDENCE_UNAVAILABLE"
  | "PORTFOLIO_EVIDENCE_FUTURE_DATED"
  | "PORTFOLIO_EVIDENCE_STALE"
  | "VALUATION_QUOTE_ASSET_MISMATCH";

export type HedgeInventoryAssetBlocker =
  | "ASSET_BALANCE_NOT_REPORTED"
  | "INVALID_BALANCE_EVIDENCE"
  | "BALANCE_EVIDENCE_STALE"
  | "VALUATION_UNAVAILABLE"
  | "INVALID_VALUATION_EVIDENCE"
  | "VALUATION_EVIDENCE_STALE";

export type HedgeInventoryDeviationDirection =
  | "EXCESS"
  | "DEFICIT"
  | "BALANCED"
  | "UNKNOWN";

export type HedgeInventoryExposureState =
  | "WITHIN_TARGET"
  | "HEDGE_REVIEW"
  | "EXPOSURE_LIMIT_BREACHED"
  | "NO_DATA";

export type HedgeInventoryHedgeUrgency =
  | "NONE"
  | "NORMAL"
  | "URGENT"
  | "UNKNOWN";

export interface HedgeInventoryAssetAssessment {
  readonly asset:
    string;

  readonly evidenceStatus:
    StrategyEvidenceStatus;

  readonly actualQuantity:
    number | null;

  readonly targetQuantity:
    number;

  readonly deviationQuantity:
    number | null;

  readonly direction:
    HedgeInventoryDeviationDirection;

  readonly unitPriceQuote:
    number | null;

  readonly actualQuoteValue:
    number | null;

  readonly deviationQuoteValue:
    number | null;

  readonly maximumDeviationQuoteValue:
    number;

  readonly exposureLimitQuoteValue:
    number;

  readonly state:
    HedgeInventoryExposureState;

  readonly hedgeUrgency:
    HedgeInventoryHedgeUrgency;

  readonly observedExchanges:
    readonly string[];

  readonly newestBalanceSynchronizedAt:
    number | null;

  readonly oldestBalanceAgeMs:
    number | null;

  readonly oldestValuationAgeMs:
    number | null;

  readonly blockers:
    readonly HedgeInventoryAssetBlocker[];
}

export interface HedgeInventoryExposureSnapshot {
  readonly version:
    "22.1";

  readonly strategyId:
    "hedge-inventory-management";

  readonly generatedAt:
    number;

  readonly evidenceStatus:
    StrategyEvidenceStatus;

  readonly configurationState:
    string;

  readonly controllerRunning:
    boolean;

  readonly source:
    "PortfolioSnapshot";

  readonly sourceGeneratedAt:
    number | null;

  readonly sourceAgeMs:
    number | null;

  readonly sourceExpiresAt:
    number | null;

  readonly valuationQuoteAsset:
    string | null;

  readonly summary: {
    readonly configuredAssets:
      number;

    readonly assessedAssets:
      number;

    readonly withinTargetAssets:
      number;

    readonly hedgeReviewAssets:
      number;

    readonly exposureLimitBreachedAssets:
      number;

    readonly unavailableAssets:
      number;

    readonly grossDeviationQuoteValue:
      number | null;

    readonly hedgeActionableAssets:
      0;
  };

  readonly assessments:
    readonly HedgeInventoryAssetAssessment[];

  readonly blockers:
    readonly HedgeInventoryExposureGlobalBlocker[];

  readonly notes:
    readonly string[];

  readonly safety: {
    readonly readOnlyExposureEvidence:
      true;

    readonly classificationIsExecutionInstruction:
      false;

    readonly hedgeProposalGenerated:
      false;

    readonly hedgeIntentGenerated:
      false;

    readonly portfolioMutationAllowed:
      false;

    readonly balanceMutationAllowed:
      false;

    readonly recoveryActionAllowed:
      false;

    readonly capitalReservationAllowed:
      false;

    readonly paperExecutionAllowed:
      false;

    readonly liveExecutionAllowed:
      false;

    readonly orderSubmissionAllowed:
      false;
  };
}

const NOTES = [
  "V22.1 classifications are read-only SHADOW evidence, not hedge instructions or execution approval.",
  "Missing, stale, future-dated or unvalued inventory evidence remains NO_DATA and fails closed.",
  "Hedge ratio is configured for future proposal modeling but is not applied by V22.1.",
] as const;

const SAFETY = {
  readOnlyExposureEvidence:
    true,
  classificationIsExecutionInstruction:
    false,
  hedgeProposalGenerated:
    false,
  hedgeIntentGenerated:
    false,
  portfolioMutationAllowed:
    false,
  balanceMutationAllowed:
    false,
  recoveryActionAllowed:
    false,
  capitalReservationAllowed:
    false,
  paperExecutionAllowed:
    false,
  liveExecutionAllowed:
    false,
  orderSubmissionAllowed:
    false,
} as const;

export class HedgeInventoryExposureEvaluator {
  evaluate(
    configuration:
      HedgeInventoryManagementConfiguration,

    portfolio:
      PortfolioSnapshot | null,

    controllerRunning:
      boolean,

    now =
      Date.now(),
  ):
    HedgeInventoryExposureSnapshot {
    this.validateNow(
      now,
    );

    if (
      configuration.state !==
        "FOUNDATION_READY"
    ) {
      return this.unavailable(
        configuration,
        controllerRunning,
        now,
        null,
        [
          "STRATEGY_CONFIGURATION_NOT_READY",
        ],
      );
    }

    if (
      portfolio ===
        null
    ) {
      return this.unavailable(
        configuration,
        controllerRunning,
        now,
        null,
        [
          controllerRunning
            ? "PORTFOLIO_EVIDENCE_UNAVAILABLE"
            : "CONTROLLER_NOT_RUNNING",
        ],
      );
    }

    const globalBlockers:
      HedgeInventoryExposureGlobalBlocker[] =
      [];

    if (
      !Number.isFinite(
        portfolio.generatedAt,
      ) ||
      portfolio.generatedAt >
        now
    ) {
      globalBlockers.push(
        "PORTFOLIO_EVIDENCE_FUTURE_DATED",
      );
    } else if (
      now -
        portfolio.generatedAt >
      configuration.maximumExposureAgeMs!
    ) {
      globalBlockers.push(
        "PORTFOLIO_EVIDENCE_STALE",
      );
    }

    if (
      portfolio.baseCurrency !==
        configuration.valuationQuoteAsset
    ) {
      globalBlockers.push(
        "VALUATION_QUOTE_ASSET_MISMATCH",
      );
    }

    if (
      globalBlockers.length >
        0
    ) {
      return this.unavailable(
        configuration,
        controllerRunning,
        now,
        portfolio,
        globalBlockers,
      );
    }

    const positions =
      portfolio.exchanges
        .flatMap(
          (exchange) =>
            exchange.assets,
        );

    const assessments =
      configuration
        .assetAllowlist
        .map(
          (asset) =>
            this.assessAsset(
              asset,
              configuration
                .targetInventoryByAsset[
                  asset
                ]!,
              positions.filter(
                (position) =>
                  position.asset
                    .trim()
                    .toUpperCase() ===
                  asset,
              ),
              configuration,
              now,
            ),
        );

    const available =
      assessments.filter(
        (assessment) =>
          assessment.evidenceStatus ===
          "AVAILABLE",
      );

    return immutableClone({
      version:
        "22.1",
      strategyId:
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt:
        now,
      evidenceStatus:
        available.length >
          0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState:
        configuration.state,
      controllerRunning,
      source:
        "PortfolioSnapshot",
      sourceGeneratedAt:
        portfolio.generatedAt,
      sourceAgeMs:
        round(
          now -
            portfolio.generatedAt,
          0,
        ),
      sourceExpiresAt:
        portfolio.generatedAt +
        configuration.maximumExposureAgeMs!,
      valuationQuoteAsset:
        configuration.valuationQuoteAsset,
      summary: {
        configuredAssets:
          assessments.length,
        assessedAssets:
          available.length,
        withinTargetAssets:
          this.countState(
            assessments,
            "WITHIN_TARGET",
          ),
        hedgeReviewAssets:
          this.countState(
            assessments,
            "HEDGE_REVIEW",
          ),
        exposureLimitBreachedAssets:
          this.countState(
            assessments,
            "EXPOSURE_LIMIT_BREACHED",
          ),
        unavailableAssets:
          assessments.length -
          available.length,
        grossDeviationQuoteValue:
          available.length >
            0
            ? round(
                available.reduce(
                  (
                    total,
                    assessment,
                  ) =>
                    total +
                    assessment
                      .deviationQuoteValue!,
                  0,
                ),
              )
            : null,
        hedgeActionableAssets:
          0,
      },
      assessments,
      blockers:
        [],
      notes:
        NOTES,
      safety:
        SAFETY,
    });
  }

  private unavailable(
    configuration:
      HedgeInventoryManagementConfiguration,
    controllerRunning:
      boolean,
    now:
      number,
    portfolio:
      PortfolioSnapshot | null,
    blockers:
      readonly HedgeInventoryExposureGlobalBlocker[],
  ):
    HedgeInventoryExposureSnapshot {
    const sourceGeneratedAt =
      portfolio?.generatedAt ??
      null;

    const sourceAgeMs =
      sourceGeneratedAt !==
        null &&
      Number.isFinite(
        sourceGeneratedAt,
      )
        ? round(
            now -
              sourceGeneratedAt,
            0,
          )
        : null;

    return immutableClone({
      version:
        "22.1",
      strategyId:
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt:
        now,
      evidenceStatus:
        "NO_DATA",
      configurationState:
        configuration.state,
      controllerRunning,
      source:
        "PortfolioSnapshot",
      sourceGeneratedAt,
      sourceAgeMs,
      sourceExpiresAt:
        sourceGeneratedAt !==
          null &&
        Number.isFinite(
          sourceGeneratedAt,
        ) &&
        configuration.maximumExposureAgeMs !==
          null
          ? sourceGeneratedAt +
            configuration.maximumExposureAgeMs
          : null,
      valuationQuoteAsset:
        configuration.valuationQuoteAsset,
      summary: {
        configuredAssets:
          configuration
            .assetAllowlist
            .length,
        assessedAssets:
          0,
        withinTargetAssets:
          0,
        hedgeReviewAssets:
          0,
        exposureLimitBreachedAssets:
          0,
        unavailableAssets:
          configuration
            .assetAllowlist
            .length,
        grossDeviationQuoteValue:
          null,
        hedgeActionableAssets:
          0,
      },
      assessments:
        [],
      blockers:
        blockers,
      notes:
        NOTES,
      safety:
        SAFETY,
    });
  }

  private assessAsset(
    asset:
      string,
    targetQuantity:
      number,
    positions:
      readonly PortfolioAssetPosition[],
    configuration:
      HedgeInventoryManagementConfiguration,
    now:
      number,
  ):
    HedgeInventoryAssetAssessment {
    const blockers:
      HedgeInventoryAssetBlocker[] =
      [];

    if (
      positions.length ===
        0
    ) {
      blockers.push(
        "ASSET_BALANCE_NOT_REPORTED",
      );
    }

    for (
      const position
      of positions
    ) {
      if (
        !Number.isFinite(
          position.totalBalance,
        ) ||
        position.totalBalance <
          0 ||
        !Number.isFinite(
          position.synchronizedAt,
        ) ||
        position.synchronizedAt <=
          0 ||
        position.synchronizedAt >
          now
      ) {
        blockers.push(
          "INVALID_BALANCE_EVIDENCE",
        );
      } else if (
        now -
          position.synchronizedAt >
        configuration.maximumExposureAgeMs!
      ) {
        blockers.push(
          "BALANCE_EVIDENCE_STALE",
        );
      }

      if (
        position.valuationSource ===
          "UNAVAILABLE" ||
        position.priceUsdt ===
          null ||
        position.totalValueUsdt ===
          null ||
        position.valuationTimestamp ===
          null
      ) {
        blockers.push(
          "VALUATION_UNAVAILABLE",
        );
      } else if (
        !Number.isFinite(
          position.priceUsdt,
        ) ||
        position.priceUsdt <=
          0 ||
        !Number.isFinite(
          position.totalValueUsdt,
        ) ||
        position.totalValueUsdt <
          0 ||
        !Number.isFinite(
          position.valuationTimestamp,
        ) ||
        position.valuationTimestamp <=
          0 ||
        position.valuationTimestamp >
          now
      ) {
        blockers.push(
          "INVALID_VALUATION_EVIDENCE",
        );
      } else if (
        now -
          position.valuationTimestamp >
        configuration.maximumExposureAgeMs!
      ) {
        blockers.push(
          "VALUATION_EVIDENCE_STALE",
        );
      }
    }

    const uniqueBlockers =
      [
        ...new Set(
          blockers,
        ),
      ];

    if (
      uniqueBlockers.length >
        0
    ) {
      return {
        asset,
        evidenceStatus:
          "NO_DATA",
        actualQuantity:
          null,
        targetQuantity,
        deviationQuantity:
          null,
        direction:
          "UNKNOWN",
        unitPriceQuote:
          null,
        actualQuoteValue:
          null,
        deviationQuoteValue:
          null,
        maximumDeviationQuoteValue:
          configuration.maximumDeviationQuoteValue!,
        exposureLimitQuoteValue:
          configuration.exposureLimitQuoteValue!,
        state:
          "NO_DATA",
        hedgeUrgency:
          "UNKNOWN",
        observedExchanges:
          this.observedExchanges(
            positions,
          ),
        newestBalanceSynchronizedAt:
          null,
        oldestBalanceAgeMs:
          null,
        oldestValuationAgeMs:
          null,
        blockers:
          uniqueBlockers,
      };
    }

    const actualQuantity =
      positions.reduce(
        (
          total,
          position,
        ) =>
          total +
          position.totalBalance,
        0,
      );

    const actualQuoteValue =
      positions.reduce(
        (
          total,
          position,
        ) =>
          total +
          position.totalValueUsdt!,
        0,
      );

    const unitPriceQuote =
      actualQuantity >
        0
        ? actualQuoteValue /
          actualQuantity
        : positions.reduce(
            (
              total,
              position,
            ) =>
              total +
              position.priceUsdt!,
            0,
          ) /
          positions.length;

    const deviationQuantity =
      actualQuantity -
      targetQuantity;

    const deviationQuoteValue =
      Math.abs(
        deviationQuantity,
      ) *
      unitPriceQuote;

    const direction:
      HedgeInventoryDeviationDirection =
      Math.abs(
        deviationQuantity,
      ) <=
        1e-12
        ? "BALANCED"
        : deviationQuantity >
            0
          ? "EXCESS"
          : "DEFICIT";

    const state:
      HedgeInventoryExposureState =
      deviationQuoteValue >=
        configuration.exposureLimitQuoteValue!
        ? "EXPOSURE_LIMIT_BREACHED"
        : deviationQuoteValue >=
            configuration.maximumDeviationQuoteValue!
          ? "HEDGE_REVIEW"
          : "WITHIN_TARGET";

    const hedgeUrgency:
      HedgeInventoryHedgeUrgency =
      state ===
        "EXPOSURE_LIMIT_BREACHED"
        ? "URGENT"
        : state ===
            "HEDGE_REVIEW"
          ? "NORMAL"
          : "NONE";

    return {
      asset,
      evidenceStatus:
        "AVAILABLE",
      actualQuantity:
        round(
          actualQuantity,
        ),
      targetQuantity:
        round(
          targetQuantity,
        ),
      deviationQuantity:
        round(
          deviationQuantity,
        ),
      direction,
      unitPriceQuote:
        round(
          unitPriceQuote,
        ),
      actualQuoteValue:
        round(
          actualQuoteValue,
        ),
      deviationQuoteValue:
        round(
          deviationQuoteValue,
        ),
      maximumDeviationQuoteValue:
        configuration.maximumDeviationQuoteValue!,
      exposureLimitQuoteValue:
        configuration.exposureLimitQuoteValue!,
      state,
      hedgeUrgency,
      observedExchanges:
        this.observedExchanges(
          positions,
        ),
      newestBalanceSynchronizedAt:
        Math.max(
          ...positions.map(
            (position) =>
              position.synchronizedAt,
          ),
        ),
      oldestBalanceAgeMs:
        Math.max(
          ...positions.map(
            (position) =>
              now -
              position.synchronizedAt,
          ),
        ),
      oldestValuationAgeMs:
        Math.max(
          ...positions.map(
            (position) =>
              now -
              position.valuationTimestamp!,
          ),
        ),
      blockers:
        [],
    };
  }

  private observedExchanges(
    positions:
      readonly PortfolioAssetPosition[],
  ):
    readonly string[] {
    return [
      ...new Set(
        positions.map(
          (position) =>
            position.exchange
              .trim()
              .toLowerCase(),
        ),
      ),
    ].sort();
  }

  private countState(
    assessments:
      readonly HedgeInventoryAssetAssessment[],
    state:
      HedgeInventoryExposureState,
  ):
    number {
    return assessments.filter(
      (assessment) =>
        assessment.state ===
        state,
    ).length;
  }

  private validateNow(
    now:
      number,
  ):
    void {
    if (
      !Number.isFinite(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "Hedge / inventory exposure evaluation timestamp must be a positive finite number.",
      );
    }
  }
}

function round(
  value:
    number,
  decimalPlaces =
    8,
): number {
  const multiplier =
    10 **
    decimalPlaces;

  return Math.round(
    (
      value +
      Number.EPSILON
    ) *
    multiplier,
  ) /
  multiplier;
}

function immutableClone<T>(
  value:
    T,
): T {
  return deepFreeze(
    structuredClone(
      value,
    ),
  );
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}

