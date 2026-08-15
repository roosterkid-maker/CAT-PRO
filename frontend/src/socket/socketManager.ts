import type { MarketTicker } from "@/types/market";

import {
  getMarkets,
} from "@/api/market.api";

import { connectSocket } from "./socket";
import { useMarketStore } from "@/store/market.store";
import { useSocketStore } from "@/store/socket.store";

let initialized = false;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotRequest:
  | Promise<void>
  | null = null;
let lifecycleId = 0;

export function startSocketManager(): void {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  if (initialized) {
    return;
  }

  initialized = true;
  lifecycleId += 1;

  const socket = connectSocket();

  if (!socket.connected) {
    socket.connect();
  }

  useSocketStore.getState().setStatus(
    socket.connected ? "connected" : "connecting",
  );

  socket.on("connect", () => {
    useSocketStore.getState().setStatus("connected");
    console.log("[Socket] Connected:", socket.id);

    void refreshMarketSnapshot();
  });

  socket.on("disconnect", () => {
    useSocketStore.getState().setStatus("disconnected");
    console.log("[Socket] Disconnected");
  });

  socket.on("connect_error", (error: Error) => {
    useSocketStore.getState().setStatus("disconnected");
    console.error("[Socket] Connection error:", error.message);
  });

  socket.io.on("reconnect_attempt", () => {
    useSocketStore.getState().setStatus("connecting");
  });

  socket.on("ticker", (ticker: MarketTicker) => {
    useMarketStore.getState().updateTicker(ticker);
  });

  socket.on("tickers", (tickers: MarketTicker[]) => {
    if (
      !Array.isArray(
        tickers,
      )
    ) {
      return;
    }

    useMarketStore
      .getState()
      .updateTickers(
        tickers,
      );
  });

  void refreshMarketSnapshot();
}

export function refreshMarketSnapshot(): Promise<void> {
  if (
    snapshotRequest
  ) {
    return snapshotRequest;
  }

  const requestLifecycle =
    lifecycleId;

  useMarketStore
    .getState()
    .setSnapshotLoading();

  const request =
    getMarkets()
      .then(
        (
          response,
        ) => {
          if (
            requestLifecycle !==
            lifecycleId
          ) {
            return;
          }

          if (
            !response.success ||
            !Array.isArray(
              response.data,
            )
          ) {
            throw new Error(
              "Invalid live-market snapshot response.",
            );
          }

          useMarketStore
            .getState()
            .hydrateSnapshot(
              response.data,
            );
        },
      )
      .catch(
        (
          error:
            unknown,
        ) => {
          if (
            requestLifecycle !==
            lifecycleId
          ) {
            return;
          }

          useMarketStore
            .getState()
            .setSnapshotError();

          console.error(
            "[Market Snapshot] Hydration failed:",
            error instanceof Error
              ? error.message
              : "Unknown error",
          );
        },
      )
      .finally(
        () => {
          if (
            snapshotRequest ===
            request
          ) {
            snapshotRequest =
              null;
          }
        },
      );

  snapshotRequest =
    request;

  return request;
}

export function stopSocketManager(): void {
  if (stopTimer) {
    clearTimeout(stopTimer);
  }

  /*
   * React StrictMode development me effect ko mount → cleanup → remount
   * karta hai. Chhota delay temporary cleanup ko ignore karne deta hai.
   */
  stopTimer = setTimeout(() => {
    const socket = connectSocket();

    socket.removeAllListeners("connect");
    socket.removeAllListeners("disconnect");
    socket.removeAllListeners("connect_error");
    socket.removeAllListeners("ticker");
    socket.removeAllListeners("tickers");

    socket.io.removeAllListeners("reconnect_attempt");

    socket.disconnect();

    useSocketStore.getState().setStatus("disconnected");

    lifecycleId += 1;
    snapshotRequest = null;

    initialized = false;
    stopTimer = null;
  }, 250);
}
