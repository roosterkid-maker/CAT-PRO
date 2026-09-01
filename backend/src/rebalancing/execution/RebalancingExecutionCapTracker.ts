/*
 * Hard spend caps for the Automated Capital Rebalancer, durable across
 * restarts. This is the actual enforcement point for "never move more than
 * X per transfer, Y per day" - every execution path MUST call reserve()
 * (which throws if the move is not allowed) BEFORE calling out to an
 * exchange, never after. There is no separate commit/release step: the
 * reservation is written to disk synchronously inside reserve() itself, so
 * a crash right after can only under-count today's spend, never over-count
 * it - see the reserve() docstring below for why that's the safe direction.
 *
 * Two independent trackers exist at the call site (same-exchange vs
 * cross-exchange) with separate JSONL files and separate caps, so a busy
 * day of internal transfers can't crowd out withdrawal budget or vice
 * versa - matches the operator's explicit choice to keep the two pools
 * separate rather than sharing one combined daily total.
 */

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

export interface RebalancingCapPolicy {
  readonly maximumPerTransferUsdt: number;
  readonly maximumPerDayUsdt: number;
}

interface CapTrackerState {
  readonly version: "1.0";
  readonly dateKey: string;
  readonly spentTodayUsdt: number;
  readonly transfersToday: number;
  readonly updatedAt: number;
}

export interface RebalancingCapReservation {
  readonly amountUsdt: number;
  readonly remainingDailyBudgetUsdt: number;
}

export type RebalancingCapRejectionReason =
  | "AMOUNT_EXCEEDS_PER_TRANSFER_CAP"
  | "AMOUNT_EXCEEDS_REMAINING_DAILY_BUDGET"
  | "AMOUNT_NOT_POSITIVE";

export interface RebalancingCapCheck {
  readonly allowed: boolean;
  readonly reason: RebalancingCapRejectionReason | null;
  readonly maximumPerTransferUsdt: number;
  readonly remainingDailyBudgetUsdt: number;
}

function accountingDateKey(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isCapTrackerState(value: unknown): value is CapTrackerState {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<CapTrackerState>;
  return (
    record.version === "1.0" &&
    typeof record.dateKey === "string" &&
    Number.isFinite(record.spentTodayUsdt) &&
    (record.spentTodayUsdt ?? -1) >= 0 &&
    Number.isSafeInteger(record.transfersToday) &&
    (record.transfersToday ?? -1) >= 0 &&
    Number.isSafeInteger(record.updatedAt)
  );
}

export class RebalancingExecutionCapTracker {
  private readonly store: JsonlSnapshotStore<CapTrackerState>;
  private state: CapTrackerState;

  constructor(
    private readonly policy: RebalancingCapPolicy,
    persistenceFilePath: string,
    now: number = Date.now(),
  ) {
    if (!Number.isFinite(policy.maximumPerTransferUsdt) || policy.maximumPerTransferUsdt <= 0) {
      throw new Error("Rebalancing per-transfer cap must be a positive finite USDT amount.");
    }
    if (!Number.isFinite(policy.maximumPerDayUsdt) || policy.maximumPerDayUsdt < policy.maximumPerTransferUsdt) {
      throw new Error("Rebalancing daily cap must be finite and at least the per-transfer cap.");
    }

    this.store = new JsonlSnapshotStore<CapTrackerState>({
      filePath: persistenceFilePath,
      isPayload: isCapTrackerState,
    });

    const restored = this.store.readLatest();
    this.state = restored ?? this.freshState(now);
  }

  /** Read-only check - does not reserve budget. Use before showing a plan to an operator, etc. */
  check(amountUsdt: number, now: number = Date.now()): RebalancingCapCheck {
    this.rollDailyWindowIfNeeded(now);

    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
      return {
        allowed: false,
        reason: "AMOUNT_NOT_POSITIVE",
        maximumPerTransferUsdt: this.policy.maximumPerTransferUsdt,
        remainingDailyBudgetUsdt: this.remainingDailyBudgetUsdt(),
      };
    }

    if (amountUsdt > this.policy.maximumPerTransferUsdt) {
      return {
        allowed: false,
        reason: "AMOUNT_EXCEEDS_PER_TRANSFER_CAP",
        maximumPerTransferUsdt: this.policy.maximumPerTransferUsdt,
        remainingDailyBudgetUsdt: this.remainingDailyBudgetUsdt(),
      };
    }

    if (amountUsdt > this.remainingDailyBudgetUsdt()) {
      return {
        allowed: false,
        reason: "AMOUNT_EXCEEDS_REMAINING_DAILY_BUDGET",
        maximumPerTransferUsdt: this.policy.maximumPerTransferUsdt,
        remainingDailyBudgetUsdt: this.remainingDailyBudgetUsdt(),
      };
    }

    return {
      allowed: true,
      reason: null,
      maximumPerTransferUsdt: this.policy.maximumPerTransferUsdt,
      remainingDailyBudgetUsdt: this.remainingDailyBudgetUsdt(),
    };
  }

  /**
   * Reserves (and immediately durably records) spend for one transfer.
   * Call this BEFORE sending the exchange request, not after - a crash
   * between "exchange accepted it" and "we recorded it" must never leave
   * the cap under-counted, since that's the direction that lets a bug send
   * more real money than intended. A reservation that turns out to be for
   * a transfer that never actually executes just makes today's budget look
   * a bit tighter than it truly is - the safe side to err on.
   */
  reserve(amountUsdt: number, now: number = Date.now()): RebalancingCapReservation {
    const outcome = this.check(amountUsdt, now);
    if (!outcome.allowed) {
      throw new Error(`Rebalancing cap rejected ${amountUsdt} USDT: ${outcome.reason}`);
    }

    this.rollDailyWindowIfNeeded(now);
    const next: CapTrackerState = {
      version: "1.0",
      dateKey: this.state.dateKey,
      spentTodayUsdt: round2(this.state.spentTodayUsdt + amountUsdt),
      transfersToday: this.state.transfersToday + 1,
      updatedAt: now,
    };
    this.store.append(next);
    this.state = next;

    return {
      amountUsdt,
      remainingDailyBudgetUsdt: this.remainingDailyBudgetUsdt(),
    };
  }

  remainingDailyBudgetUsdt(): number {
    return Math.max(0, round2(this.policy.maximumPerDayUsdt - this.state.spentTodayUsdt));
  }

  snapshot(): CapTrackerState {
    return structuredClone(this.state);
  }

  private rollDailyWindowIfNeeded(now: number): void {
    const key = accountingDateKey(now);
    if (this.state.dateKey === key) return;
    const reset = this.freshState(now, key);
    this.store.append(reset);
    this.state = reset;
  }

  private freshState(now: number, dateKey: string = accountingDateKey(now)): CapTrackerState {
    return {
      version: "1.0",
      dateKey,
      spentTodayUsdt: 0,
      transfersToday: 0,
      updatedAt: now,
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
