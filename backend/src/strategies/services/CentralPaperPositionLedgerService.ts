import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../core/persistence/JsonlSnapshotStore";
import type {CentralPaperSimulationJournalRecord} from "./CentralPaperSimulationJournalService";

export interface CentralPaperPositionLeg {
  readonly id: string;
  readonly sourceLegId: string;
  readonly exchange: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly market: string;
  readonly settlementAsset: string;
  readonly signedQuantity: number;
  readonly entryPrice: number;
  readonly entryFeeQuote: number;
  readonly status: "OPEN" | "CYCLE_CAPTURED" | "CLOSED";
  readonly closePrice: number | null;
  readonly closeFeeQuote: number | null;
  readonly fundingPaymentQuote: number | null;
  readonly realizedPnlQuote: number | null;
}

export interface CentralPaperPositionGroup {
  readonly version: "41.0";
  readonly id: string;
  readonly resultId: string;
  readonly planId: string;
  readonly strategyId: CentralPaperSimulationJournalRecord["strategyId"];
  readonly pattern: CentralPaperSimulationJournalRecord["simulation"]["status"];
  readonly state: "OPEN" | "CYCLE_CAPTURED" | "CLOSED";
  readonly openedAt: number;
  readonly updatedAt: number;
  readonly closedAt: number | null;
  readonly closeEvidenceId: string | null;
  readonly positions: readonly CentralPaperPositionLeg[];
  readonly entryFeeQuote: number;
  readonly realizedPnlEvidenceStatus: "NO_DATA" | "AVAILABLE";
  readonly realizedPnlAsset: string | null;
  readonly realizedNetPnlQuote: number | null;
  readonly accountPnlMutationPerformed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export interface CentralPaperPositionCloseEvidence {
  readonly id: string;
  readonly groupId: string;
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly positions: readonly {
    readonly positionId: string;
    readonly closePrice: number;
    readonly closeFeePercent: number;
    readonly feeEvidenceId: string;
    readonly feeEvidenceSource: "STATIC_CONFIG" | "PUBLIC_API" | "ACCOUNT_API";
    readonly fundingPaymentQuote: number;
    readonly fundingPaymentEvidenceId: string;
    readonly fullyFilled: true;
  }[];
  readonly exchangeOrderEvidenceUsed: false;
}

export interface CentralPaperRecoverySettlementEvidence {
  readonly version: "62.0";
  readonly id: string;
  readonly resultId: string;
  readonly generatedAt: number;
  readonly settlementAsset: string;
  readonly realizedNetPnlQuote: number;
  readonly actions: readonly {
    readonly id: string;
    readonly sourceLegId: string;
    readonly exchange: string;
    readonly product: "SPOT" | "PERPETUAL";
    readonly market: string;
    readonly residualSignedQuantity: number;
    readonly entryPrice: number;
    readonly attributedEntryFeeQuote: number;
    readonly closeSide: "BUY" | "SELL";
    readonly closePrice: number;
    readonly closeFeeQuote: number;
    readonly realizedPnlQuote: number;
    readonly depthEvidenceId: string;
    readonly feeEvidenceId: string;
  }[];
  readonly exchangeOrderEvidenceUsed: false;
}

interface PersistedPositionSnapshot {
  readonly version: "41.0";
  readonly savedAt: number;
  readonly groups: readonly CentralPaperPositionGroup[];
}

const DEFAULT_FILE = resolve(process.cwd(), "logs", "paper", "central-position-ledger.jsonl");

export class CentralPaperPositionLedgerService {
  private readonly store: JsonlSnapshotStore<PersistedPositionSnapshot>;
  private readonly groups = new Map<string, CentralPaperPositionGroup>();
  private restoredAt: number | null = null;

  constructor(private readonly persistenceFilePath = DEFAULT_FILE, private readonly maximumGroups = 2_000) {
    if (!Number.isSafeInteger(maximumGroups) || maximumGroups <= 0) throw new Error("Central PAPER position ledger capacity must be positive.");
    this.store = new JsonlSnapshotStore({filePath: persistenceFilePath, isPayload: isSnapshot});
    this.restore();
  }

  recordEntry(journal: CentralPaperSimulationJournalRecord, now = Date.now()): CentralPaperPositionGroup {
    this.validateTime(now);
    if (journal.state !== "READY_FOR_POSITION_ACCOUNTING" || journal.simulation.recoveryRequired || journal.simulation.generatedAt > now) {
      throw new Error("Only recovery-free journaled PAPER simulation can enter the position ledger.");
    }
    const existing = this.groups.get(journal.resultId);
    if (existing) return clone(existing);
    if (this.groups.size >= this.maximumGroups) throw new Error("Central PAPER position ledger capacity is exhausted.");
    const cycle = journal.simulation.status === "SIMULATED_CYCLE_COMPLETE";
    const settlementAssets = Array.from(new Set(journal.simulation.legs.map((item) => item.settlementAsset)));
    if (!cycle && (settlementAssets.length !== 1 || !settlementAssets[0])) {
      throw new Error("Central PAPER position ledger requires one unambiguous P&L settlement asset.");
    }
    const cycleSettlement = cycle ? journal.simulation.cycleSettlement : null;
    if (cycle && (!cycleSettlement || journal.simulation.pnlEvidenceStatus !== "AVAILABLE" ||
        journal.simulation.realizedPnlAsset !== cycleSettlement.asset || journal.simulation.realizedNetProfit !== cycleSettlement.realizedNetProfit)) {
      throw new Error("Cycle-captured PAPER position requires exact realized conversion settlement evidence.");
    }
    const positions = journal.simulation.legs.filter((item) => item.filledQuantity > 0).map((item) => freeze({
      id: `central-paper-position:${journal.resultId}:${item.legId}`,
      sourceLegId: item.legId,
      exchange: item.exchange,
      product: item.product,
      market: item.market,
      settlementAsset: item.settlementAsset,
      signedQuantity: item.signedPositionDelta,
      entryPrice: item.averageFillPrice ?? item.referencePrice,
      entryFeeQuote: item.feeQuote,
      status: cycle ? "CLOSED" as const : "OPEN" as const,
      closePrice: null,
      closeFeeQuote: null,
      fundingPaymentQuote: null,
      realizedPnlQuote: null,
    }));
    if (positions.length === 0) throw new Error("Central PAPER position ledger cannot record a no-fill simulation.");
    const group = freeze({version: "41.0" as const, id: `central-paper-position-group:${journal.resultId}`, resultId: journal.resultId,
      planId: journal.planId, strategyId: journal.strategyId, pattern: journal.simulation.status,
      state: cycle ? "CLOSED" as const : "OPEN" as const, openedAt: now, updatedAt: now, closedAt: cycle ? now : null,
      closeEvidenceId: cycleSettlement?.id ?? null, positions,
      entryFeeQuote: cycle ? 0 : sum(positions.map((item) => item.entryFeeQuote)),
      realizedPnlEvidenceStatus: cycle ? "AVAILABLE" as const : "NO_DATA" as const,
      realizedPnlAsset: cycleSettlement?.asset ?? settlementAssets[0]!,
      realizedNetPnlQuote: cycleSettlement?.realizedNetProfit ?? null, accountPnlMutationPerformed: false as const,
      liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.groups.set(journal.resultId, group);
    this.persist(now);
    return clone(group);
  }

  recordRecoveredSettlement(journal: CentralPaperSimulationJournalRecord, evidence: CentralPaperRecoverySettlementEvidence, now = Date.now()): CentralPaperPositionGroup {
    this.validateTime(now);
    if (journal.state !== "SHARED_RECOVERY_STAGED" || !journal.simulation.recoveryRequired || journal.resultId !== evidence.resultId ||
        evidence.generatedAt > now || evidence.exchangeOrderEvidenceUsed !== false || !/^[A-Z0-9]{2,12}$/.test(evidence.settlementAsset) ||
        !Number.isFinite(evidence.realizedNetPnlQuote) || evidence.actions.length === 0) {
      throw new Error("Recovered PAPER settlement requires exact staged journal and realized recovery evidence.");
    }
    const existing = this.groups.get(journal.resultId);
    if (existing) {
      if (existing.closeEvidenceId !== evidence.id) throw new Error("Recovered PAPER settlement collides with different position evidence.");
      return clone(existing);
    }
    const positions = evidence.actions.map((action) => freeze({id: `central-paper-recovered-position:${journal.resultId}:${action.id}`,
      sourceLegId: action.sourceLegId, exchange: action.exchange, product: action.product, market: action.market,
      settlementAsset: evidence.settlementAsset, signedQuantity: action.residualSignedQuantity, entryPrice: action.entryPrice,
      entryFeeQuote: action.attributedEntryFeeQuote, status: "CLOSED" as const, closePrice: action.closePrice,
      closeFeeQuote: action.closeFeeQuote, fundingPaymentQuote: 0, realizedPnlQuote: action.realizedPnlQuote}));
    const group = freeze({version: "41.0" as const, id: `central-paper-position-group:${journal.resultId}`, resultId: journal.resultId,
      planId: journal.planId, strategyId: journal.strategyId, pattern: journal.simulation.status, state: "CLOSED" as const,
      openedAt: journal.capturedAt, updatedAt: now, closedAt: now, closeEvidenceId: evidence.id, positions,
      entryFeeQuote: journal.simulation.totalFeeQuote, realizedPnlEvidenceStatus: "AVAILABLE" as const,
      realizedPnlAsset: evidence.settlementAsset, realizedNetPnlQuote: normalize(evidence.realizedNetPnlQuote),
      accountPnlMutationPerformed: false as const, liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.groups.set(journal.resultId, group); this.persist(now); return clone(group);
  }

  close(groupId: string, evidence: CentralPaperPositionCloseEvidence, now = Date.now()): CentralPaperPositionGroup {
    this.validateTime(now);
    const current = [...this.groups.values()].find((item) => item.id === groupId);
    if (!current) throw new Error(`Central PAPER position group not found: ${groupId}`);
    if (current.state === "CLOSED") {
      if (current.closeEvidenceId !== evidence.id) throw new Error("Closed PAPER position group cannot accept different close evidence.");
      return clone(current);
    }
    if (current.state !== "OPEN") throw new Error("Cycle-captured PAPER evidence requires a separate cycle-settlement contract.");
    if (!evidence.id.trim() || evidence.groupId !== current.id || evidence.generatedAt > now || evidence.expiresAt < now || evidence.exchangeOrderEvidenceUsed !== false) {
      throw new Error("Central PAPER close evidence lineage is stale or mismatched.");
    }
    const byPosition = new Map(evidence.positions.map((item) => [item.positionId, item]));
    if (byPosition.size !== current.positions.length || evidence.positions.length !== current.positions.length || current.positions.some((item) => !byPosition.has(item.id))) {
      throw new Error("Central PAPER close evidence must cover every open position exactly once.");
    }
    const positions = current.positions.map((position) => {
      const close = byPosition.get(position.id)!;
      if (!Number.isFinite(close.closePrice) || close.closePrice <= 0 || !Number.isFinite(close.closeFeePercent) || close.closeFeePercent < 0 || close.closeFeePercent > 100 || !close.feeEvidenceId.trim() || !Number.isFinite(close.fundingPaymentQuote) || !close.fundingPaymentEvidenceId.trim() || close.fullyFilled !== true) {
        throw new Error(`Central PAPER close evidence is invalid: ${position.id}`);
      }
      const absoluteQuantity = Math.abs(position.signedQuantity);
      const gross = position.signedQuantity > 0
        ? (close.closePrice - position.entryPrice) * absoluteQuantity
        : (position.entryPrice - close.closePrice) * absoluteQuantity;
      const closeFeeQuote = absoluteQuantity * close.closePrice * close.closeFeePercent / 100;
      const realizedPnlQuote = gross + close.fundingPaymentQuote - position.entryFeeQuote - closeFeeQuote;
      return freeze({...clone(position), status: "CLOSED" as const, closePrice: close.closePrice, closeFeeQuote,
        fundingPaymentQuote: close.fundingPaymentQuote, realizedPnlQuote: normalize(realizedPnlQuote)});
    });
    const updated = freeze({...clone(current), state: "CLOSED" as const, updatedAt: now, closedAt: now, closeEvidenceId: evidence.id.trim(),
      positions, realizedPnlEvidenceStatus: "AVAILABLE" as const,
      realizedNetPnlQuote: normalize(positions.reduce((total, item) => total + (item.realizedPnlQuote ?? 0), 0))});
    this.groups.set(current.resultId, updated);
    this.persist(now);
    return clone(updated);
  }

  getByResultId(resultId: string): CentralPaperPositionGroup | null {
    const value = this.groups.get(resultId);
    return value ? clone(value) : null;
  }

  getOpenGroups(): readonly CentralPaperPositionGroup[] {
    return [...this.groups.values()].filter((item) => item.state === "OPEN")
      .sort((first, second) => first.openedAt - second.openedAt || first.id.localeCompare(second.id)).map(clone);
  }

  getClosedGroups(): readonly CentralPaperPositionGroup[] {
    return [...this.groups.values()].filter((item) => item.state === "CLOSED")
      .sort((first, second) => (first.closedAt ?? first.updatedAt) - (second.closedAt ?? second.updatedAt) || first.id.localeCompare(second.id)).map(clone);
  }

  getDiagnostics(now = Date.now()) {
    this.validateTime(now);
    const values = [...this.groups.values()];
    return freeze({version: "41.0" as const, generatedAt: now, restoredAt: this.restoredAt, persistenceFilePath: this.persistenceFilePath,
      groups: values.length, openGroups: values.filter((item) => item.state === "OPEN").length,
      cycleCapturedGroups: values.filter((item) => item.state === "CYCLE_CAPTURED").length,
      closedGroups: values.filter((item) => item.state === "CLOSED").length,
      openPositionLegs: values.flatMap((item) => item.positions).filter((item) => item.status === "OPEN").length,
      realizedPnlEvidenceStatus: values.some((item) => item.state === "CLOSED") ? "AVAILABLE" as const : "NO_DATA" as const,
      realizedNetPnlQuote: values.some((item) => item.state === "CLOSED")
        ? normalize(values.reduce((total, item) => total + (item.realizedNetPnlQuote ?? 0), 0))
        : null,
      recent: values.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, 100).map(clone),
      persistence: this.store.getDiagnostics(), safety: {journalRequired: true, recoveryFreeRequired: true, exactResultDeduplication: true,
        restartSafe: true, closeEvidenceRequiredForPnl: true, accountPnlMutationPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  clear(): void {
    this.store.clear();
    this.groups.clear();
    this.restoredAt = null;
  }

  private restore(): void {
    const latest = this.store.readAll().at(-1);
    if (latest) for (const group of latest.groups) this.groups.set(group.resultId, freeze(clone(group)));
    this.restoredAt = Date.now();
  }
  private persist(now: number): void { this.store.append({version: "41.0", savedAt: now, groups: [...this.groups.values()].map(clone)}); }
  private validateTime(now: number): void { if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central PAPER position ledger timestamp must be positive."); }
}

function isSnapshot(value: unknown): value is PersistedPositionSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<PersistedPositionSnapshot>;
  return item.version === "41.0" && Number.isSafeInteger(item.savedAt) && Array.isArray(item.groups) && item.groups.every((group) => {
    if (typeof group !== "object" || group === null) return false;
    const candidate = group as Partial<CentralPaperPositionGroup>;
    return candidate.version === "41.0" && typeof candidate.resultId === "string" &&
      (candidate.realizedPnlAsset === null || typeof candidate.realizedPnlAsset === "string") &&
      Array.isArray(candidate.positions) && candidate.positions.every((position) =>
        typeof position === "object" && position !== null && typeof (position as Partial<CentralPaperPositionLeg>).settlementAsset === "string");
  });
}
function sum(values: readonly number[]): number { return Number(values.reduce((total, value) => total + value, 0).toFixed(12)); }
function normalize(value: number): number { return Number(value.toFixed(12)); }
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperPositionLedgerService = new CentralPaperPositionLedgerService();
