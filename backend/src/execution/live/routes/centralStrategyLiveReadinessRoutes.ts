import {Router} from "express";
import {centralStrategyLiveReadinessService} from "../readiness/CentralStrategyLiveReadinessService";

const router = Router();

router.get("/", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({success: true, data: centralStrategyLiveReadinessService.getReport()});
});

export default router;
