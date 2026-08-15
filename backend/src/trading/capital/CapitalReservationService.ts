import {
  randomUUID,
} from "node:crypto";

import {
  tradingAccountService,
} from "../account/TradingAccountService";

import type {
  CapitalReservation,
  CapitalReservationDiagnostics,
  CapitalReservationStatus,
  CreateCapitalReservationRequest,
  CreateCapitalReservationResult,
} from "./CapitalReservation";

export class CapitalReservationService {
  private static readonly DEFAULT_TTL_MS =
    15_000;

  private static readonly MINIMUM_TTL_MS =
    1_000;

  private static readonly MAXIMUM_TTL_MS =
    5 * 60_000;

  private static readonly SWEEP_INTERVAL_MS =
    1_000;

  private static readonly HISTORY_CAPACITY =
    500;

  private readonly active =
    new Map<
      string,
      CapitalReservation
    >();

  private readonly activeByOwner =
    new Map<
      string,
      string
    >();

  private readonly history:
    CapitalReservation[] =
    [];

  private timer:
    ReturnType<typeof setInterval> |
    null =
    null;

  private totalCreated =
    0;

  private totalCommitted =
    0;

  private totalReleased =
    0;

  private totalExpired =
    0;

  private totalRejected =
    0;

  private lastSweepAt:
    number | null =
    null;

  private lastCreatedAt:
    number | null =
    null;

  private lastFinalizedAt:
    number | null =
    null;

  start(): void {
    if (
      this.timer !==
      null
    ) {
      return;
    }

    this.timer =
      setInterval(
        () => {
          this.sweepExpired();
        },

        CapitalReservationService
          .SWEEP_INTERVAL_MS,
      );

    this.timer.unref?.();
  }

  stop(): void {
    if (
      this.timer ===
      null
    ) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer =
      null;
  }

  reserve(
    request:
      CreateCapitalReservationRequest,
  ): CreateCapitalReservationResult {
    this.start();

    this.sweepExpired();

    const ownerId =
      request.ownerId
        .trim();

    const reasons:
      string[] =
      [];

    if (!ownerId) {
      reasons.push(
        "Capital reservation owner ID is required.",
      );
    }

    if (
      !Number.isFinite(
        request.amount,
      ) ||
      request.amount <=
        0
    ) {
      reasons.push(
        "Capital reservation amount must be a positive number.",
      );
    }

    const ttlMs =
      request.ttlMs ??
      CapitalReservationService
        .DEFAULT_TTL_MS;

    if (
      !Number.isFinite(
        ttlMs,
      ) ||
      ttlMs <
        CapitalReservationService
          .MINIMUM_TTL_MS ||
      ttlMs >
        CapitalReservationService
          .MAXIMUM_TTL_MS
    ) {
      reasons.push(
        `Capital reservation TTL must be between ${CapitalReservationService.MINIMUM_TTL_MS} and ${CapitalReservationService.MAXIMUM_TTL_MS} milliseconds.`,
      );
    }

    const ownerKey =
      this.createOwnerKey(
        request.ownerType,
        ownerId,
      );

    if (
      ownerId &&
      this.activeByOwner
        .has(
          ownerKey,
        )
    ) {
      reasons.push(
        "An active capital reservation already exists for this owner.",
      );
    }

    if (
      reasons.length ===
      0
    ) {
      const accountCheck =
        tradingAccountService
          .evaluateTrade(
            request.amount,
          );

      reasons.push(
        ...accountCheck
          .reasons,
      );
    }

    if (
      reasons.length >
      0
    ) {
      this.totalRejected +=
        1;

      return {
        approved:
          false,

        reservation:
          null,

        reasons,
      };
    }

    const reserved =
      tradingAccountService
        .reserveCapital(
          request.amount,
        );

    if (!reserved) {
      this.totalRejected +=
        1;

      return {
        approved:
          false,

        reservation:
          null,

        reasons: [
          "Unable to reserve trading capital.",
        ],
      };
    }

    const now =
      Date.now();

    const reservation:
      CapitalReservation = {
      id:
        randomUUID(),

      ownerType:
        request.ownerType,

      ownerId,

      amount:
        request.amount,

      status:
        "ACTIVE",

      createdAt:
        now,

      expiresAt:
        now +
        ttlMs,

      finalizedAt:
        null,

      reason:
        null,
    };

    this.active.set(
      reservation.id,
      reservation,
    );

    this.activeByOwner.set(
      ownerKey,
      reservation.id,
    );

    this.totalCreated +=
      1;

    this.lastCreatedAt =
      now;

    return {
      approved:
        true,

      reservation:
        structuredClone(
          reservation,
        ),

      reasons: [],
    };
  }

  commit(
    reservationId:
      string,

    reason =
      "Execution completed successfully.",
  ): CapitalReservation | null {
    return this.finalize(
      reservationId,
      "COMMITTED",
      reason,
    );
  }

  release(
    reservationId:
      string,

    reason =
      "Capital reservation released.",
  ): CapitalReservation | null {
    return this.finalize(
      reservationId,
      "RELEASED",
      reason,
    );
  }

  getById(
    reservationId:
      string,
  ): CapitalReservation | null {
    this.sweepExpired();

    const active =
      this.active.get(
        reservationId,
      );

    if (active) {
      return structuredClone(
        active,
      );
    }

    const historical =
      this.history.find(
        (reservation) =>
          reservation.id ===
          reservationId,
      );

    return historical
      ? structuredClone(
          historical,
        )
      : null;
  }

  getActive():
    CapitalReservation[] {
    this.sweepExpired();

    return Array.from(
      this.active.values(),
    )
      .sort(
        (
          first,
          second,
        ) =>
          first.createdAt -
          second.createdAt,
      )
      .map(
        (reservation) =>
          structuredClone(
            reservation,
          ),
      );
  }

  getDiagnostics():
    CapitalReservationDiagnostics {
    this.sweepExpired();

    const active =
      this.getActive();

    const activeReservedCapital =
      active.reduce(
        (
          total,
          reservation,
        ) =>
          total +
          reservation.amount,
        0,
      );

    return {
      running:
        this.timer !==
        null,

      sweepIntervalMs:
        CapitalReservationService
          .SWEEP_INTERVAL_MS,

      activeReservations:
        active.length,

      activeReservedCapital,

      totalCreated:
        this.totalCreated,

      totalCommitted:
        this.totalCommitted,

      totalReleased:
        this.totalReleased,

      totalExpired:
        this.totalExpired,

      totalRejected:
        this.totalRejected,

      lastSweepAt:
        this.lastSweepAt,

      lastCreatedAt:
        this.lastCreatedAt,

      lastFinalizedAt:
        this.lastFinalizedAt,

      active,

      recent:
        this.history
          .slice(
            -50,
          )
          .reverse()
          .map(
            (reservation) =>
              structuredClone(
                reservation,
              ),
          ),
    };
  }

  sweepExpired(
    now =
      Date.now(),
  ): number {
    this.lastSweepAt =
      now;

    let expired =
      0;

    for (
      const reservation
      of Array.from(
        this.active.values(),
      )
    ) {
      if (
        reservation.expiresAt >
        now
      ) {
        continue;
      }

      const finalized =
        this.finalize(
          reservation.id,
          "EXPIRED",
          "Capital reservation expired before execution completion.",
          now,
        );

      if (finalized) {
        expired +=
          1;
      }
    }

    return expired;
  }

  private finalize(
    reservationId:
      string,

    status:
      Exclude<
        CapitalReservationStatus,
        "ACTIVE"
      >,

    reason:
      string,

    now =
      Date.now(),
  ): CapitalReservation | null {
    const reservation =
      this.active.get(
        reservationId,
      );

    if (!reservation) {
      return null;
    }

    /*
     * Arbitrage uses capital temporarily.
     *
     * COMMITTED:
     * execution succeeded, principal returns.
     *
     * RELEASED:
     * execution failed/cancelled, hold removed.
     *
     * EXPIRED:
     * execution did not complete in time.
     *
     * PnL is handled separately by the
     * account settlement layer.
     */
    tradingAccountService
      .releaseCapital(
        reservation.amount,
      );

    const finalized:
      CapitalReservation = {
      ...reservation,

      status,

      finalizedAt:
        now,

      reason:
        reason.trim() ||
        null,
    };

    this.active.delete(
      reservation.id,
    );

    this.activeByOwner.delete(
      this.createOwnerKey(
        reservation.ownerType,
        reservation.ownerId,
      ),
    );

    this.history.push(
      finalized,
    );

    if (
      this.history.length >
      CapitalReservationService
        .HISTORY_CAPACITY
    ) {
      this.history.splice(
        0,
        this.history.length -
          CapitalReservationService
            .HISTORY_CAPACITY,
      );
    }

    if (
      status ===
      "COMMITTED"
    ) {
      this.totalCommitted +=
        1;
    } else if (
      status ===
      "RELEASED"
    ) {
      this.totalReleased +=
        1;
    } else {
      this.totalExpired +=
        1;
    }

    this.lastFinalizedAt =
      now;

    return structuredClone(
      finalized,
    );
  }

  private createOwnerKey(
    ownerType:
      string,

    ownerId:
      string,
  ): string {
    return (
      `${ownerType.trim().toUpperCase()}:` +
      ownerId.trim()
    );
  }
}

export const capitalReservationService =
  new CapitalReservationService();