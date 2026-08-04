import http from "node:http";

import cors from "cors";
import express from "express";
import analyticsRoutes from "./analytics/routes/analyticsRoutes";

import executionRoutes from "./execution/routes/executionRoutes";
import optimizerRoutes from "./optimizer/routes/optimizerRoutes";
import portfolioRoutes from "./portfolio/routes/portfolioRoutes";
import rankingRoutes from "./ranking/routes/rankingRoutes";
import riskRoutes from "./risk/routes/riskRoutes";

import comparisonRoutes from "./routes/comparison";
import liveRoutes from "./routes/live";
import opportunityRoutes from "./routes/opportunities";
import paperTradingRouter from "./routes/paperTrading";
import paperTradeRoutes from "./routes/paperTrades";
import spreadRoutes from "./routes/spreads";
import systemHealthRoutes from "./routes/systemHealth";

import { initializeSocket } from "./socket/server";

import automatedPaperTradingRoutes from "./trading/routes/automatedPaperTradingRoutes";
import { tradeMonitorRunner } from "./trading/services/TradeMonitorRunner";

import { websocketManager } from "./websocket/manager";

const app = express();

const PORT =
  Number(process.env.PORT) ||
  5000;

app.use(cors());

app.use(express.json());

/*
 * Temporary request diagnostics.
 *
 * Remove this middleware after the
 * ranking API issue is confirmed.
 */
app.use(
  (
    request,
    _response,
    next,
  ) => {
    console.log(
      `[HTTP] ${request.method} ${request.originalUrl}`,
    );

    next();
  },
);

app.get(
  "/",
  (_request, response) => {
    response.send(
      "Crypto Arbitrage Server Running",
    );
  },
);

app.use(
  "/api/live",
  liveRoutes,
);

app.use(
  "/api/analytics",
  analyticsRoutes,
);

app.use(
  "/api/comparison",
  comparisonRoutes,
);

app.use(
  "/api/spreads",
  spreadRoutes,
);

app.use(
  "/api/opportunities",
  opportunityRoutes,
);

app.use(
  "/api/execution",
  executionRoutes,
);

app.use(
  "/api/optimizer",
  optimizerRoutes,
);

app.use(
  "/api/ranking",
  rankingRoutes,
);

app.use(
  "/api/risk",
  riskRoutes,
);

app.use(
  "/api/portfolio",
  portfolioRoutes,
);

app.use(
  "/api/paper",
  paperTradingRouter,
);

app.use(
  "/api/paper/automated",
  automatedPaperTradingRoutes,
);

app.use(
  "/api/paper-trades",
  paperTradeRoutes,
);

app.use(
  "/api/system-health",
  systemHealthRoutes,
);

const server =
  http.createServer(app);

initializeSocket(server);

server.listen(
  PORT,
  () => {
    console.log(
      `Server running on port ${PORT}`,
    );

    void websocketManager
      .start()
      .catch(
        (
          error: unknown,
        ) => {
          console.error(
            "[Server] Failed to start exchange services:",
            error,
          );
        },
      );

    tradeMonitorRunner.start();
  },
);

async function shutdown(
  signal: string,
): Promise<void> {
  console.log(
    `[Server] ${signal} received. Shutting down...`,
  );

  tradeMonitorRunner.stop();

  try {
    await websocketManager.stop();
  } catch (error) {
    console.error(
      "[Server] Exchange shutdown error:",
      error,
    );
  }

  server.close(
    (error) => {
      if (error) {
        console.error(
          "[Server] HTTP shutdown error:",
          error,
        );

        process.exit(1);
      }

      console.log(
        "[Server] Shutdown complete",
      );

      process.exit(0);
    },
  );
}

process.on(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT",
    );
  },
);

process.on(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM",
    );
  },
);