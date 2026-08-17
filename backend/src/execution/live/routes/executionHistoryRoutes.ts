import {
  Router,
} from "express";

import {
  executionHistoryService,
} from "../history/ExecutionHistoryService";

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

      response.status(
        200,
      ).json(
        report,
      );
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