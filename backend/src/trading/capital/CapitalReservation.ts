export type CapitalReservationStatus =
  | "ACTIVE"
  | "COMMITTED"
  | "RELEASED"
  | "EXPIRED";

export type CapitalReservationOwnerType =
  | "EXECUTION_PLAN"
  | "STRATEGY_RISK_APPROVAL"
  | "MANUAL";

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
}

export interface CreateCapitalReservationRequest {
  ownerType: CapitalReservationOwnerType;

  ownerId: string;

  amount: number;

  ttlMs?: number;
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
