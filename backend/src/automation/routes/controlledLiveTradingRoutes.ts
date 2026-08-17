import {
  Router,
} from "express";

import {
  controlledCoordinatorDryBridgeService,
} from "../services/ControlledCoordinatorDryBridgeService";

import {
  controlledLiveTradingFrameworkService,
} from "../services/ControlledLiveTradingFrameworkService";

import {
  controlledReconciliationSettlementValidationService,
} from "../services/ControlledReconciliationSettlementValidationService";

import {
  controlledRecoveryStateMachineValidationService,
} from "../services/ControlledRecoveryStateMachineValidationService";

import {
  controlledTwoLegExecutionService,
} from "../services/ControlledTwoLegExecutionService";

import {
  liveCandidateEligibilityService,
} from "../services/LiveCandidateEligibilityService";

import {
  liveFinalLastLookService,
} from "../services/LiveFinalLastLookService";

import {
  liveOrderValidationService,
} from "../services/LiveOrderValidationService";

import {
  unifiedControlledExecutionDryRunService,
} from "../services/UnifiedControlledExecutionDryRunService";

const router =
  Router();

function readCandidateRequest(
  request: {
    query:
      Record<
        string,
        unknown
      >;
  },
): {
  candidateKey: string;

  capital: number;
} {
  const candidateKey =
    typeof request.query.key ===
    "string"
      ? request.query.key
          .trim()
      : "";

  const capitalText =
    typeof request.query.capital ===
    "string"
      ? request.query.capital
          .trim()
      : "100";

  return {
    candidateKey,

    capital:
      Number(
        capitalText,
      ),
  };
}

function validateCandidateRequest(
  response:
    Parameters<
      Parameters<
        typeof router.get
      >[1]
    >[1],

  candidateKey:
    string,

  capital:
    number,
): boolean {
  if (
    !candidateKey
  ) {
    response
      .status(
        400,
      )
      .json({
        success:
          false,

        message:
          "Candidate key is required. Use ?key=MARKET|buyExchange|sellExchange&capital=100",
      });

    return false;
  }

  if (
    !Number.isFinite(
      capital,
    ) ||
    capital <=
      0
  ) {
    response
      .status(
        400,
      )
      .json({
        success:
          false,

        message:
          "Capital must be a positive finite number.",
      });

    return false;
  }

  return true;
}

function errorMessage(
  error:
    unknown,

  fallback:
    string,
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

/*
 * VERSION 17.0
 *
 * Controlled LIVE diagnostics.
 */
router.get(
  "/",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          controlledLiveTradingFrameworkService
            .getDiagnostics(),
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            errorMessage(
              error,

              "Controlled live trading diagnostics failed.",
            ),
        });
    }
  },
);

/*
 * VERSION 17.0 BUILD 2
 *
 * Candidate eligibility.
 */
router.get(
  "/candidate",

  async (
    request,
    response,
  ) => {
    const {
      candidateKey,

      capital,
    } =
      readCandidateRequest(
        request,
      );

    if (
      !validateCandidateRequest(
        response,

        candidateKey,

        capital,
      )
    ) {
      return;
    }

    try {
      const result =
        await liveCandidateEligibilityService
          .evaluate({
            candidateKey,

            capital,
          });

      response.json({
        success:
          true,

        data:
          result,
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            errorMessage(
              error,

              "Live candidate eligibility evaluation failed.",
            ),
        });
    }
  },
);

/*
 * VERSION 17.0 BUILD 3
 *
 * Final last-look.
 */
router.get(
  "/last-look",

  (
    request,
    response,
  ) => {
    const {
      candidateKey,

      capital,
    } =
      readCandidateRequest(
        request,
      );

    if (
      !validateCandidateRequest(
        response,

        candidateKey,

        capital,
      )
    ) {
      return;
    }

    try {
      const result =
        liveFinalLastLookService
          .evaluate({
            candidateKey,

            capital,
          });

      response.json({
        success:
          true,

        data:
          result,
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            errorMessage(
              error,

              "Final live last-look evaluation failed.",
            ),
        });
    }
  },
);

/*
 * VERSION 17.1
 *
 * Exchange order validation.
 */
router.get(
  "/order-validation",

  async (
    request,
    response,
  ) => {
    const {
      candidateKey,

      capital,
    } =
      readCandidateRequest(
        request,
      );

    if (
      !validateCandidateRequest(
        response,

        candidateKey,

        capital,
      )
    ) {
      return;
    }

    try {
      const result =
        await liveOrderValidationService
          .evaluate(
            candidateKey,

            capital,
          );

      response.json({
        success:
          true,

        data:
          result,
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            errorMessage(
              error,

              "Live order validation failed.",
            ),
        });
    }
  },
);

/*
 * VERSION 17.2 BUILD 1
 *
 * Controlled two-leg preparation.
 */
router.get(
  "/two-leg-plan",

  async (
    request,
    response,
  ) => {
    const {
      candidateKey,

      capital,
    } =
      readCandidateRequest(
        request,
      );

    if (
      !validateCandidateRequest(
        response,

        candidateKey,

        capital,
      )
    ) {
      return;
    }

    try {
      const result =
        await controlledTwoLegExecutionService
          .prepare(
            candidateKey,

            capital,
          );

      response.json({
        success:
          true,

        data:
          result,
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            errorMessage(
              error,

              "Controlled two-leg execution preparation failed.",
            ),
        });
    }
  },
);

/*
 * VERSION 17.2 BUILD 2
 *
 * Coordinator + lifecycle dry bridge.
 */
router.get(
  "/coordinator-dry-bridge",

  async (
    request,
    response,
  ) => {
    const {
      candidateKey,

      capital,
    } =
      readCandidateRequest(
        request,
      );

    if (
      !validateCandidateRequest(
        response,

        candidateKey,

        capital,
      )
    ) {
      return;
    }

    try {
      const result =
        await controlledCoordinatorDryBridgeService
          .validate(
            candidateKey,

            capital,
          );

      response.json({
        success:
          true,

        data:
          result,
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            errorMessage(
              error,

              "Controlled coordinator dry bridge failed.",
            ),
        });
    }
  },
);

/*
 * VERSION 17.2 BUILD 3
 *
 * Coordinator + lifecycle + fills + recovery
 * synthetic state-machine validation.
 *
 * No exchange submission.
 */
router.get(
  "/recovery-state-machine",

  (
    _request,
    response,
  ) => {
    try {
      const result =
        controlledRecoveryStateMachineValidationService
          .runSuite();

      response
        .status(
          result.passed
            ? 200
            : 409,
        )
        .json({
          success:
            result.passed,

          data:
            result,
        });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            errorMessage(
              error,

              "Controlled recovery state-machine validation failed.",
            ),
        });
    }
  },
);

/*
 * VERSION 17.2 BUILD 4
 *
 * Authoritative synthetic:
 *
 * coordinator
 * lifecycle
 * fill
 * reconciliation
 * recovery
 * settlement
 * audit
 *
 * validation.
 *
 * Uses the existing ExecutionDryRunHarness.
 *
 * No exchange adapter execute() call.
 * No real exchange order.
 * No account PnL mutation.
 */
router.get(
  "/reconciliation-settlement",

  (
    _request,
    response,
  ) => {
    try {
      const result =
        controlledReconciliationSettlementValidationService
          .runSuite();

      response
        .status(
          result.passed
            ? 200
            : 409,
        )
        .json({
          success:
            result.passed,

          data:
            result,
        });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            errorMessage(
              error,

              "Controlled reconciliation and settlement validation failed.",
            ),
        });
    }
  },
);

/*
 * VERSION 17.2 BUILD 5
 *
 * Unified controlled execution pipeline dry run.
 *
 * Runs current candidate evidence through:
 *
 * - eligibility
 * - final last-look
 * - exchange order validation
 * - two-leg preparation
 * - coordinator/lifecycle dry bridge when evidence is ready
 * - synthetic recovery validation
 * - synthetic reconciliation/settlement validation
 *
 * No live adapter execute() call.
 * No real exchange order.
 */
router.get(
  "/unified-dry-run",

  async (
    request,
    response,
  ) => {
    const {
      candidateKey,

      capital,
    } =
      readCandidateRequest(
        request,
      );

    if (
      !validateCandidateRequest(
        response,

        candidateKey,

        capital,
      )
    ) {
      return;
    }

    try {
      const result =
        await unifiedControlledExecutionDryRunService
          .run(
            candidateKey,

            capital,
          );

      response
        .status(
          result.passed
            ? 200
            : 409,
        )
        .json({
          success:
            result.passed,

          data:
            result,
        });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            errorMessage(
              error,

              "Unified controlled execution dry run failed.",
            ),
        });
    }
  },
);

export default router;