import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import {
  sharedRecoveryIntentService,
  type SharedRecoveryIntentService,
} from "./SharedRecoveryIntentService";

import type {
  SharedRecoveryIntent,
} from "../models/SharedRecoveryIntent";

/**
 * A live, freshly-queried authoritative balance for the exact asset and
 * exchange named on a SharedRecoveryIntent's leg. Mirrors the evidence
 * shape StrategyOneTwoLegRecoveryResolutionService already uses for the
 * two-leg pair-arbitrage case - the same real-incident pattern (WAVESUSDT,
 * PYBOBOUSDT, TUTUSDT this session) generalizes directly to a triangular
 * cycle's stuck intermediate-asset residual.
 */
export interface SharedRecoveryAuthoritativeBalanceEvidence {
  readonly exchange: string;
  readonly asset: string;
  readonly availableBalance: number;
  readonly borrowedAmount: number;
  readonly queriedAt: number;
  readonly evidenceSource: string;
}

export interface SharedRecoveryResolutionRecord {
  readonly schemaVersion: "1.0";
  readonly intentId: string;
  readonly sourceStrategyId: string;
  readonly status: "RESOLVED";
  readonly basis: "AUTHORITATIVE_BALANCE_COVERS_RESIDUAL";
  readonly resolutionNote: string;
  readonly resolvedAt: number;
  readonly balanceEvidence: SharedRecoveryAuthoritativeBalanceEvidence;
  readonly automaticOrderActionPerformed: false;
}

const DEFAULT_FILE = resolve(
  process.cwd(),
  "logs",
  "shared-recovery-resolutions.jsonl",
);

const MAXIMUM_BALANCE_EVIDENCE_AGE_MS = 5 * 60 * 1000;

/**
 * Explicit, evidence-bound resolution owner for SharedRecoveryIntent
 * records. SharedRecoveryIntentService itself only ever RECORDS residual
 * exposure - it has no resolve/clear method by design (immutable evidence
 * contract). This service is a separate resolution ledger, same pattern as
 * StrategyOneTwoLegRecoveryResolutionService: it never mutates the intent
 * itself, and the only network action it may trigger is none at all - the
 * caller supplies a balance already queried live, this service only
 * validates and journals it.
 *
 * Resolution basis covers both residual directions a stuck sequential leg
 * can leave: LONG (holding surplus of an intermediate asset, e.g. a
 * partially/fully filled leg whose next leg never consumed it) requires the
 * remaining balance to still cover the residual quantity; SHORT (owing more
 * of an asset than was actually acquired) requires only a non-negative
 * remaining balance, since a real exchange cannot already show a negative
 * spot balance without margin - the identical logic
 * StrategyOneTwoLegRecoveryResolutionService already applies to the
 * sell-filled/buy-filled two-leg cases.
 */
export class SharedRecoveryResolutionService {
  private readonly store: JsonlSnapshotStore<SharedRecoveryResolutionRecord>;
  private readonly resolutions = new Map<string, SharedRecoveryResolutionRecord>();

  constructor(
    private readonly intents: Pick<SharedRecoveryIntentService, "get"> = sharedRecoveryIntentService,
    filePath = DEFAULT_FILE,
  ) {
    this.store = new JsonlSnapshotStore({
      filePath,
      isPayload: isResolution,
    });

    for (const record of this.store.readAll()) {
      const current = this.resolutions.get(record.intentId);

      if (!current || record.resolvedAt >= current.resolvedAt) {
        this.resolutions.set(record.intentId, freeze(clone(record)));
      }
    }
  }

  resolveByAuthoritativeBalance(
    intentIdValue: string,
    balanceEvidenceValue: SharedRecoveryAuthoritativeBalanceEvidence,
    resolutionNoteValue: string,
    now = Date.now(),
  ): SharedRecoveryResolutionRecord {
    const intentId = requireText(intentIdValue, "intentId");
    const resolutionNote = requireText(resolutionNoteValue, "resolutionNote");
    validateTime(now);
    const balanceEvidence = validateBalanceEvidence(balanceEvidenceValue, now);

    const intent = this.intents.get(intentId);

    if (!intent) {
      throw new Error("No staged shared recovery intent exists for this id.");
    }

    if (!residualCoveredByBalance(intent, balanceEvidence)) {
      throw new Error(
        "Shared recovery intent remains unresolved: the authoritative balance evidence does not prove the residual is covered (wrong venue/asset, non-zero borrow, or insufficient remaining balance).",
      );
    }

    const record = freeze({
      schemaVersion: "1.0" as const,
      intentId: intent.id,
      sourceStrategyId: intent.sourceStrategyId,
      status: "RESOLVED" as const,
      basis: "AUTHORITATIVE_BALANCE_COVERS_RESIDUAL" as const,
      resolutionNote,
      resolvedAt: now,
      balanceEvidence,
      automaticOrderActionPerformed: false as const,
    });

    this.store.append(record);

    const current = this.resolutions.get(record.intentId);

    if (!current || record.resolvedAt >= current.resolvedAt) {
      this.resolutions.set(record.intentId, record);
    }

    return clone(record);
  }

  isIntentResolved(intentId: string): boolean {
    // SharedRecoveryIntent is immutable once staged (see the model's own
    // doc comment) - unlike StrategyOneTwoLegSessionRecord, which can be
    // reconciled and its transport fields rewritten, there is no source
    // drift to fingerprint against. A resolution record's mere existence
    // for this exact intent id is sufficient and permanent.
    return this.resolutions.has(intentId.trim());
  }

  getResolution(intentId: string): SharedRecoveryResolutionRecord | null {
    const value = this.resolutions.get(intentId.trim());
    return value ? clone(value) : null;
  }

  getDiagnostics(now = Date.now()) {
    validateTime(now);
    const resolutions = [...this.resolutions.values()]
      .sort((first, second) => second.resolvedAt - first.resolvedAt)
      .map(clone);

    return freeze({
      schemaVersion: "1.0" as const,
      generatedAt: now,
      resolutions,
      persistence: this.store.getDiagnostics(),
      safety: {
        explicitResolutionRequired: true,
        authoritativeBalanceRequired: true,
        allowNewSubmission: false,
        automaticOrderActionAllowed: false,
      },
    });
  }
}

function residualCoveredByBalance(
  intent: SharedRecoveryIntent,
  balanceEvidence: SharedRecoveryAuthoritativeBalanceEvidence,
): boolean {
  if (
    normalizeText(balanceEvidence.exchange) !== normalizeText(intent.leg.venue) ||
    normalizeText(balanceEvidence.asset) !== normalizeText(intent.asset)
  ) {
    return false;
  }

  if (balanceEvidence.borrowedAmount !== 0) {
    return false;
  }

  const requiredAvailableBalance = intent.residualDirection === "LONG"
    ? intent.leg.quantity
    : 0;

  return balanceEvidence.availableBalance >= requiredAvailableBalance;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function validateBalanceEvidence(
  value: SharedRecoveryAuthoritativeBalanceEvidence,
  now: number,
): SharedRecoveryAuthoritativeBalanceEvidence {
  const valid =
    typeof value === "object" &&
    value !== null &&
    Boolean(requireText(value.exchange, "balance exchange")) &&
    Boolean(requireText(value.asset, "balance asset")) &&
    Number.isFinite(value.availableBalance) &&
    Number.isFinite(value.borrowedAmount) &&
    Number.isSafeInteger(value.queriedAt) &&
    value.queriedAt > 0 &&
    value.queriedAt <= now &&
    now - value.queriedAt <= MAXIMUM_BALANCE_EVIDENCE_AGE_MS &&
    Boolean(requireText(value.evidenceSource, "balance evidenceSource"));

  if (!valid) {
    throw new Error(
      "Authoritative balance evidence is incomplete or stale (must be queried within the last 5 minutes).",
    );
  }

  return freeze(clone(value));
}

function isResolution(
  value: unknown,
): value is SharedRecoveryResolutionRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<SharedRecoveryResolutionRecord>;
  return item.schemaVersion === "1.0" &&
    item.status === "RESOLVED" &&
    typeof item.intentId === "string" &&
    typeof item.sourceStrategyId === "string" &&
    typeof item.resolutionNote === "string" &&
    Number.isSafeInteger(item.resolvedAt) &&
    item.automaticOrderActionPerformed === false;
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
    throw new Error("Shared recovery resolution timestamp must be positive.");
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

export const sharedRecoveryResolutionService =
  new SharedRecoveryResolutionService();
