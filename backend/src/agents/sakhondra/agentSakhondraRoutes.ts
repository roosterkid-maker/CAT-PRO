import {
  Router,
} from "express";

import {
  agentSakhondraService,
} from "./AgentSakhondraService";

const agentSakhondraRoutes = Router();

agentSakhondraRoutes.get(
  "/report",
  (_request, response) => {
    try {
      response.json({
        success: true,
        data: agentSakhondraService.getReport(),
      });
    } catch (error: unknown) {
      response.status(503).json({
        success: false,
        error: error instanceof Error ? error.message : "AGENT SAKHONDRA report unavailable.",
      });
    }
  },
);

export default agentSakhondraRoutes;
