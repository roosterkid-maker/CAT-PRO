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

router.get("/funding-settlements", (_request, response) => {
  response.json({success: true, data: derivativeFundingSettlementEvidenceService.getSnapshot()});
});

export default router;
