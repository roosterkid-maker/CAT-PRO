import {
  Router,
} from "express";

import {
  executionHistoryService,
} from "../history/ExecutionHistoryService";

import {
  getInrRouteLiveRunner,
} from "../inr-routes/InrRouteLiveRunner";

import {
  inrSessionOrderIdentities,
} from "../inr-routes/InrRouteSessionExecutor";

export const executionHistoryRoutes =
  Router();

executionHistoryRoutes.get(
  "/recent",
  async (
    request,
    response,
  ) => {
    try {
      const requestedLimit =
        Number(
          request.query.limit ??
          20,
        );

      const report =
        await executionHistoryService
          .getRecent(
            requestedLimit,
          );

      // Attribute INR route executor orders (USDT<->INR, INR<->INR) so the
      // order feed labels them as arbitrage legs like Strategy #1's arb-*.
      let identities = new Set<string>();
      try {
        identities = inrSessionOrderIdentities(getInrRouteLiveRunner().listSessions());
      } catch {
        identities = new Set<string>();
      }
      const executions = report.executions.map((execution) => {
        const venue = execution.exchange.trim().toLowerCase();
        const inr =
          (execution.orderId !== null && identities.has(`${venue}|order|${execution.orderId}`)) ||
          (execution.clientOrderId !== null && identities.has(`${venue}|client|${execution.clientOrderId}`));
        return inr ? {...execution, strategy: "INR_ROUTE" as const} : execution;
      });

      response.status(
        200,
      ).json({
        ...report,
        executions,
      });
    } catch (
      error: unknown
    ) {
      response.status(
        500,
      ).json({
        message:
          error instanceof Error
            ? error.message
            : "Unable to load execution history.",
      });
    }
  },
);