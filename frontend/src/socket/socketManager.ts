import type { MarketTicker } from "@/types/market";

import { connectSocket } from "./socket";
import { useMarketStore } from "@/store/market.store";
import { useSocketStore } from "@/store/socket.store";

let initialized = false;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

export function startSocketManager(): void {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  if (initialized) {
    return;
  }

  initialized = true;

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

    socket.io.removeAllListeners("reconnect_attempt");

    socket.disconnect();

    useSocketStore.getState().setStatus("disconnected");

    initialized = false;
    stopTimer = null;
  }, 250);
}