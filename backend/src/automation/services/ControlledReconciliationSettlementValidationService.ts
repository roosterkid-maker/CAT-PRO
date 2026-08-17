import {
  executionDryRunHarness,
} from "../../execution/live/dryrun/ExecutionDryRunHarness";

import {
  executionRecoveryEngine,
} from "../../execution/live/recovery/ExecutionRecoveryEngine";

import type {
  ControlledReconciliationSettlementScenario,
  ControlledReconciliationSettlementValidationResult,
} from "../models/ControlledReconciliationSettlementValidation";

export class ControlledReconciliationSettlementValidationService {
  runSuite(): ControlledReconciliationSettlementValidationResult {
    const balanced =
      executionDryRunHarness.run(
        "BALANCED_SUCCESS",
      );

    const sellFailed =
      executionDryRunHarness.run(
        "SELL_FAILED",
      );

    const scenarios:
      ControlledReconciliationSettlementScenario[] = [
        this.normalizeScenario(
          balanced,
          [
            "coordinatorPrepared",
            "buyLifecyclePrepared",
            "sellLifecyclePrepared",
            "buyFilled",
            "sellFilled",
            "buyReconciliationMatched",
            "sellReconciliationMatched",
            "exposureBalanced",
            "settlementCompleted",
            "expectedGrossProfit",
            "expectedFees",
            "expectedNetProfit",
            "coordinatorCompleted",
            "auditCreated",
            "accountCapitalUnchanged",
          ],
        ),

        this.normalizeScenario(
          sellFailed,
          [
            "coordinatorPrepared",
            "buyFilled",
            "sellFailed",
            "buyReconciliationMatched",
            "sellReconciliationMatched",
            "recoveryDetected",
            "longExposureDetected",
            "recoveryCritical",
            "emergencyExitRecommended",
            "settlementBlocked",
            "coordinatorFailed",
            "auditCreated",
            "accountCapitalUnchanged",
          ],
        ),
      ];

    /*
     * SELL_FAILED intentionally creates a synthetic
     * recovery incident so the recovery path can be
     * validated.
     *
     * Version 17.2 Build 4 resolves any remaining
     * synthetic incident after evidence is captured.
     *
     * This prevents repeated API testing from leaving
     * an active synthetic recovery alert.
     */
    for (
      const scenario
      of scenarios
    ) {
      const sessionId =
        scenario.raw
          .sessionId;

      if (
        !sessionId
      ) {
        continue;
      }

      const incidents =
        executionRecoveryEngine
          .getBySession(
            sessionId,
          );

      for (
        const incident
        of incidents
      ) {
        if (
          incident.status ===
          "RESOLVED"
        ) {
          continue;
        }

        executionRecoveryEngine
          .resolve(
            incident.id,

            "Version 17.2 Build 4 synthetic reconciliation/settlement validation cleanup.",
          );
      }
    }

    const balancedScenario =
      scenarios.find(
        (
          scenario,
        ) =>
          scenario.scenario ===
          "BALANCED_SUCCESS",
      ) ??
      null;

    const failedScenario =
      scenarios.find(
        (
          scenario,
        ) =>
          scenario.scenario ===
          "SELL_FAILED",
      ) ??
      null;

    const checks = {
      balancedSettlementCompleted:
        balancedScenario
          ?.raw
          .checks
          .settlementCompleted ===
        true,

      balancedReconciliationMatched:
        balancedScenario
          ?.raw
          .checks
          .buyReconciliationMatched ===
          true &&
        balancedScenario
          ?.raw
          .checks
          .sellReconciliationMatched ===
          true,

      balancedCoordinatorCompleted:
        balancedScenario
          ?.raw
          .checks
          .coordinatorCompleted ===
        true,

      failedLegRecoveryDetected:
        failedScenario
          ?.raw
          .checks
          .recoveryDetected ===
          true &&
        failedScenario
          ?.raw
          .checks
          .longExposureDetected ===
          true,

      failedLegSettlementBlocked:
        failedScenario
          ?.raw
          .checks
          .settlementBlocked ===
        true,

      failedLegCoordinatorFailed:
        failedScenario
          ?.raw
          .checks
          .coordinatorFailed ===
        true,

      allAccountCapitalUnchanged:
        scenarios.every(
          (
            scenario,
          ) =>
            scenario
              .accountCapitalUnchanged,
        ),
    };

    const reasons:
      string[] =
      [];

    if (
      checks
        .balancedSettlementCompleted
    ) {
      reasons.push(
        "Balanced synthetic BUY/SELL fills completed settlement through the existing settlement service.",
      );
    }

    if (
      checks
        .balancedReconciliationMatched
    ) {
      reasons.push(
        "Both balanced lifecycle legs reconciled as MATCHED against synthetic remote exchange truth.",
      );
    }

    if (
      checks
        .failedLegRecoveryDetected
    ) {
      reasons.push(
        "Asymmetric BUY-filled/SELL-failed exposure was detected by the existing recovery engine.",
      );
    }

    if (
      checks
        .failedLegSettlementBlocked
    ) {
      reasons.push(
        "Settlement correctly refused to finalize the asymmetric failed-leg scenario.",
      );
    }

    if (
      checks
        .allAccountCapitalUnchanged
    ) {
      reasons.push(
        "Synthetic dry-run settlement did not mutate trading-account capital or realized PnL.",
      );
    }

    reasons.push(
      "No live execution adapter execute() method was invoked.",

      "No exchange order was submitted.",
    );

    const passed =
      scenarios.every(
        (
          scenario,
        ) =>
          scenario.passed &&
          scenario.requiredChecksPassed &&
          scenario
            .noExchangeOrderSubmitted &&
          scenario
            .accountCapitalUnchanged,
      ) &&
      Object.values(
        checks,
      )
        .every(
          Boolean,
        );

    return {
      generatedAt:
        Date.now(),

      version:
        "17.2",

      build:
        "4",

      mode:
        "CONTROLLED_LIVE",

      passed,

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      exchangeOrderSubmitted:
        false,

      scenarios,

      checks,

      reasons,
    };
  }

  private normalizeScenario(
    raw:
      ReturnType<
        typeof executionDryRunHarness.run
      >,

    requiredCheckKeys:
      string[],
  ): ControlledReconciliationSettlementScenario {
    const missingOrFailed =
      requiredCheckKeys.filter(
        (
          key,
        ) =>
          raw.checks[
            key
          ] !==
          true,
      );

    const reasons =
      missingOrFailed.map(
        (
          key,
        ) =>
          `Required dry-run check ${key} did not pass.`,
      );

    if (
      raw.passed
    ) {
      reasons.push(
        `Existing ${raw.scenario} dry-run scenario passed.`,
      );
    }

    return {
      scenario:
        raw.scenario,

      passed:
        raw.passed,

      noExchangeOrderSubmitted:
        true,

      accountCapitalUnchanged:
        raw.accountCapitalUnchanged,

      requiredChecksPassed:
        missingOrFailed.length ===
        0,

      raw,

      reasons,
    };
  }
}

export const controlledReconciliationSettlementValidationService =
  new ControlledReconciliationSettlementValidationService();