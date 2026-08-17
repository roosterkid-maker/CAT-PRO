export type CapitalReservationStatus =
  | "ACTIVE"
  | "COMMITTED"
  | "RELEASED"
  | "EXPIRED";

export type CapitalReservationOwnerType =
  | "EXECUTION_PLAN"
  | "STRATEGY_RISK_APPROVAL"
  | "MANUAL";

/**
 * One wallet-inventory requirement that must remain unavailable to every
 * other execution owner while the parent capital reservation is ACTIVE.
 */
export interface CapitalReservationInventoryRequirement {
  readonly exchange: string;

  readonly asset: string;

  readonly amount: number;

  readonly maximumAgeMs?: number;
}

/**
 * Immutable evidence captured when an exchange+asset hold is admitted.
 */
export interface CapitalReservationInventoryHold {
  readonly exchange: string;

  readonly asset: string;

  readonly amount: number;

  readonly snapshotAvailableBalance: number;

  readonly reservedBefore: number;

  readonly availableAfterReservation: number;

  readonly snapshotSynchronizedAt: number;

  readonly snapshotAgeMs: number;

  readonly maximumAgeMs: number;
}

export interface ActiveInventoryReservationAggregate {
  readonly exchange: string;

  readonly asset: string;

  readonly reservedAmount: number;

  readonly reservationCount: number;
}

export interface CapitalReservationInventoryAvailability {
  readonly approved: boolean;

  readonly exchange: string;

  readonly asset: string;

  readonly requestedAmount: number;

  readonly snapshotAvailableBalance: number | null;

  readonly activeReservedAmount: number;

  readonly availableAfterReservations: number | null;

  readonly snapshotSynchronizedAt: number | null;

  readonly snapshotAgeMs: number | null;

  readonly maximumAgeMs: number;

  readonly reasons: readonly string[];
}

export interface CapitalReservation {
  readonly id: string;

  readonly ownerType: CapitalReservationOwnerType;

  readonly ownerId: string;

  readonly amount: number;

  readonly status: CapitalReservationStatus;

  readonly createdAt: number;

  readonly expiresAt: number;

  readonly finalizedAt: number | null;

  readonly reason: string | null;

  readonly inventoryHolds: readonly CapitalReservationInventoryHold[];
}

export interface CreateCapitalReservationRequest {
  ownerType: CapitalReservationOwnerType;

  ownerId: string;

  amount: number;

  ttlMs?: number;

  /** Omitted for legacy/PAPER accounting-only reservations. */
  inventoryRequirements?: readonly CapitalReservationInventoryRequirement[];
}

export interface CreateCapitalReservationResult {
  approved: boolean;

  reservation: CapitalReservation | null;

  reasons: string[];
}

export interface CapitalReservationDiagnostics {
  running: boolean;

  sweepIntervalMs: number;

  activeReservations: number;

  activeReservedCapital: number;

  activeInventoryReservations: number;

  unscopedActiveReservations: number;

  activeInventoryHolds: readonly ActiveInventoryReservationAggregate[];

  totalCreated: number;

  totalCommitted: number;

  totalReleased: number;

  totalExpired: number;

  totalRejected: number;

  lastSweepAt: number | null;

  lastCreatedAt: number | null;

  lastFinalizedAt: number | null;

  active: CapitalReservation[];

  recent: CapitalReservation[];
}
