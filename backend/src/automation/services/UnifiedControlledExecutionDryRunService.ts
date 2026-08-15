import type {
  UnifiedControlledExecutionDryRunResult,
} from "../models/UnifiedControlledExecutionDryRun";

import {
  controlledCoordinatorDryBridgeService,
} from "./ControlledCoordinatorDryBridgeService";

import {
  controlledReconciliationSettlementValidationService,
} from "./ControlledReconciliationSettlementValidationService";

import {
  controlledRecoveryStateMachineValidationService,
} from "./ControlledRecoveryStateMachineValidationService";

import {
  controlledTwoLegExecutionService,
} from "./ControlledTwoLegExecutionService";

import {
  liveCandidateEligibilityService,
} from "./LiveCandidateEligibilityService";

import {
  liveFinalLastLookService,
} from "./LiveFinalLastLookService";

import {
  liveOrderValidationService,
} from "./LiveOrderValidationService";

const MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL =
  100;

export class UnifiedControlledExecutionDryRunService {
  async run(
    candidateKey: string,
    capital: number,
  ): Promise<
    UnifiedControlledExecutionDryRunResult
  > {
    const normalizedCandidateKey =
      candidateKey.trim();

    const blockers:
      string[] =
      [];

    const reasons:
      string[] =
      [];

    if (
      !normalizedCandidateKey
    ) {
      throw new Error(
        "Candidate key is required.",
      );
    }

    if (
      !Number.isFinite(
        capital,
      ) ||
      capital <=
        0
    ) {
      throw new Error(
        "Capital must be a positive finite number.",
      );
    }

    if (
      capital >
      MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL
    ) {
      throw new Error(
        `Version 17.2 Build 5 validation capital must not exceed ₹${MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL}.`,
      );
    }

    /*
     * ---------------------------------------------
     * STAGE 1
     * CANDIDATE ELIGIBILITY
     * ---------------------------------------------
     */
    const eligibility =
      await liveCandidateEligibilityService
        .evaluate({
          candidateKey:
            normalizedCandidateKey,

          capital,
        });

    /*
     * ---------------------------------------------
     * STAGE 2
     * FINAL LAST LOOK
     * ---------------------------------------------
     */
    const lastLook =
      liveFinalLastLookService
        .evaluate({
          candidateKey:
            normalizedCandidateKey,

          capital,
        });

    /*
     * ---------------------------------------------
     * STAGE 3
     * EXCHANGE ORDER VALIDATION
     * ---------------------------------------------
     */
    const orderValidation =
      await liveOrderValidationService
        .evaluate(
          normalizedCandidateKey,

          capital,
        );

    /*
     * ---------------------------------------------
     * STAGE 4
     * TWO-LEG PREPARATION
     * ---------------------------------------------
     */
    const twoLegPlan =
      await controlledTwoLegExecutionService
        .prepare(
          normalizedCandidateKey,

          capital,
        );

    const candidateEvidenceReady =
      twoLegPlan.status ===
        "PREPARED" &&
      lastLook.passed &&
      orderValidation.status !==
        "BLOCKED";

    /*
     * ---------------------------------------------
     * STAGE 5
     * COORDINATOR/LIFECYCLE DRY BRIDGE
     * ---------------------------------------------
     *
     * IMPORTANT:
     *
     * Do not mutate coordinator state if upstream
     * evidence has already failed.
     */
    let coordinatorDryBridge =
      null;

    if (
      candidateEvidenceReady
    ) {
      coordinatorDryBridge =
        await controlledCoordinatorDryBridgeService
          .validate(
            normalizedCandidateKey,

            capital,
          );
    }

    /*
     * ---------------------------------------------
     * STAGE 6
     * RECOVERY INFRASTRUCTURE
     * ---------------------------------------------
     *
     * Synthetic only.
     */
    const recoveryStateMachine =
      controlledRecoveryStateMachineValidationService
        .runSuite();

    /*
     * ---------------------------------------------
     * STAGE 7
     * RECONCILIATION + SETTLEMENT
     * ---------------------------------------------
     *
     * Existing ExecutionDryRunHarness.
     * Synthetic only.
     */
    const reconciliationSettlement =
      controlledReconciliationSettlementValidationService
        .runSuite();

    const infrastructureRecoveryValidated =
      recoveryStateMachine.passed;

    const infrastructureReconciliationSettlementValidated =
      reconciliationSettlement.passed;

    const infrastructureValidated =
      infrastructureRecoveryValidated &&
      infrastructureReconciliationSettlementValidated;

    const coordinatorDryBridgeValidated =
      coordinatorDryBridge
        ?.status ===
      "VALIDATED";

    if (
      !infrastructureRecoveryValidated
    ) {
      blockers.push(
        "Synthetic recovery state-machine validation failed.",
      );
    }

    if (
      !infrastructureReconciliationSettlementValidated
    ) {
      blockers.push(
        "Synthetic reconciliation/settlement validation failed.",
      );
    }

    if (
      !candidateEvidenceReady
    ) {
      blockers.push(
        ...twoLegPlan
          .blockers
          .map(
            (
              reason,
            ) =>
              `CURRENT_EVIDENCE: ${reason}`,
          ),
      );
    }

    if (
      candidateEvidenceReady &&
      !coordinatorDryBridgeValidated
    ) {
      blockers.push(
        ...(
          coordinatorDryBridge
            ?.blockers ??
          [
            "Coordinator dry bridge did not validate.",
          ]
        )
          .map(
            (
              reason,
            ) =>
              `COORDINATOR_DRY_BRIDGE: ${reason}`,
          ),
      );
    }

    if (
      infrastructureValidated
    ) {
      reasons.push(
        "Recovery state-machine infrastructure passed its synthetic validation suite.",

        "Reconciliation and settlement infrastructure passed balanced and failed-leg synthetic validation.",
      );
    }

    if (
      !candidateEvidenceReady
    ) {
      reasons.push(
        "Current candidate evidence is not ready; the unified pipeline stopped before coordinator mutation.",
      );
    }

    if (
      coordinatorDryBridgeValidated
    ) {
      reasons.push(
        "Current candidate passed the coordinator/lifecycle dry bridge and cleanup completed.",
      );
    }

    reasons.push(
      "No live execution adapter execute() method was invoked by Version 17.2 Build 5.",

      "No exchange order was submitted.",
    );

    /*
     * DRY_VALIDATED requires BOTH:
     *
     * 1. structural infrastructure evidence
     * 2. genuine current candidate evidence
     *
     * We deliberately do not fake candidate
     * readiness just because synthetic tests pass.
     */
    const passed =
      infrastructureValidated &&
      candidateEvidenceReady &&
      coordinatorDryBridgeValidated;

    return {
      generatedAt:
        Date.now(),

      version:
        "17.2",

      build:
        "5",

      mode:
        "CONTROLLED_LIVE",

      status:
        passed
          ? "DRY_VALIDATED"
          : "BLOCKED_CURRENT_EVIDENCE",

      passed,

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      exchangeOrderSubmitted:
        false,

      candidateKey:
        normalizedCandidateKey,

      capital,

      stages: {
        eligibility,

        lastLook,

        orderValidation,

        twoLegPlan,

        coordinatorDryBridge,

        recoveryStateMachine,

        reconciliationSettlement,
      },

      checks: {
        infrastructureRecoveryValidated,

        infrastructureReconciliationSettlementValidated,

        infrastructureValidated,

        candidateEvidenceReady,

        coordinatorDryBridgeValidated,

        noExchangeOrderSubmitted:
          true,
      },

      blockers:
        Array.from(
          new Set(
            blockers,
          ),
        ),

      reasons:
        Array.from(
          new Set(
            reasons,
          ),
        ),
    };
  }
}

export const unifiedControlledExecutionDryRunService =
  new UnifiedControlledExecutionDryRunService();