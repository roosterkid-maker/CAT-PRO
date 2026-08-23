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
let marketUiConsumerCount = 0;

const MARKET_UI_FLUSH_INTERVAL_MS =
  100;

const pendingTickerUpdates =
  new Map<
    string,
    MarketTicker
  >();

let marketUiFlushTimer:
  | ReturnType<typeof setTimeout>
  | null = null;

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

    if (
      marketUiConsumerCount >
      0
    ) {
      void refreshMarketSnapshot();
    }
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
    queueTickerForUi(
      ticker,
    );
  });

  socket.on("tickers", (tickers: MarketTicker[]) => {
    if (
      !Array.isArray(
        tickers,
      )
    ) {
      return;
    }

    for (
      const ticker
      of tickers
    ) {
      queueTickerForUi(
        ticker,
      );
    }
  });

}

/**
 * Live market rows are the only frontend consumer of the high-volume ticker
 * store. Keep the socket connected globally for status and reconnect state,
 * but hydrate and mutate the 600+ row UI store only while the Markets page is
 * mounted. This removes ten large object copies per second from every other
 * dashboard without changing backend ingestion or trading behavior.
 */
export function acquireMarketUiStream(): () => void {
  marketUiConsumerCount +=
    1;

  if (
    marketUiConsumerCount ===
    1
  ) {
    void refreshMarketSnapshot();
  }

  let released =
    false;

  return () => {
    if (released) {
      return;
    }

    released =
      true;

    marketUiConsumerCount =
      Math.max(
        0,
        marketUiConsumerCount -
          1,
      );

    if (
      marketUiConsumerCount ===
      0
    ) {
      clearMarketUiQueue();

      useMarketStore
        .getState()
        .clear();
    }
  };
}

export function refreshMarketSnapshot(): Promise<void> {
  if (
    marketUiConsumerCount ===
    0
  ) {
    return Promise.resolve();
  }

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
              lifecycleId ||
            marketUiConsumerCount ===
              0
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

    clearMarketUiQueue();

    initialized = false;
    stopTimer = null;
  }, 250);
}

function queueTickerForUi(
  ticker: MarketTicker,
): void {
  if (
    marketUiConsumerCount ===
    0
  ) {
    return;
  }

  const exchange =
    typeof ticker.exchange ===
    "string"
      ? ticker.exchange
          .trim()
          .toLowerCase()
      : "";

  const market =
    typeof ticker.market ===
    "string"
      ? ticker.market
          .trim()
          .toUpperCase()
      : "";

  if (
    !exchange ||
    !market
  ) {
    return;
  }

  const key =
    `${exchange}:${market}`;

  const pending =
    pendingTickerUpdates.get(
      key,
    );

  if (
    pending &&
    pending.timestamp >
      ticker.timestamp
  ) {
    return;
  }

  pendingTickerUpdates.set(
    key,
    ticker,
  );

  if (
    marketUiFlushTimer
  ) {
    return;
  }

  marketUiFlushTimer =
    setTimeout(
      flushMarketUiQueue,
      MARKET_UI_FLUSH_INTERVAL_MS,
    );
}

function flushMarketUiQueue(): void {
  marketUiFlushTimer =
    null;

  if (
    pendingTickerUpdates.size ===
    0
  ) {
    return;
  }

  const tickers =
    Array.from(
      pendingTickerUpdates.values(),
    );

  pendingTickerUpdates.clear();

  useMarketStore
    .getState()
    .updateTickers(
      tickers,
    );
}

function clearMarketUiQueue(): void {
  if (
    marketUiFlushTimer
  ) {
    clearTimeout(
      marketUiFlushTimer,
    );

    marketUiFlushTimer =
      null;
  }

  pendingTickerUpdates.clear();
}
