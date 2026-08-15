import {
  Router,
} from "express";

import {
  opportunityCandidateBoardService,
} from "../services/OpportunityCandidateBoardService";

import {
  opportunityCandidateVerificationService,
} from "../services/OpportunityCandidateVerificationService";

import {
  candidateExecutionSimulationService,
} from "../services/CandidateExecutionSimulationService";

import {
  candidateLastLookService,
} from "../services/CandidateLastLookService";

import {
  opportunityAnalyticsService,
} from "../services/OpportunityAnalyticsService";

const router =
  Router();

/*
 * GET /api/debug/candidates
 *
 * Read-only candidate board.
 */
router.get(
  "/",
  (
    request,
    response,
  ) => {
    const rawLimit =
      request.query.limit;

    let limit =
      20;

    if (
      typeof rawLimit ===
        "string" &&
      rawLimit.trim()
    ) {
      const parsed =
        Number(
          rawLimit,
        );

      if (
        !Number.isSafeInteger(
          parsed,
        ) ||
        parsed <= 0
      ) {
        response
          .status(
            400,
          )
          .json({
            success:
              false,

            error:
              "limit must be a positive integer.",
          });

        return;
      }

      limit =
        parsed;
    }

    try {
      const board =
        opportunityCandidateBoardService
          .getBoard(
            limit,
          );

      response.json({
        success:
          true,

        data:
          board,
      });
    } catch (
      error: unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : "Unable to generate opportunity candidate board.",
        });
    }
  },
);

/*
 * GET /api/debug/candidates/analytics
 *
 * Read-only opportunity analytics.
 *
 * Query:
 *
 * rejectionLimit=500
 * closestLimit=10
 */
router.get(
  "/analytics",
  (
    request,
    response,
  ) => {
    try {
      const rawRejectionLimit =
        request.query
          .rejectionLimit;

      const rawClosestLimit =
        request.query
          .closestLimit;

      let rejectionLimit =
        500;

      let closestLimit =
        10;

      if (
        typeof rawRejectionLimit ===
          "string" &&
        rawRejectionLimit.trim()
      ) {
        const parsed =
          Number(
            rawRejectionLimit,
          );

        if (
          !Number.isSafeInteger(
            parsed,
          ) ||
          parsed <= 0
        ) {
          response
            .status(
              400,
            )
            .json({
              success:
                false,

              error:
                "rejectionLimit must be a positive integer.",
            });

          return;
        }

        rejectionLimit =
          parsed;
      }

      if (
        typeof rawClosestLimit ===
          "string" &&
        rawClosestLimit.trim()
      ) {
        const parsed =
          Number(
            rawClosestLimit,
          );

        if (
          !Number.isSafeInteger(
            parsed,
          ) ||
          parsed <= 0
        ) {
          response
            .status(
              400,
            )
            .json({
              success:
                false,

              error:
                "closestLimit must be a positive integer.",
            });

          return;
        }

        closestLimit =
          parsed;
      }

      const report =
        opportunityAnalyticsService
          .getReport(
            rejectionLimit,
            closestLimit,
          );

      response.json({
        success:
          true,

        data:
          report,
      });
    } catch (
      error: unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : "Unable to generate opportunity analytics.",
        });
    }
  },
);

/*
 * GET /api/debug/candidates/:id/verify
 */
router.get(
  "/:id/verify",
  (
    request,
    response,
  ) => {
    try {
      const candidateId =
        request.params.id
          ?.trim();

      if (!candidateId) {
        response
          .status(
            400,
          )
          .json({
            success:
              false,

            error:
              "Candidate id is required.",
          });

        return;
      }

      const candidate =
        opportunityCandidateBoardService
          .getCandidateById(
            candidateId,
          );

      if (!candidate) {
        response
          .status(
            404,
          )
          .json({
            success:
              false,

            error:
              "Candidate was not found in the current candidate board.",
          });

        return;
      }

      const verification =
        opportunityCandidateVerificationService
          .verify(
            candidate,
          );

      response.json({
        success:
          true,

        data: {
          candidate,

          verification,
        },
      });
    } catch (
      error: unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : "Unable to verify candidate.",
        });
    }
  },
);

/*
 * GET /api/debug/candidates/:id/simulate
 */
router.get(
  "/:id/simulate",
  (
    request,
    response,
  ) => {
    try {
      const candidateId =
        request.params.id
          ?.trim();

      if (!candidateId) {
        response
          .status(
            400,
          )
          .json({
            success:
              false,

            error:
              "Candidate id is required.",
          });

        return;
      }

      const result =
        candidateExecutionSimulationService
          .simulate(
            candidateId,
          );

      if (
        result.status ===
        "CANDIDATE_NOT_FOUND"
      ) {
        response
          .status(
            404,
          )
          .json({
            success:
              false,

            data:
              result,
          });

        return;
      }

      response.json({
        success:
          true,

        data:
          result,
      });
    } catch (
      error: unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : "Unable to simulate candidate execution.",
        });
    }
  },
);

/*
 * GET /api/debug/candidates/:id/last-look
 *
 * Final read-only pre-execution safety gate.
 */
router.get(
  "/:id/last-look",
  (
    request,
    response,
  ) => {
    try {
      const candidateId =
        request.params.id
          ?.trim();

      if (!candidateId) {
        response
          .status(
            400,
          )
          .json({
            success:
              false,

            error:
              "Candidate id is required.",
          });

        return;
      }

      const result =
        candidateLastLookService
          .evaluate(
            candidateId,
          );

      if (
        result.status ===
        "CANDIDATE_NOT_FOUND"
      ) {
        response
          .status(
            404,
          )
          .json({
            success:
              false,

            data:
              result,
          });

        return;
      }

      response.json({
        success:
          true,

        data:
          result,
      });
    } catch (
      error: unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : "Unable to perform candidate last-look evaluation.",
        });
    }
  },
);

export default router;