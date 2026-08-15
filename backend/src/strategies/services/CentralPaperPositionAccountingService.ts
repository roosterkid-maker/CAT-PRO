import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../core/persistence/JsonlSnapshotStore";
import {tradingAccountService} from "../../trading/account/TradingAccountService";
import type {TradingAccount} from "../../trading/account/TradingAccount";
import type {CentralPaperPositionGroup} from "./CentralPaperPositionLedgerService";
import type {CentralPaperAssetConversionEvidence} from "./CentralPaperCapitalValuationService";

export interface CentralPaperAccountPort {
  getAccount(): TradingAccount;
  runWithAccountingTransaction<T>(transactionId: string, operation: () => T): T;
  hasAppliedAccountingTransaction(transactionId: string): boolean;
  recordProfit(profit: number): void;
}

export interface CentralPaperPositionAccountingRecord {
  readonly version: "44.0";
  readonly id: string;
  readonly positionGroupId: string;
  readonly resultId: string;
  readonly closeEvidenceId: string;
  readonly transactionId: string;
  readonly sourcePnl: number;
  readonly sourcePnlAsset: string;
  readonly conversionEvidenceId: string;
  readonly netPnlInr: number;
  readonly state: "PENDING_ACCOUNT_POST" | "ACCOUNT_POSTED";
  readonly capturedAt: number;
  readonly appliedAt: number | null;
  readonly accountCapitalBefore: number;
  readonly accountCapitalAfter: number | null;
  readonly replaySafe: true;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

interface PersistedAccountingSnapshot {
  readonly version: "44.0";
  readonly savedAt: number;
  readonly records: readonly CentralPaperPositionAccountingRecord[];
}

const DEFAULT_FILE = resolve(process.cwd(), "logs", "paper", "central-position-accounting.jsonl");

export class CentralPaperPositionAccountingService {
  private readonly store: JsonlSnapshotStore<PersistedAccountingSnapshot>;
  private readonly records = new Map<string, CentralPaperPositionAccountingRecord>();
  private restoredAt: number | null = null;

  constructor(private readonly persistenceFilePath = DEFAULT_FILE, private readonly account: CentralPaperAccountPort = tradingAccountService) {
    this.store = new JsonlSnapshotStore({filePath: persistenceFilePath, isPayload: isSnapshot});
    this.restore();
  }

  book(group: CentralPaperPositionGroup, conversion: CentralPaperAssetConversionEvidence, now = Date.now()): CentralPaperPositionAccountingRecord {
    this.validate(group, conversion, now);
    const existing = this.records.get(group.id);
    if (existing) {
      this.assertSame(existing, group, conversion);
      if (existing.state === "ACCOUNT_POSTED") return clone(existing);
      return this.apply(existing, now);
    }
    const account = this.account.getAccount();
    if (account.mode !== "PAPER" || !account.enabled || account.emergencyStop) throw new Error("Central PAPER position accounting requires an enabled non-stopped PAPER account.");
    const closeEvidenceId = group.closeEvidenceId!;
    const transactionId = `central-paper-position:${group.id}:${closeEvidenceId}:${conversion.id}`;
    const netPnlInr = normalize(Math.sign(group.realizedNetPnlQuote!) * conversion.targetQuantity);
    const pending = freeze({version: "44.0" as const, id: `central-paper-accounting:${group.id}`, positionGroupId: group.id,
      resultId: group.resultId, closeEvidenceId, transactionId, sourcePnl: group.realizedNetPnlQuote!, sourcePnlAsset: group.realizedPnlAsset!,
      conversionEvidenceId: conversion.id, netPnlInr, state: "PENDING_ACCOUNT_POST" as const,
      capturedAt: now, appliedAt: null, accountCapitalBefore: account.currentCapital, accountCapitalAfter: null,
      replaySafe: true as const, liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.records.set(group.id, pending);
    this.persist(now);
    return this.apply(pending, now);
  }

  replayPending(getGroup: (groupId: string) => CentralPaperPositionGroup | null,
    getConversion: (record: CentralPaperPositionAccountingRecord) => CentralPaperAssetConversionEvidence | null, now = Date.now()) {
    const errors: string[] = [];
    let completed = 0;
    const pending = [...this.records.values()].filter((item) => item.state === "PENDING_ACCOUNT_POST");
    for (const item of pending) {
      try {
        const group = getGroup(item.positionGroupId);
        if (!group) throw new Error("Closed position group is unavailable for accounting replay.");
        const conversion = getConversion(item);
        if (!conversion) throw new Error("P&L conversion evidence is unavailable for accounting replay.");
        this.book(group, conversion, now);
        completed += 1;
      } catch (error: unknown) { errors.push(`${item.positionGroupId}: ${error instanceof Error ? error.message : "Accounting replay failed."}`); }
    }
    return freeze({attempted: pending.length, completed, failed: errors.length, remainingPending: [...this.records.values()].filter((item) => item.state === "PENDING_ACCOUNT_POST").length, errors});
  }

  get(groupId: string): CentralPaperPositionAccountingRecord | null {
    const value = this.records.get(groupId);
    return value ? clone(value) : null;
  }

  getDiagnostics(now = Date.now()) {
    const values = [...this.records.values()];
    return freeze({version: "44.0" as const, generatedAt: now, restoredAt: this.restoredAt, persistenceFilePath: this.persistenceFilePath,
      records: values.length, pending: values.filter((item) => item.state === "PENDING_ACCOUNT_POST").length,
      posted: values.filter((item) => item.state === "ACCOUNT_POSTED").length,
      totalPostedPnlInr: normalize(values.filter((item) => item.state === "ACCOUNT_POSTED").reduce((total, item) => total + item.netPnlInr, 0)),
      recent: values.sort((a, b) => (b.appliedAt ?? b.capturedAt) - (a.appliedAt ?? a.capturedAt)).slice(0, 100).map(clone),
      persistence: this.store.getDiagnostics(), safety: {journalBeforeAccountMutation: true, deterministicTransactionId: true,
        duplicatePnlProtection: true, restartReplaySupported: true, paperAccountRequired: true, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private apply(pending: CentralPaperPositionAccountingRecord, now: number): CentralPaperPositionAccountingRecord {
    if (!this.account.hasAppliedAccountingTransaction(pending.transactionId)) {
      this.account.runWithAccountingTransaction(pending.transactionId, () => this.account.recordProfit(pending.netPnlInr));
    }
    const after = this.account.getAccount();
    const posted = freeze({...clone(pending), state: "ACCOUNT_POSTED" as const, appliedAt: now, accountCapitalAfter: after.currentCapital});
    this.records.set(pending.positionGroupId, posted);
    this.persist(now);
    return clone(posted);
  }

  private validate(group: CentralPaperPositionGroup, conversion: CentralPaperAssetConversionEvidence, now: number): void {
    if (!Number.isSafeInteger(now) || now <= 0 || group.state !== "CLOSED" || group.realizedPnlEvidenceStatus !== "AVAILABLE" ||
        group.realizedPnlAsset === null || group.realizedNetPnlQuote === null || !Number.isFinite(group.realizedNetPnlQuote) ||
        !group.closeEvidenceId || group.closedAt === null || group.closedAt > now || group.accountPnlMutationPerformed !== false) {
      throw new Error("Central PAPER account booking requires exact closed, unbooked realized-PnL evidence.");
    }
    if (conversion.sourceAsset !== group.realizedPnlAsset || Math.abs(conversion.sourceQuantity - Math.abs(group.realizedNetPnlQuote)) > 1e-9 ||
        conversion.targetAsset !== "INR" || conversion.generatedAt > now || conversion.expiresAt < now ||
        !Number.isFinite(conversion.targetQuantity) || conversion.targetQuantity < 0 || conversion.orderSubmissionAllowed !== false) {
      throw new Error("Central PAPER account booking requires exact current source-asset to INR conversion evidence.");
    }
  }
  private assertSame(record: CentralPaperPositionAccountingRecord, group: CentralPaperPositionGroup, conversion: CentralPaperAssetConversionEvidence): void {
    if (record.resultId !== group.resultId || record.closeEvidenceId !== group.closeEvidenceId || record.sourcePnlAsset !== group.realizedPnlAsset ||
        record.conversionEvidenceId !== conversion.id || Math.abs(record.sourcePnl - group.realizedNetPnlQuote!) > 1e-12) {
      throw new Error("Central PAPER accounting lineage conflicts with the existing journal record.");
    }
  }
  clear(): void {
    this.store.clear();
    this.records.clear();
    this.restoredAt = null;
  }

  private restore(): void { const latest = this.store.readAll().at(-1); if (latest) for (const record of latest.records) this.records.set(record.positionGroupId, freeze(clone(record))); this.restoredAt = Date.now(); }
  private persist(now: number): void { this.store.append({version: "44.0", savedAt: now, records: [...this.records.values()].map(clone)}); }
}

function isSnapshot(value: unknown): value is PersistedAccountingSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<PersistedAccountingSnapshot>;
  return item.version === "44.0" && Number.isSafeInteger(item.savedAt) && Array.isArray(item.records) && item.records.every((record) => {
    if (typeof record !== "object" || record === null) return false;
    const candidate = record as Partial<CentralPaperPositionAccountingRecord>;
    return candidate.version === "44.0" && typeof candidate.positionGroupId === "string" &&
      typeof candidate.sourcePnlAsset === "string" && typeof candidate.conversionEvidenceId === "string" &&
      Number.isFinite(candidate.sourcePnl) && Number.isFinite(candidate.netPnlInr);
  });
}
function normalize(value: number): number { return Number(value.toFixed(12)); }
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperPositionAccountingService = new CentralPaperPositionAccountingService();
