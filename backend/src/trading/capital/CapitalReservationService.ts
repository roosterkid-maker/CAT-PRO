import {
  randomUUID,
} from "node:crypto";

import {
  tradingAccountService,
  type ExchangeBalanceSnapshot,
  type TradingAccountCheckResult,
} from "../account/TradingAccountService";

import type {
  ActiveInventoryReservationAggregate,
  CapitalReservation,
  CapitalReservationDiagnostics,
  CapitalReservationInventoryAvailability,
  CapitalReservationInventoryHold,
  CapitalReservationInventoryRequirement,
  CapitalReservationStatus,
  CreateCapitalReservationRequest,
  CreateCapitalReservationResult,
} from "./CapitalReservation";

export interface CapitalReservationAccountPort {
  evaluateTrade(amount: number): TradingAccountCheckResult;
  reserveCapital(amount: number): boolean;
  releaseCapital(amount: number): void;
  getExchangeBalance(exchange: string, asset: string): ExchangeBalanceSnapshot | null;
}

interface NormalizedInventoryRequirement {
  readonly exchange: string;
  readonly asset: string;
  readonly amount: number;
  readonly maximumAgeMs: number;
}

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

  private static readonly DEFAULT_MAXIMUM_BALANCE_AGE_MS =
    15_000;

  private static readonly MAXIMUM_BALANCE_AGE_MS =
    5 * 60_000;

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

  /** Allocation-free aggregate lookup used by the synchronous admission path. */
  private readonly activeInventoryByKey =
    new Map<string, number>();

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

  constructor(
    private readonly account: CapitalReservationAccountPort =
      tradingAccountService,
    private readonly now: () => number =
      Date.now,
  ) {}

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

    const now =
      this.now();

    this.sweepExpired(
      now,
    );

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

    let inventoryRequirements:
      readonly NormalizedInventoryRequirement[] =
      [];

    try {
      inventoryRequirements =
        this.normalizeInventoryRequirements(
          request.inventoryRequirements ??
            [],
        );
    } catch (
      error: unknown
    ) {
      reasons.push(
        error instanceof Error
          ? error.message
          : "Exchange-asset inventory requirements are invalid.",
      );
    }

    if (
      reasons.length ===
      0
    ) {
      const accountCheck =
        this.account
          .evaluateTrade(
            request.amount,
          );

      reasons.push(
        ...accountCheck
          .reasons,
      );
    }

    let inventoryHolds:
      readonly CapitalReservationInventoryHold[] =
      [];

    if (
      reasons.length ===
        0 &&
      inventoryRequirements.length >
        0
    ) {
      const evaluated =
        this.evaluateInventoryRequirements(
          inventoryRequirements,
          now,
        );

      inventoryHolds =
        evaluated.holds;

      reasons.push(
        ...evaluated.reasons,
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
      this.account
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

      inventoryHolds,
    };

    try {
      this.applyInventoryHolds(
        inventoryHolds,
      );
    } catch (
      error: unknown
    ) {
      this.account.releaseCapital(
        request.amount,
      );
      this.totalRejected +=
        1;

      return {
        approved:
          false,
        reservation:
          null,
        reasons: [
          error instanceof Error
            ? error.message
            : "Unable to apply exchange-asset inventory holds.",
        ],
      };
    }

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

  getInventoryAvailability(
    exchange: string,
    asset: string,
    requestedAmount = 0,
    maximumAgeMs =
      CapitalReservationService.DEFAULT_MAXIMUM_BALANCE_AGE_MS,
    now =
      this.now(),
  ): CapitalReservationInventoryAvailability {
    this.sweepExpired(
      now,
    );

    const normalizedExchange =
      exchange.trim().toLowerCase();
    const normalizedAsset =
      asset.trim().toUpperCase();
    const reasons:
      string[] =
      [];

    if (!normalizedExchange) {
      reasons.push(
        "Inventory availability requires an exchange.",
      );
    }

    if (!normalizedAsset) {
      reasons.push(
        "Inventory availability requires an asset.",
      );
    }

    if (
      !Number.isFinite(requestedAmount) ||
      requestedAmount < 0
    ) {
      reasons.push(
        "Requested inventory amount must be finite and non-negative.",
      );
    }

    if (
      !Number.isSafeInteger(maximumAgeMs) ||
      maximumAgeMs <= 0 ||
      maximumAgeMs > CapitalReservationService.MAXIMUM_BALANCE_AGE_MS
    ) {
      reasons.push(
        `Maximum inventory balance age must be between 1 and ${CapitalReservationService.MAXIMUM_BALANCE_AGE_MS} milliseconds.`,
      );
    }

    const key =
      this.createInventoryKey(
        normalizedExchange,
        normalizedAsset,
      );
    const activeReservedAmount =
      this.activeInventoryByKey.get(key) ??
      0;
    const snapshot =
      normalizedExchange &&
      normalizedAsset
        ? this.account.getExchangeBalance(
            normalizedExchange,
            normalizedAsset,
          )
        : null;

    if (!snapshot) {
      reasons.push(
        "Exchange balance has not been synchronized.",
      );
    }

    const snapshotAgeMs =
      snapshot
        ? now - snapshot.synchronizedAt
        : null;

    if (
      snapshot &&
      (
        !Number.isSafeInteger(snapshot.synchronizedAt) ||
        snapshot.synchronizedAt <= 0 ||
        snapshotAgeMs === null ||
        snapshotAgeMs < 0 ||
        snapshotAgeMs > maximumAgeMs
      )
    ) {
      reasons.push(
        "Exchange balance snapshot is stale or has an invalid timestamp.",
      );
    }

    if (
      snapshot &&
      (
        !Number.isFinite(snapshot.availableBalance) ||
        snapshot.availableBalance < 0
      )
    ) {
      reasons.push(
        "Exchange available balance is invalid.",
      );
    }

    const availableAfterReservations =
      snapshot &&
      Number.isFinite(snapshot.availableBalance) &&
      snapshot.availableBalance >= 0
        ? Math.max(
            0,
            snapshot.availableBalance - activeReservedAmount,
          )
        : null;

    if (
      availableAfterReservations !== null &&
      Number.isFinite(requestedAmount) &&
      requestedAmount >= 0 &&
      availableAfterReservations + 1e-12 < requestedAmount
    ) {
      reasons.push(
        `Insufficient ${normalizedAsset || "asset"} balance on ${normalizedExchange || "exchange"} after active reservations.`,
      );
    }

    return {
      approved:
        reasons.length === 0,
      exchange:
        normalizedExchange,
      asset:
        normalizedAsset,
      requestedAmount,
      snapshotAvailableBalance:
        snapshot?.availableBalance ?? null,
      activeReservedAmount,
      availableAfterReservations,
      snapshotSynchronizedAt:
        snapshot?.synchronizedAt ?? null,
      snapshotAgeMs,
      maximumAgeMs,
      reasons: [
        ...new Set(reasons),
      ],
    };
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

    const activeInventoryReservations =
      active.filter(
        (reservation) =>
          reservation.inventoryHolds.length > 0,
      ).length;

    const activeInventoryHolds:
      ActiveInventoryReservationAggregate[] =
      [...this.activeInventoryByKey.entries()]
        .map(
          ([key, reservedAmount]) => {
            const [exchange, asset] =
              this.parseInventoryKey(key);

            return {
              exchange,
              asset,
              reservedAmount,
              reservationCount:
                active.filter(
                  (reservation) =>
                    reservation.inventoryHolds.some(
                      (hold) =>
                        hold.exchange === exchange &&
                        hold.asset === asset,
                    ),
                ).length,
            };
          },
        )
        .sort(
          (first, second) =>
            first.exchange.localeCompare(second.exchange) ||
            first.asset.localeCompare(second.asset),
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

      activeInventoryReservations,

      unscopedActiveReservations:
        active.length -
        activeInventoryReservations,

      activeInventoryHolds,

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
      this.now(),
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
      this.now(),
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
    this.account
      .releaseCapital(
        reservation.amount,
      );

    this.releaseInventoryHolds(
      reservation.inventoryHolds,
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

  private normalizeInventoryRequirements(
    requirements:
      readonly CapitalReservationInventoryRequirement[],
  ): readonly NormalizedInventoryRequirement[] {
    const aggregated =
      new Map<
        string,
        NormalizedInventoryRequirement
      >();

    for (const requirement of requirements) {
      const exchange =
        requirement.exchange.trim().toLowerCase();
      const asset =
        requirement.asset.trim().toUpperCase();
      const maximumAgeMs =
        requirement.maximumAgeMs ??
        CapitalReservationService.DEFAULT_MAXIMUM_BALANCE_AGE_MS;

      if (!exchange) {
        throw new Error(
          "Exchange-asset reservation requires an exchange.",
        );
      }

      if (!asset) {
        throw new Error(
          "Exchange-asset reservation requires an asset.",
        );
      }

      if (
        !Number.isFinite(requirement.amount) ||
        requirement.amount <= 0
      ) {
        throw new Error(
          `Exchange-asset reservation amount must be positive for ${exchange} ${asset}.`,
        );
      }

      if (
        !Number.isSafeInteger(maximumAgeMs) ||
        maximumAgeMs <= 0 ||
        maximumAgeMs > CapitalReservationService.MAXIMUM_BALANCE_AGE_MS
      ) {
        throw new Error(
          `Maximum inventory balance age must be between 1 and ${CapitalReservationService.MAXIMUM_BALANCE_AGE_MS} milliseconds.`,
        );
      }

      const key =
        this.createInventoryKey(
          exchange,
          asset,
        );
      const existing =
        aggregated.get(key);
      const amount =
        (existing?.amount ?? 0) +
        requirement.amount;

      if (!Number.isFinite(amount)) {
        throw new Error(
          `Aggregated exchange-asset reservation amount overflowed for ${exchange} ${asset}.`,
        );
      }

      aggregated.set(
        key,
        {
          exchange,
          asset,
          amount,
          maximumAgeMs:
            Math.min(
              existing?.maximumAgeMs ?? maximumAgeMs,
              maximumAgeMs,
            ),
        },
      );
    }

    return [...aggregated.values()]
      .sort(
        (first, second) =>
          first.exchange.localeCompare(second.exchange) ||
          first.asset.localeCompare(second.asset),
      );
  }

  private evaluateInventoryRequirements(
    requirements:
      readonly NormalizedInventoryRequirement[],
    now:
      number,
  ): {
    readonly holds: readonly CapitalReservationInventoryHold[];
    readonly reasons: readonly string[];
  } {
    const holds:
      CapitalReservationInventoryHold[] =
      [];
    const reasons:
      string[] =
      [];

    for (const requirement of requirements) {
      const availability =
        this.getInventoryAvailability(
          requirement.exchange,
          requirement.asset,
          requirement.amount,
          requirement.maximumAgeMs,
          now,
        );

      if (
        !availability.approved ||
        availability.snapshotAvailableBalance === null ||
        availability.availableAfterReservations === null ||
        availability.snapshotSynchronizedAt === null ||
        availability.snapshotAgeMs === null
      ) {
        reasons.push(
          ...availability.reasons,
        );
        continue;
      }

      holds.push({
        exchange:
          availability.exchange,
        asset:
          availability.asset,
        amount:
          requirement.amount,
        snapshotAvailableBalance:
          availability.snapshotAvailableBalance,
        reservedBefore:
          availability.activeReservedAmount,
        availableAfterReservation:
          availability.availableAfterReservations -
          requirement.amount,
        snapshotSynchronizedAt:
          availability.snapshotSynchronizedAt,
        snapshotAgeMs:
          availability.snapshotAgeMs,
        maximumAgeMs:
          requirement.maximumAgeMs,
      });
    }

    return {
      holds:
        reasons.length === 0
          ? holds
          : [],
      reasons: [
        ...new Set(reasons),
      ],
    };
  }

  private applyInventoryHolds(
    holds:
      readonly CapitalReservationInventoryHold[],
  ): void {
    const updates:
      Array<readonly [string, number]> =
      [];

    for (const hold of holds) {
      const key =
        this.createInventoryKey(
          hold.exchange,
          hold.asset,
        );
      const current =
        this.activeInventoryByKey.get(key) ??
        0;
      const next =
        current + hold.amount;

      if (
        !Number.isFinite(next) ||
        next <= 0
      ) {
        throw new Error(
          "Exchange-asset inventory hold overflowed.",
        );
      }

      updates.push([
        key,
        next,
      ]);
    }

    for (const [key, next] of updates) {
      this.activeInventoryByKey.set(
        key,
        next,
      );
    }
  }

  private releaseInventoryHolds(
    holds:
      readonly CapitalReservationInventoryHold[],
  ): void {
    for (const hold of holds) {
      const key =
        this.createInventoryKey(
          hold.exchange,
          hold.asset,
        );
      const current =
        this.activeInventoryByKey.get(key) ??
        0;
      const next =
        current - hold.amount;

      if (next > 1e-12) {
        this.activeInventoryByKey.set(
          key,
          next,
        );
      } else {
        this.activeInventoryByKey.delete(
          key,
        );
      }
    }
  }

  private createInventoryKey(
    exchange: string,
    asset: string,
  ): string {
    return `${exchange.trim().toLowerCase()}\u0000${asset.trim().toUpperCase()}`;
  }

  private parseInventoryKey(
    key: string,
  ): readonly [string, string] {
    const [exchange = "", asset = ""] =
      key.split("\u0000", 2);

    return [exchange, asset];
  }
}

export const capitalReservationService =
  new CapitalReservationService();
