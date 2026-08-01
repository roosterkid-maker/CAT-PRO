import http from "node:http";

import cors from "cors";
import express from "express";

import comparisonRoutes from "./routes/comparison";
import liveRoutes from "./routes/live";
import opportunityRoutes from "./routes/opportunities";
import paperTradeRoutes from "./routes/paperTrades";
import spreadRoutes from "./routes/spreads";
import systemHealthRoutes from "./routes/systemHealth";
import { initializeSocket } from "./socket/server";
import { tradeMonitorRunner } from "./trading/services/TradeMonitorRunner";
import { websocketManager } from "./websocket/manager";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (_request, response) => {
  response.send("Crypto Arbitrage Server Running");
});

app.use("/api/live", liveRoutes);
app.use("/api/comparison", comparisonRoutes);
app.use("/api/spreads", spreadRoutes);
app.use("/api/opportunities", opportunityRoutes);
app.use("/api/system-health", systemHealthRoutes);
app.use("/api/paper-trades", paperTradeRoutes);

const server = http.createServer(app);

initializeSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  void websocketManager.start().catch((error: unknown) => {
    console.error(
      "[Server] Failed to start exchange services:",
      error,
    );
  });

  tradeMonitorRunner.start();
});

async function shutdown(signal: string): Promise<void> {
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

  server.close((error) => {
    if (error) {
      console.error(
        "[Server] HTTP shutdown error:",
        error,
      );

      process.exit(1);
    }

    console.log("[Server] Shutdown complete");
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});