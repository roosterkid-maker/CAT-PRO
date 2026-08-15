import {
  binanceHttpClient,
} from "../../../exchanges/binance/api/BinanceHttpClient";

import {
  bybitPrivateHttpClient,
} from "../../../exchanges/bybit/api/BybitPrivateHttpClient";

import {
  coinSwitchReadOnlyHttpClient,
} from "../../../exchanges/coinswitch/api/CoinSwitchReadOnlyHttpClient";

import type {
  ExchangeClockSafetyReport,
  ExchangeClockState,
} from "./ExchangeClockSafety";

const MAXIMUM_CLOCK_SYNC_AGE_MS =
  60_000;

const MAXIMUM_CLOCK_OFFSET_MS =
  2_000;

const MINIMUM_LOCAL_CLOCK_WITNESSES =
  2;

export class ExchangeClockSafetyService {
  getBinanceState():
    ExchangeClockState {
    const diagnostics =
      binanceHttpClient
        .getClockDiagnostics();

    const ageMs =
      diagnostics.lastSynchronizedAt ===
      null
        ? null
        : Math.max(
            0,

            Date.now() -
              diagnostics.lastSynchronizedAt,
          );

    const absoluteOffsetMs =
      Math.abs(
        diagnostics.serverTimeOffsetMs,
      );

    const reasons:
      string[] = [];

    let health:
      ExchangeClockState["health"] =
      "HEALTHY";

    if (
      diagnostics.lastSynchronizationError
    ) {
      health =
        "FAILED";

      reasons.push(
        diagnostics.lastSynchronizationError,
      );
    } else if (
      !diagnostics.synchronized
    ) {
      health =
        "UNSYNCHRONIZED";

      reasons.push(
        "Binance server time has not been synchronized yet.",
      );
    } else if (
      ageMs ===
        null ||
      ageMs >
        MAXIMUM_CLOCK_SYNC_AGE_MS
    ) {
      health =
        "STALE";

      reasons.push(
        `Binance clock synchronization is stale (${ageMs ?? "unknown"} ms old).`,
      );
    }

    if (
      absoluteOffsetMs >
      MAXIMUM_CLOCK_OFFSET_MS
    ) {
      health =
        "FAILED";

      reasons.push(
        `Binance clock offset ${absoluteOffsetMs} ms exceeds the allowed ${MAXIMUM_CLOCK_OFFSET_MS} ms.`,
      );
    }

    return {
      exchange:
        "binance",

      mode:
        "SERVER_SYNCHRONIZED",

      health,

      synchronized:
        diagnostics.synchronized,

      offsetMs:
        diagnostics.serverTimeOffsetMs,

      absoluteOffsetMs,

      lastSynchronizedAt:
        diagnostics.lastSynchronizedAt,

      ageMs,

      maximumAllowedAgeMs:
        MAXIMUM_CLOCK_SYNC_AGE_MS,

      maximumAllowedOffsetMs:
        MAXIMUM_CLOCK_OFFSET_MS,

      signedRequestAllowed:
        health ===
        "HEALTHY",

      reasons,
    };
  }

  getCoinDCXState():
    ExchangeClockState {
    const clockWitnesses = [
      this.getBinanceState(),
      this.getBybitState(),
      this.getCoinSwitchState(),
    ].filter((state) =>
      state.mode === "SERVER_SYNCHRONIZED" &&
      state.health === "HEALTHY" &&
      state.signedRequestAllowed);

    const maximumWitnessOffsetMs = clockWitnesses.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.max(...clockWitnesses.map((state) => state.absoluteOffsetMs));
    const signedRequestAllowed =
      clockWitnesses.length >= MINIMUM_LOCAL_CLOCK_WITNESSES &&
      maximumWitnessOffsetMs <= MAXIMUM_CLOCK_OFFSET_MS;
    const sortedOffsets = clockWitnesses
      .map((state) => state.offsetMs)
      .sort((first, second) => first - second);
    const representativeOffsetMs = sortedOffsets.length === 0
      ? 0
      : sortedOffsets[Math.floor(sortedOffsets.length / 2)]!;
    const witnessNames = clockWitnesses
      .map((state) => state.exchange)
      .join(", ");

    return {
      exchange:
        "coindcx",

      /*
       * CoinDCX does not document an authoritative server-time endpoint.
       * Keep the mode explicitly local-only: independent venue clocks can
       * corroborate the host clock but never become CoinDCX synchronization.
       */
      mode:
        "LOCAL_CLOCK_ONLY",

      health:
        signedRequestAllowed
          ? "LOCAL_ONLY"
          : "FAILED",

      synchronized:
        false,

      offsetMs:
        representativeOffsetMs,

      absoluteOffsetMs:
        Number.isFinite(maximumWitnessOffsetMs)
          ? maximumWitnessOffsetMs
          : 0,

      lastSynchronizedAt:
        null,

      ageMs:
        null,

      maximumAllowedAgeMs:
        MAXIMUM_CLOCK_SYNC_AGE_MS,

      maximumAllowedOffsetMs:
        MAXIMUM_CLOCK_OFFSET_MS,

      /* CoinDCX signs Date.now(); fail closed unless host time is corroborated. */
      signedRequestAllowed:
        signedRequestAllowed,

      reasons: signedRequestAllowed
        ? [
            `CoinDCX local system time is corroborated by ${clockWitnesses.length} fresh independent server clocks (${witnessNames}); maximum observed offset is ${maximumWitnessOffsetMs} ms.`,
            "CoinDCX signed requests use this corroborated local system time because CoinDCX does not document an authoritative server-time endpoint.",
          ]
        : [
            `CoinDCX local clock requires at least ${MINIMUM_LOCAL_CLOCK_WITNESSES} fresh independent server-clock witnesses; ${clockWitnesses.length} are currently safe.`,
            "CoinDCX signed requests are blocked by clock safety until the local clock is corroborated.",
          ],
    };
  }

  getBybitState():
    ExchangeClockState {
    const diagnostics =
      bybitPrivateHttpClient
        .getClockDiagnostics();

    const ageMs =
      diagnostics.lastSynchronizedAt ===
      null
        ? null
        : Math.max(
            0,

            Date.now() -
              diagnostics.lastSynchronizedAt,
          );

    const absoluteOffsetMs =
      Math.abs(
        diagnostics.serverTimeOffsetMs,
      );

    const reasons:
      string[] = [];

    let health:
      ExchangeClockState["health"] =
      "HEALTHY";

    if (
      diagnostics.lastSynchronizationError
    ) {
      health =
        "FAILED";

      reasons.push(
        diagnostics.lastSynchronizationError,
      );
    } else if (
      !diagnostics.synchronized
    ) {
      health =
        "UNSYNCHRONIZED";

      reasons.push(
        "Bybit server time has not been synchronized yet.",
      );
    } else if (
      ageMs ===
        null ||
      ageMs >
        MAXIMUM_CLOCK_SYNC_AGE_MS
    ) {
      health =
        "STALE";

      reasons.push(
        `Bybit clock synchronization is stale (${ageMs ?? "unknown"} ms old).`,
      );
    }

    if (
      absoluteOffsetMs >
      MAXIMUM_CLOCK_OFFSET_MS
    ) {
      health =
        "FAILED";

      reasons.push(
        `Bybit clock offset ${absoluteOffsetMs} ms exceeds the allowed ${MAXIMUM_CLOCK_OFFSET_MS} ms.`,
      );
    }

    return {
      exchange:
        "bybit",

      mode:
        "SERVER_SYNCHRONIZED",

      health,

      synchronized:
        diagnostics.synchronized,

      offsetMs:
        diagnostics.serverTimeOffsetMs,

      absoluteOffsetMs,

      lastSynchronizedAt:
        diagnostics.lastSynchronizedAt,

      ageMs,

      maximumAllowedAgeMs:
        MAXIMUM_CLOCK_SYNC_AGE_MS,

      maximumAllowedOffsetMs:
        MAXIMUM_CLOCK_OFFSET_MS,

      signedRequestAllowed:
        health ===
        "HEALTHY",

      reasons,
    };
  }

  getCoinSwitchState():
    ExchangeClockState {
    const diagnostics =
      coinSwitchReadOnlyHttpClient
        .getClockDiagnostics();

    const ageMs =
      diagnostics.lastSynchronizedAt ===
        null
        ? null
        : Math.max(
            0,
            Date.now() -
              diagnostics.lastSynchronizedAt,
          );

    const absoluteOffsetMs =
      Math.abs(
        diagnostics.serverTimeOffsetMs,
      );

    const reasons:
      string[] = [];

    let health:
      ExchangeClockState["health"] =
      "HEALTHY";

    if (
      diagnostics.lastSynchronizationError
    ) {
      health =
        "FAILED";

      reasons.push(
        diagnostics.lastSynchronizationError,
      );
    } else if (
      !diagnostics.synchronized
    ) {
      health =
        "UNSYNCHRONIZED";

      reasons.push(
        "CoinSwitch server time has not been synchronized yet.",
      );
    } else if (
      ageMs ===
        null ||
      ageMs >
        MAXIMUM_CLOCK_SYNC_AGE_MS
    ) {
      health =
        "STALE";

      reasons.push(
        `CoinSwitch clock synchronization is stale (${ageMs ?? "unknown"} ms old).`,
      );
    }

    if (
      absoluteOffsetMs >
      5_000
    ) {
      health =
        "FAILED";

      reasons.push(
        `CoinSwitch clock offset ${absoluteOffsetMs} ms exceeds the allowed 5000 ms.`,
      );
    }

    return {
      exchange:
        "coinswitch",

      mode:
        "SERVER_SYNCHRONIZED",

      health,

      synchronized:
        diagnostics.synchronized,

      offsetMs:
        diagnostics.serverTimeOffsetMs,

      absoluteOffsetMs,

      lastSynchronizedAt:
        diagnostics.lastSynchronizedAt,

      ageMs,

      maximumAllowedAgeMs:
        MAXIMUM_CLOCK_SYNC_AGE_MS,

      maximumAllowedOffsetMs:
        5_000,

      signedRequestAllowed:
        health ===
        "HEALTHY",

      reasons,
    };
  }

  getUnoCoinState():
    ExchangeClockState {
    return {
      exchange:
        "unocoin",

      mode:
        "NOT_REQUIRED",

      health:
        "NOT_APPLICABLE",

      synchronized:
        false,

      offsetMs:
        0,

      absoluteOffsetMs:
        0,

      lastSynchronizedAt:
        null,

      ageMs:
        null,

      maximumAllowedAgeMs:
        0,

      maximumAllowedOffsetMs:
        0,

      signedRequestAllowed:
        true,

      reasons: [
        "UnoCoin bearer-token authenticated reads do not use client-signed request timestamps.",
      ],
    };
  }

  async synchronizeBinance():
    Promise<ExchangeClockState> {
    try {
      await binanceHttpClient
        .synchronizeServerTime();
    } catch {
      /*
       * BinanceHttpClient records the
       * synchronization error internally.
       */
    }

    return this.getBinanceState();
  }

  async synchronizeBybit():
    Promise<ExchangeClockState> {
    try {
      await bybitPrivateHttpClient
        .synchronizeServerTime();
    } catch {
      /*
       * BybitPrivateHttpClient records the
       * synchronization error internally.
       */
    }

    return this.getBybitState();
  }

  async synchronizeCoinSwitch():
    Promise<ExchangeClockState> {
    try {
      await coinSwitchReadOnlyHttpClient
        .synchronizeServerTime();
    } catch {
      /*
       * CoinSwitchReadOnlyHttpClient retains the
       * sanitized synchronization failure.
       */
    }

    return this.getCoinSwitchState();
  }

  async synchronizeAllSupported():
    Promise<
      ExchangeClockSafetyReport
    > {
    await Promise.all([
      this.synchronizeBinance(),
      this.synchronizeBybit(),
      this.synchronizeCoinSwitch(),
    ]);

    return this.getReport();
  }

  getReport():
    ExchangeClockSafetyReport {
    const exchanges = [
      this.getBinanceState(),
      this.getCoinDCXState(),
      this.getBybitState(),
      this.getCoinSwitchState(),
      this.getUnoCoinState(),
    ];

    const serverSynchronized =
      exchanges.filter(
        (
          exchange,
        ) =>
          exchange.mode ===
          "SERVER_SYNCHRONIZED",
      );

    const blockers =
      exchanges
        .filter(
          (
            exchange,
          ) =>
            !exchange.signedRequestAllowed,
        )
        .flatMap(
          (
            exchange,
          ) =>
            exchange.reasons.length >
              0
              ? exchange.reasons
              : [
                  `${exchange.exchange} clock is not safe for signed requests.`,
                ],
        );

    return {
      generatedAt:
        Date.now(),

      version:
        "18.0",

      build:
        "9",

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      automaticClockCorrectionAllowed:
        true,

      signedRequestsFailClosed:
        true,

      exchanges,

      allServerSynchronizedClocksHealthy:
        serverSynchronized.every(
          (
            exchange,
          ) =>
            exchange.signedRequestAllowed,
        ),

      blockers:
        [
          ...new Set(
            blockers,
          ),
        ],

      notes: [
        "Version 18 Build 9 hardens signed-request timestamp safety.",

        "Binance signed requests require recent successful server-time synchronization.",

        "CoinDCX uses local system time corroborated by at least two fresh independent exchange server clocks because CoinDCX does not document an authoritative server-time endpoint.",

        "CoinDCX is reported as LOCAL_CLOCK_ONLY rather than falsely marked synchronized.",

        "Bybit signed requests require recent successful server-time synchronization.",

        "CoinSwitch signed reads require recent successful server-time synchronization and a maximum 5000 ms absolute offset.",

        "UnoCoin bearer-token authenticated reads have no signed-request clock dependency and are reported as NOT_REQUIRED, not synchronized.",

        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }
}

export const exchangeClockSafetyService =
  new ExchangeClockSafetyService();
