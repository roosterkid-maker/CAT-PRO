import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

import type {
  HedgeInventoryAssetAssessment,
  HedgeInventoryExposureSnapshot,
  HedgeInventoryExposureState,
  HedgeInventoryHedgeUrgency,
} from "./HedgeInventoryExposureEvaluator";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

export type HedgeInventoryShadowTargetState =
  | "TARGET_MODELED"
  | "NOT_REQUIRED"
  | "BLOCKED";

export type HedgeInventoryShadowTargetSide =
  | "BUY"
  | "SELL"
  | "NONE";

export type HedgeInventoryShadowTargetBlocker =
  | "ASSET_EXPOSURE_EVIDENCE_UNAVAILABLE"
  | "INVALID_DEVIATION_EVIDENCE"
  | "HEDGE_VENUE_NOT_SELECTED"
  | "EXECUTION_MARKET_NOT_VERIFIED"
  | "EXECUTABLE_DEPTH_NOT_EVALUATED"
  | "HEDGE_FEES_NOT_EVALUATED"
  | "HEDGE_SLIPPAGE_NOT_EVALUATED"
  | "BASIS_CORRELATION_RISK_NOT_EVALUATED"
  | "RISK_APPROVAL_NOT_EVALUATED"
  | "CAPITAL_NOT_RESERVED";

export type HedgeInventoryShadowTargetGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "EXPOSURE_EVIDENCE_UNAVAILABLE"
  | "EXPOSURE_EVIDENCE_STALE";

export interface HedgeInventoryShadowTarget {
  readonly id:
    string;

  readonly asset:
    string;

  readonly valuationQuoteAsset:
    string;

  readonly valuationPair:
    string;

  readonly evidenceStatus:
    StrategyEvidenceStatus;

  readonly state:
    HedgeInventoryShadowTargetState;

  readonly side:
    HedgeInventoryShadowTargetSide;

  readonly urgency:
    HedgeInventoryHedgeUrgency;

  readonly sourceExposureState:
    HedgeInventoryExposureState;

  readonly sourceDirection:
    string;

  readonly hedgeRatio:
    number;

  readonly deviationQuantity:
    number | null;

  readonly deviationQuoteValue:
    number | null;

  readonly modeledTargetQuantity:
    number | null;

  readonly modeledTargetQuoteValue:
    number | null;

  readonly modeledResidualDeviationQuantity:
    number | null;

  readonly modeledResidualDeviationQuoteValue:
    number | null;

  readonly modeledResidualState:
    HedgeInventoryExposureState;

  readonly candidateVenues:
    readonly string[];

  readonly selectedVenue:
    null;

  readonly executionMarket:
    null;

  readonly selectedPrice:
    null;

  readonly executableQuantity:
    null;

  readonly estimatedFeeQuoteValue:
    null;

  readonly estimatedSlippageQuoteValue:
    null;

  readonly totalEstimatedCostQuoteValue:
    null;

  readonly executionAuthorized:
    false;

  readonly automaticExecutionAllowed:
    false;

  readonly blockers:
    readonly HedgeInventoryShadowTargetBlocker[];

  readonly recursionProtection: {
    readonly sourceStrategyId:
      "hedge-inventory-management";

    readonly parentIntentId:
      null;

    readonly recursionDepth:
      0;

    readonly maximumRecursionDepth:
      0;

    readonly recursiveHedgeAllowed:
      false;
  };
}

export interface HedgeInventoryShadowTargetSnapshot {
  readonly version:
    "22.2";

  readonly strategyId:
    "hedge-inventory-management";

  readonly generatedAt:
    number;

  readonly evidenceStatus:
    StrategyEvidenceStatus;

  readonly configurationState:
    string;

  readonly sourceExposureGeneratedAt:
    number | null;

  readonly sourcePortfolioGeneratedAt:
    number | null;

  readonly sourceExpiresAt:
    number | null;

  readonly summary: {
    readonly configuredAssets:
      number;

    readonly hedgeRequiredAssets:
      number;

    readonly modeledTargets:
      number;

    readonly notRequiredAssets:
      number;

    readonly blockedAssets:
      number;

    readonly totalModeledTargetQuoteValue:
      number | null;

    readonly actionableTargets:
      0;

    readonly intentsGenerated:
      0;
  };

  readonly targets:
    readonly HedgeInventoryShadowTarget[];

  readonly blockers:
    readonly HedgeInventoryShadowTargetGlobalBlocker[];

  readonly notes:
    readonly string[];

  readonly safety: {
    readonly shadowTargetEvidenceOnly:
      true;

    readonly targetIsHedgeProposal:
      false;

    readonly targetIsStrategyIntent:
      false;

    readonly venueSelectionAllowed:
      false;

    readonly hedgeProposalGenerationAllowed:
      false;

    readonly hedgeIntentGenerationAllowed:
      false;

    readonly recursiveHedgeAllowed:
      false;

    readonly paperExecutionAllowed:
      false;

    readonly liveExecutionAllowed:
      false;

    readonly capitalReservationAllowed:
      false;

    readonly orderSubmissionAllowed:
      false;
  };
}

const UNRESOLVED_EXECUTION_BLOCKERS = [
  "HEDGE_VENUE_NOT_SELECTED",
  "EXECUTION_MARKET_NOT_VERIFIED",
  "EXECUTABLE_DEPTH_NOT_EVALUATED",
  "HEDGE_FEES_NOT_EVALUATED",
  "HEDGE_SLIPPAGE_NOT_EVALUATED",
  "BASIS_CORRELATION_RISK_NOT_EVALUATED",
  "RISK_APPROVAL_NOT_EVALUATED",
  "CAPITAL_NOT_RESERVED",
] as const satisfies readonly HedgeInventoryShadowTargetBlocker[];

const NOTES = [
  "V22.2 applies the configured hedge ratio to verified deviation evidence only; the result is a non-executable SHADOW target.",
  "Candidate venues are allowlist evidence, not selected routes or proof of executable liquidity.",
  "Fees, slippage, basis/correlation risk, risk approval and capital remain unresolved before any future proposal or intent.",
] as const;

const SAFETY = {
  shadowTargetEvidenceOnly:
    true,
  targetIsHedgeProposal:
    false,
  targetIsStrategyIntent:
    false,
  venueSelectionAllowed:
    false,
  hedgeProposalGenerationAllowed:
    false,
  hedgeIntentGenerationAllowed:
    false,
  recursiveHedgeAllowed:
    false,
  paperExecutionAllowed:
    false,
  liveExecutionAllowed:
    false,
  capitalReservationAllowed:
    false,
  orderSubmissionAllowed:
    false,
} as const;

export class HedgeInventoryShadowTargetPlanner {
  plan(
    configuration:
      HedgeInventoryManagementConfiguration,
    exposure:
      HedgeInventoryExposureSnapshot,
    now =
      Date.now(),
  ):
    HedgeInventoryShadowTargetSnapshot {
    this.validateNow(
      now,
    );

    if (
      configuration.state !==
        "FOUNDATION_READY"
    ) {
      return this.unavailable(
        configuration,
        exposure,
        now,
        "STRATEGY_CONFIGURATION_NOT_READY",
      );
    }

    if (
      exposure.evidenceStatus !==
        "AVAILABLE"
    ) {
      return this.unavailable(
        configuration,
        exposure,
        now,
        "EXPOSURE_EVIDENCE_UNAVAILABLE",
      );
    }

    if (
      exposure.sourceExpiresAt ===
        null ||
      exposure.sourceExpiresAt <
        now
    ) {
      return this.unavailable(
        configuration,
        exposure,
        now,
        "EXPOSURE_EVIDENCE_STALE",
      );
    }

    const targets =
      exposure.assessments
        .map(
          (assessment) =>
            this.planAsset(
              configuration,
              assessment,
              exposure.sourceGeneratedAt!,
            ),
        );

    const modeled =
      targets.filter(
        (target) =>
          target.state ===
          "TARGET_MODELED",
      );

    return immutableClone({
      version:
        "22.2",
      strategyId:
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt:
        now,
      evidenceStatus:
        targets.length >
          0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState:
        configuration.state,
      sourceExposureGeneratedAt:
        exposure.generatedAt,
      sourcePortfolioGeneratedAt:
        exposure.sourceGeneratedAt,
      sourceExpiresAt:
        exposure.sourceExpiresAt,
      summary: {
        configuredAssets:
          targets.length,
        hedgeRequiredAssets:
          targets.filter(
            (target) =>
              target.sourceExposureState ===
                "HEDGE_REVIEW" ||
              target.sourceExposureState ===
                "EXPOSURE_LIMIT_BREACHED",
          ).length,
        modeledTargets:
          modeled.length,
        notRequiredAssets:
          targets.filter(
            (target) =>
              target.state ===
              "NOT_REQUIRED",
          ).length,
        blockedAssets:
          targets.filter(
            (target) =>
              target.state ===
              "BLOCKED",
          ).length,
        totalModeledTargetQuoteValue:
          modeled.length >
            0
            ? round(
                modeled.reduce(
                  (
                    total,
                    target,
                  ) =>
                    total +
                    target
                      .modeledTargetQuoteValue!,
                  0,
                ),
              )
            : null,
        actionableTargets:
          0,
        intentsGenerated:
          0,
      },
      targets,
      blockers:
        [],
      notes:
        NOTES,
      safety:
        SAFETY,
    });
  }

  private planAsset(
    configuration:
      HedgeInventoryManagementConfiguration,
    assessment:
      HedgeInventoryAssetAssessment,
    sourceGeneratedAt:
      number,
  ):
    HedgeInventoryShadowTarget {
    const common = {
      id: [
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
        "target",
        sourceGeneratedAt,
        assessment.asset,
      ].join(
        ":",
      ),
      asset:
        assessment.asset,
      valuationQuoteAsset:
        configuration.valuationQuoteAsset!,
      valuationPair:
        `${assessment.asset}${configuration.valuationQuoteAsset!}`,
      sourceExposureState:
        assessment.state,
      sourceDirection:
        assessment.direction,
      hedgeRatio:
        configuration.hedgeRatio!,
      candidateVenues:
        configuration.hedgeVenueAllowlist,
      selectedVenue:
        null,
      executionMarket:
        null,
      selectedPrice:
        null,
      executableQuantity:
        null,
      estimatedFeeQuoteValue:
        null,
      estimatedSlippageQuoteValue:
        null,
      totalEstimatedCostQuoteValue:
        null,
      executionAuthorized:
        false as const,
      automaticExecutionAllowed:
        false as const,
      recursionProtection: {
        sourceStrategyId:
          HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
        parentIntentId:
          null,
        recursionDepth:
          0 as const,
        maximumRecursionDepth:
          0 as const,
        recursiveHedgeAllowed:
          false as const,
      },
    };

    if (
      assessment.evidenceStatus !==
        "AVAILABLE"
    ) {
      return {
        ...common,
        evidenceStatus:
          "NO_DATA",
        state:
          "BLOCKED",
        side:
          "NONE",
        urgency:
          "UNKNOWN",
        deviationQuantity:
          null,
        deviationQuoteValue:
          null,
        modeledTargetQuantity:
          null,
        modeledTargetQuoteValue:
          null,
        modeledResidualDeviationQuantity:
          null,
        modeledResidualDeviationQuoteValue:
          null,
        modeledResidualState:
          "NO_DATA",
        blockers: [
          "ASSET_EXPOSURE_EVIDENCE_UNAVAILABLE",
        ],
      };
    }

    if (
      assessment.state ===
        "WITHIN_TARGET"
    ) {
      return {
        ...common,
        evidenceStatus:
          "AVAILABLE",
        state:
          "NOT_REQUIRED",
        side:
          "NONE",
        urgency:
          "NONE",
        deviationQuantity:
          assessment.deviationQuantity,
        deviationQuoteValue:
          assessment.deviationQuoteValue,
        modeledTargetQuantity:
          0,
        modeledTargetQuoteValue:
          0,
        modeledResidualDeviationQuantity:
          assessment.deviationQuantity,
        modeledResidualDeviationQuoteValue:
          assessment.deviationQuoteValue,
        modeledResidualState:
          "WITHIN_TARGET",
        blockers:
          [],
      };
    }

    if (
      assessment.deviationQuantity ===
        null ||
      assessment.deviationQuoteValue ===
        null ||
      assessment.unitPriceQuote ===
        null ||
      !Number.isFinite(
        assessment.deviationQuantity,
      ) ||
      !Number.isFinite(
        assessment.deviationQuoteValue,
      ) ||
      !Number.isFinite(
        assessment.unitPriceQuote,
      ) ||
      assessment.unitPriceQuote <=
        0 ||
      (
        assessment.direction !==
          "EXCESS" &&
        assessment.direction !==
          "DEFICIT"
      )
    ) {
      return {
        ...common,
        evidenceStatus:
          "NO_DATA",
        state:
          "BLOCKED",
        side:
          "NONE",
        urgency:
          "UNKNOWN",
        deviationQuantity:
          assessment.deviationQuantity,
        deviationQuoteValue:
          assessment.deviationQuoteValue,
        modeledTargetQuantity:
          null,
        modeledTargetQuoteValue:
          null,
        modeledResidualDeviationQuantity:
          null,
        modeledResidualDeviationQuoteValue:
          null,
        modeledResidualState:
          "NO_DATA",
        blockers: [
          "INVALID_DEVIATION_EVIDENCE",
        ],
      };
    }

    const modeledTargetQuantity =
      Math.abs(
        assessment.deviationQuantity,
      ) *
      configuration.hedgeRatio!;

    const modeledTargetQuoteValue =
      modeledTargetQuantity *
      assessment.unitPriceQuote;

    const residualAbsoluteQuantity =
      Math.max(
        0,
        Math.abs(
          assessment.deviationQuantity,
        ) -
        modeledTargetQuantity,
      );

    const residualQuantity =
      assessment.direction ===
        "EXCESS"
        ? residualAbsoluteQuantity
        : -residualAbsoluteQuantity;

    const residualQuoteValue =
      residualAbsoluteQuantity *
      assessment.unitPriceQuote;

    const residualState =
      this.classifyResidual(
        residualQuoteValue,
        configuration,
      );

    return {
      ...common,
      evidenceStatus:
        "AVAILABLE",
      state:
        "TARGET_MODELED",
      side:
        assessment.direction ===
          "EXCESS"
          ? "SELL"
          : "BUY",
      urgency:
        assessment.hedgeUrgency,
      deviationQuantity:
        assessment.deviationQuantity,
      deviationQuoteValue:
        assessment.deviationQuoteValue,
      modeledTargetQuantity:
        round(
          modeledTargetQuantity,
        ),
      modeledTargetQuoteValue:
        round(
          modeledTargetQuoteValue,
        ),
      modeledResidualDeviationQuantity:
        round(
          residualQuantity,
        ),
      modeledResidualDeviationQuoteValue:
        round(
          residualQuoteValue,
        ),
      modeledResidualState:
        residualState,
      blockers:
        UNRESOLVED_EXECUTION_BLOCKERS,
    };
  }

  private classifyResidual(
    residualQuoteValue:
      number,
    configuration:
      HedgeInventoryManagementConfiguration,
  ):
    HedgeInventoryExposureState {
    if (
      residualQuoteValue >=
      configuration.exposureLimitQuoteValue!
    ) {
      return "EXPOSURE_LIMIT_BREACHED";
    }

    if (
      residualQuoteValue >=
      configuration.maximumDeviationQuoteValue!
    ) {
      return "HEDGE_REVIEW";
    }

    return "WITHIN_TARGET";
  }

  private unavailable(
    configuration:
      HedgeInventoryManagementConfiguration,
    exposure:
      HedgeInventoryExposureSnapshot,
    now:
      number,
    blocker:
      HedgeInventoryShadowTargetGlobalBlocker,
  ):
    HedgeInventoryShadowTargetSnapshot {
    return immutableClone({
      version:
        "22.2",
      strategyId:
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt:
        now,
      evidenceStatus:
        "NO_DATA",
      configurationState:
        configuration.state,
      sourceExposureGeneratedAt:
        exposure.generatedAt,
      sourcePortfolioGeneratedAt:
        exposure.sourceGeneratedAt,
      sourceExpiresAt:
        exposure.sourceExpiresAt,
      summary: {
        configuredAssets:
          configuration.assetAllowlist.length,
        hedgeRequiredAssets:
          0,
        modeledTargets:
          0,
        notRequiredAssets:
          0,
        blockedAssets:
          configuration.assetAllowlist.length,
        totalModeledTargetQuoteValue:
          null,
        actionableTargets:
          0,
        intentsGenerated:
          0,
      },
      targets:
        [],
      blockers: [
        blocker,
      ],
      notes:
        NOTES,
      safety:
        SAFETY,
    });
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
        "Hedge target planning timestamp must be a positive finite number.",
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

