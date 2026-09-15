import {
  Router,
} from "express";

import {
  centralLiveTriangularBridgeService,
} from "../central/CentralLiveTriangularBridgeService";

import {
  centralLiveOperatorConfirmationService,
} from "../central/CentralLiveOperatorConfirmationService";

import {
  readConfirmationPhrase,
} from "./executionSafetyMetadata";

const STRATEGY_ID = "triangular-arbitrage";

const router = Router();

/*
 * Read-only status: is the bridge subscribed to real signals, what is the
 * latest candidate opportunity (if any) and whether it's currently ready,
 * any recent intake outcomes, and the full Central LIVE dispatcher/queue/
 * admission-journal diagnostics. Never mutates anything.
 */
router.get(
  "/",
  (
    _request,
    response,
  ) => {
    response.json({
      success: true,
      data: {
        bridge: centralLiveTriangularBridgeService.getDiagnostics(),
        arm: centralLiveOperatorConfirmationService.getStatus(STRATEGY_ID),
      },
    });
  },
);

/*
 * The ONLY endpoint in this whole pipeline that can ever authorize a real
 * order. Requires the exact CONFIRM_CENTRAL_STRATEGY_LIVE_ACTION phrase.
 * Arms a single-use, ~30s-bounded authorization: the bridge service claims
 * it for whichever specific triangular plan is the first to pass every
 * real evidence check inside that window and dispatches it for real -
 * or, if nothing qualifies before the window closes, the arm simply
 * expires unused. This endpoint itself performs no exchange I/O and places
 * no order directly.
 */
router.post(
  "/arm",
  (
    request,
    response,
  ) => {
    try {
      const confirmation = readConfirmationPhrase(request.body);
      const arm = centralLiveOperatorConfirmationService.arm(STRATEGY_ID, confirmation);

      response.json({
        success: true,
        data: {
          arm,
          status: centralLiveOperatorConfirmationService.getStatus(STRATEGY_ID),
        },
      });
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Central LIVE triangular arm request failed.",
      });
    }
  },
);

router.post(
  "/dispatch-once",
  async (
    _request,
    response,
  ) => {
    try {
      const outcome = await centralLiveTriangularBridgeService.runDispatchOnce();

      response.json({
        success: true,
        data: outcome,
      });
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Central LIVE triangular dispatch tick failed.",
      });
    }
  },
);

export default router;
