import {
  Router,
} from "express";

import {
  productionSafetyControllerService,
} from "../services/ProductionSafetyControllerService";

const router =
  Router();

router.get(
  "/",

  (
    _request,
    response,
  ) => {
    try {
      const diagnostics =
        productionSafetyControllerService
          .getDiagnostics();

      const passGuards =
        diagnostics.gates.filter(
          (
            gate,
          ) =>
            gate.state ===
            "PASS",
        );

      const blockedGuards =
        diagnostics.gates.filter(
          (
            gate,
          ) =>
            gate.state ===
            "BLOCKED",
        );

      const emergencyStopGuards =
        diagnostics.gates.filter(
          (
            gate,
          ) =>
            gate.state ===
            "EMERGENCY_STOP",
        );

      const requiredGuards =
        diagnostics.gates.filter(
          (
            gate,
          ) =>
            gate.required,
        );

      const requiredGuardsPassing =
        requiredGuards.filter(
          (
            gate,
          ) =>
            gate.state ===
            "PASS",
        );

      const requiredGuardsBlocked =
        requiredGuards.filter(
          (
            gate,
          ) =>
            gate.state ===
            "BLOCKED",
        );

      const requiredEmergencyStopGuards =
        requiredGuards.filter(
          (
            gate,
          ) =>
            gate.state ===
            "EMERGENCY_STOP",
        );

      const allRequiredGuardsPassing =
        requiredGuards.length >
          0 &&
        requiredGuardsPassing.length ===
          requiredGuards.length;

      /*
       * VERSION 17.5 BUILD 6
       *
       * LIVE submission is intentionally unavailable
       * throughout Version 17.5.
       *
       * ProductionSafetyDiagnostics also models
       * liveSubmissionAllowed as literal false.
       *
       * Therefore readiness for future LIVE submission
       * must remain false in this diagnostic endpoint.
       *
       * A later explicit LIVE-enablement version may
       * introduce a separate promotion/arming contract.
       */
      const readyForFutureLiveSubmission =
        false;

      response.json({
        success:
          true,

        data: {
          generatedAt:
            diagnostics.generatedAt,

          version:
            diagnostics.version,

          status:
            diagnostics.status,

          failClosed:
            diagnostics.failClosed,

          liveSubmissionAllowed:
            diagnostics.liveSubmissionAllowed,

          readyForFutureLiveSubmission,

          summary: {
            totalGuards:
              diagnostics
                .gates
                .length,

            pass:
              passGuards.length,

            blocked:
              blockedGuards.length,

            emergencyStop:
              emergencyStopGuards.length,

            requiredGuards:
              requiredGuards.length,

            requiredPassing:
              requiredGuardsPassing.length,

            requiredBlocked:
              requiredGuardsBlocked.length,

            requiredEmergencyStop:
              requiredEmergencyStopGuards.length,

            allRequiredGuardsPassing,
          },

          decision: {
            allowLiveSubmission:
              false,

            productionSafetyStatus:
              diagnostics.status,

            emergencyStopRequired:
              emergencyStopGuards.length >
              0,

            blocked:
              diagnostics.status !==
              "SAFE",

            reason:
              diagnostics.status ===
                "EMERGENCY_STOP"
                ? "Production safety detected one or more emergency-stop conditions."
                : diagnostics.status ===
                    "BLOCKED"
                  ? "Production safety has one or more blocking guards."
                  : "Production safety guards currently pass, but LIVE submission remains disabled by design.",
          },

          emergencyReasons:
            diagnostics
              .emergencyReasons,

          blockers:
            diagnostics
              .blockers,

          guardGroups: {
            passing:
              passGuards,

            blocked:
              blockedGuards,

            emergencyStop:
              emergencyStopGuards,
          },

          state:
            diagnostics.state,

          guards:
            diagnostics.gates,
        },
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

          data: {
            generatedAt:
              Date.now(),

            version:
              "17.5",

            status:
              "BLOCKED",

            failClosed:
              true,

            liveSubmissionAllowed:
              false,

            readyForFutureLiveSubmission:
              false,

            summary: {
              totalGuards:
                0,

              pass:
                0,

              blocked:
                1,

              emergencyStop:
                0,

              requiredGuards:
                1,

              requiredPassing:
                0,

              requiredBlocked:
                1,

              requiredEmergencyStop:
                0,

              allRequiredGuardsPassing:
                false,
            },

            decision: {
              allowLiveSubmission:
                false,

              productionSafetyStatus:
                "BLOCKED",

              emergencyStopRequired:
                false,

              blocked:
                true,

              reason:
                "Production safety diagnostics could not be generated; system failed closed.",
            },

            emergencyReasons:
              [],

            blockers: [
              error instanceof Error
                ? error.message
                : "Unknown production safety diagnostics error.",
            ],

            guardGroups: {
              passing:
                [],

              blocked:
                [],

              emergencyStop:
                [],
            },

            state:
              null,

            guards:
              [],
          },
        });
    }
  },
);

export default router;