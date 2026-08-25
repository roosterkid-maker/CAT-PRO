import {Router} from "express";

import {
  derivativeDepthService,
} from "../services/DerivativeDepthService";

import {
  derivativeFeeEvidenceService,
} from "../services/DerivativeFeeEvidenceService";

import {
  derivativeAccountEvidenceService,
} from "../services/DerivativeAccountEvidenceService";

import {
  derivativeFundingSettlementEvidenceService,
} from "../services/DerivativeFundingSettlementEvidenceService";

const router = Router();

router.get("/depth", (_request, response) => {
  response.json({success: true, data: derivativeDepthService.getSnapshot()});
});

router.get("/fees", (_request, response) => {
  response.json({success: true, data: derivativeFeeEvidenceService.getSnapshot()});
});

router.get("/account-evidence", (_request, response) => {
  response.json({success: true, data: derivativeAccountEvidenceService.getSnapshot()});
});

/**
 * Re-verifies the Binance USD-M account boundary without creating execution
 * authority. The underlying provider is structurally limited to signed GET
 * balance and position calls, and the returned report is bound to this exact
 * attempt rather than any retained prior success.
 */
router.post("/account-evidence/binance-usdm/verify", async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  try {
    const report = await derivativeAccountEvidenceService.verifyBinanceUsdM();
    return response.json({success: true, data: report});
  } catch (_error: unknown) {
    return response.status(503).json({
      success: false,
      message: "Binance USD-M read-only verification could not be started.",
    });
  }
});

router.get("/funding-settlements", (_request, response) => {
  response.json({success: true, data: derivativeFundingSettlementEvidenceService.getSnapshot()});
});

export default router;
