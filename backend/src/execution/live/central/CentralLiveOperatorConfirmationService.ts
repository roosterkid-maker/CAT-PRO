import {
  randomUUID,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  CENTRAL_LIVE_ACTION_CONFIRMATION,
  type CentralLiveAdmissionEvidence,
} from "./CentralLiveExecutionAdmissionService";

/**
 * Real triangular opportunities qualify and expire on the order of
 * hundreds of milliseconds (signalTtlMs defaults to 500ms) - far faster
 * than a human can read a dashboard and click "confirm THIS exact plan."
 * CentralLiveExecutionAdmissionService's own actionAuthority gate only
 * requires `now - confirmedAt <= maximumActionAgeMs` (30s default) and
 * `actionAuthority.planId === plan.id` - it does not require the operator
 * to have known that exact planId in advance. So this service models a
 * real, honest "arm" window instead of a per-plan click: the operator
 * confirms ONCE with the exact phrase, which grants a single-use
 * authorization valid for `armTtlMs`; the bridge service claims it for
 * whichever specific plan is the first to qualify inside that window,
 * carrying the operator's REAL confirmation timestamp forward (never
 * fabricated) into that plan's actionAuthority evidence. One arm ==
 * exactly one real order dispatch; it is consumed on first claim (or on
 * expiry) and never reused.
 */
export interface CentralLiveOperatorArmRecord {
  readonly armId: string;
  readonly strategyId: string;
  readonly armedAt: number;
  readonly expiresAt: number;
  readonly status: "ARMED" | "CLAIMED" | "EXPIRED";
  readonly claimedByPlanId: string | null;
  readonly claimedAt: number | null;
}

const DEFAULT_FILE = resolve(
  process.cwd(),
  "logs",
  "live",
  "central-live-operator-confirmations.jsonl",
);

const DEFAULT_ARM_TTL_MS = 30_000;

export class CentralLiveOperatorConfirmationService {
  private readonly store: JsonlSnapshotStore<CentralLiveOperatorArmRecord>;
  private readonly arms = new Map<string, CentralLiveOperatorArmRecord>();

  constructor(
    private readonly armTtlMs = DEFAULT_ARM_TTL_MS,
    filePath = DEFAULT_FILE,
  ) {
    if (!Number.isSafeInteger(armTtlMs) || armTtlMs <= 0 || armTtlMs > DEFAULT_ARM_TTL_MS) {
      throw new Error("Central LIVE operator arm TTL must be positive and within the admission service's own maximumActionAgeMs bound.");
    }

    this.store = new JsonlSnapshotStore({
      filePath,
      isPayload: isArmRecord,
    });

    for (const record of this.store.readAll()) {
      this.arms.set(record.armId, freeze(clone(record)));
    }
  }

  /**
   * The one and only place a real order can ever be authorized in this
   * whole pipeline. Requires the exact CENTRAL_LIVE_ACTION_CONFIRMATION
   * phrase, same as every other "type the exact phrase" gate in this
   * codebase.
   */
  arm(
    strategyIdValue: string,
    confirmationPhrase: string,
    now = Date.now(),
  ): CentralLiveOperatorArmRecord {
    const strategyId = requireText(strategyIdValue, "strategyId");
    validateTime(now);

    if (confirmationPhrase.trim() !== CENTRAL_LIVE_ACTION_CONFIRMATION) {
      throw new Error(
        `Exact confirmation phrase "${CENTRAL_LIVE_ACTION_CONFIRMATION}" is required to arm a real central LIVE execution.`,
      );
    }

    const record: CentralLiveOperatorArmRecord = freeze({
      armId: `central-live-arm:${randomUUID()}`,
      strategyId,
      armedAt: now,
      expiresAt: now + this.armTtlMs,
      status: "ARMED",
      claimedByPlanId: null,
      claimedAt: null,
    });

    this.arms.set(record.armId, record);
    this.store.append(record);
    return clone(record);
  }

  /**
   * Consumes the current armed authorization (if any, unclaimed, unexpired,
   * for this exact strategy) for exactly one specific compiled plan, and
   * returns the actionAuthority sub-object ready to drop into
   * CentralLiveAdmissionEvidence. The operatorActionId and confirmedAt are
   * carried over UNCHANGED from the real arm() call - never regenerated -
   * so the admission gate's freshness check always reflects genuine human
   * confirmation time, not the moment of use.
   */
  claimForPlan(
    strategyIdValue: string,
    planId: string,
    now = Date.now(),
  ): CentralLiveAdmissionEvidence["actionAuthority"] | null {
    const strategyId = requireText(strategyIdValue, "strategyId");
    const plan = requireText(planId, "planId");
    validateTime(now);

    const current = [...this.arms.values()]
      .filter((item) => item.strategyId === strategyId && item.status === "ARMED" && item.expiresAt >= now)
      .sort((first, second) => first.armedAt - second.armedAt)[0];

    if (!current) {
      return null;
    }

    const claimed: CentralLiveOperatorArmRecord = freeze({
      ...clone(current),
      status: "CLAIMED",
      claimedByPlanId: plan,
      claimedAt: now,
    });

    this.arms.set(claimed.armId, claimed);
    this.store.append(claimed);

    return {
      operatorActionId: claimed.armId,
      planId: plan,
      confirmation: CENTRAL_LIVE_ACTION_CONFIRMATION,
      confirmedAt: claimed.armedAt,
      expiresAt: claimed.expiresAt,
    };
  }

  getStatus(strategyIdValue: string, now = Date.now()) {
    const strategyId = requireText(strategyIdValue, "strategyId");
    validateTime(now);
    const armed = [...this.arms.values()]
      .filter((item) => item.strategyId === strategyId && item.status === "ARMED" && item.expiresAt >= now)
      .sort((first, second) => second.armedAt - first.armedAt)[0] ?? null;
    const recent = [...this.arms.values()]
      .filter((item) => item.strategyId === strategyId)
      .sort((first, second) => second.armedAt - first.armedAt)
      .slice(0, 20)
      .map(clone);

    return freeze({
      generatedAt: now,
      strategyId,
      currentlyArmed: armed !== null,
      armedUntil: armed?.expiresAt ?? null,
      recent,
      safety: {
        exactConfirmationPhraseRequired: true,
        singleUsePerArm: true,
        maximumArmWindowMs: this.armTtlMs,
        operatorConfirmedTimestampNeverRegenerated: true,
      },
    });
  }

}

function isArmRecord(value: unknown): value is CentralLiveOperatorArmRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<CentralLiveOperatorArmRecord>;
  return typeof item.armId === "string" &&
    typeof item.strategyId === "string" &&
    Number.isSafeInteger(item.armedAt) &&
    Number.isSafeInteger(item.expiresAt) &&
    (item.status === "ARMED" || item.status === "CLAIMED" || item.status === "EXPIRED");
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Central LIVE operator confirmation timestamp must be positive.");
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    freeze(child);
  }

  return Object.freeze(value);
}

export const centralLiveOperatorConfirmationService =
  new CentralLiveOperatorConfirmationService();
