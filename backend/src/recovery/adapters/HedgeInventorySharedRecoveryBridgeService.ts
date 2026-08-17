import type {
  HedgeInventoryShadowRecoveryActionHandoff,
} from "../../strategies/hedge-inventory-management/HedgeInventoryShadowRecoveryActionHandoffPlanner";

import type {
  SharedRecoveryIntent,
} from "../models/SharedRecoveryIntent";

import {
  sharedRecoveryIntentService,
} from "../services/SharedRecoveryIntentService";

export interface HedgeInventorySharedRecoveryBridgeResult {
  readonly generatedAt: number;

  readonly sourceHandoffs: number;

  readonly staged: number;

  readonly rejected: number;

  readonly stagedIntents:
    readonly SharedRecoveryIntent[];

  readonly rejections:
    readonly {
      readonly sourceEvidenceId: string;
      readonly reason: string;
    }[];

  readonly executionAuthorized: false;

  readonly orderSubmissionAllowed: false;
}

/**
 * Recovery-owned anti-corruption adapter for legacy hedge/inventory evidence.
 *
 * The strategy layer never imports recovery. This outer adapter consumes an
 * immutable handoff and maps it into the strategy-neutral shared contract.
 */
export class HedgeInventorySharedRecoveryBridgeService {
  synchronize(
    handoffs:
      readonly HedgeInventoryShadowRecoveryActionHandoff[],

    now =
      Date.now(),
  ): HedgeInventorySharedRecoveryBridgeResult {
    const stagedIntents:
      SharedRecoveryIntent[] =
      [];

    const rejections:
      Array<{
        sourceEvidenceId: string;
        reason: string;
      }> =
      [];

    for (
      const handoff
      of handoffs
    ) {
      try {
        if (
          handoff.status !==
            "HANDOFF_READY" ||
          handoff.mode !==
            "SHADOW" ||
          handoff.recoveryIncidentCreated ||
          handoff.recoveryActionMaterialized ||
          handoff.canonicalExecutionPlanCreated ||
          handoff.capitalReservationCreated ||
          handoff.executionAuthorized ||
          handoff.automaticExecutionAllowed ||
          handoff.orderSubmissionAuthorized ||
          handoff.leg.orderTypeSelected ||
          handoff.leg.timeInForceSelected ||
          handoff.leg.submissionAuthorized
        ) {
          throw new Error(
            "Source handoff violates the non-executable SHADOW contract.",
          );
        }

        stagedIntents.push(
          sharedRecoveryIntentService
            .stage(
              {
                sourceStrategyId:
                  handoff.strategyId,
                sourceEvidenceId:
                  handoff.id,
                sourceValidationHash:
                  handoff.validationHash,
                sourceType:
                  "STRATEGY_RESIDUAL_EXPOSURE",
                mode:
                  "SHADOW",
                severity:
                  handoff.sourceSeverity,
                routeId:
                  handoff.routeId,
                asset:
                  handoff.asset,
                quoteAsset:
                  handoff.quoteAsset,
                residualDirection:
                  handoff.residualDirection,
                venue:
                  handoff.leg.venue,
                market:
                  handoff.leg.market,
                side:
                  handoff.leg.side,
                quantity:
                  handoff.leg.quantity,
                referencePrice:
                  handoff.leg.referencePrice,
                estimatedQuoteValue:
                  handoff.leg.estimatedQuoteValue,
                sourceCreatedAt:
                  handoff.createdAt,
                sourceExpiresAt:
                  handoff.expiresAt,
              },
              now,
            ),
        );
      } catch (
        error:
          unknown
      ) {
        rejections.push({
          sourceEvidenceId:
            handoff.id,
          reason:
            error instanceof Error
              ? error.message
              : "Unknown shared recovery staging rejection.",
        });
      }
    }

    return {
      generatedAt:
        now,
      sourceHandoffs:
        handoffs.length,
      staged:
        stagedIntents.length,
      rejected:
        rejections.length,
      stagedIntents,
      rejections,
      executionAuthorized:
        false,
      orderSubmissionAllowed:
        false,
    };
  }
}

export const hedgeInventorySharedRecoveryBridgeService =
  new HedgeInventorySharedRecoveryBridgeService();
