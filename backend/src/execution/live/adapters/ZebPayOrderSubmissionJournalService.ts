import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";

export interface ZebPaySubmissionJournalRecord {
  clientOrderId: string;
  market: string;
  state: "PREPARED" | "SUBMITTED" | "AMBIGUOUS";
  orderId: string | null;
  recordedAt: number;
}

export class ZebPayOrderSubmissionJournalService {
  private readonly store: JsonlSnapshotStore<ZebPaySubmissionJournalRecord>;
  private readonly latest = new Map<string, ZebPaySubmissionJournalRecord>();

  constructor(filePath = process.env.ZEBPAY_ORDER_JOURNAL_FILE?.trim() || resolve("data", "zebpay-order-submission-journal.jsonl")) {
    this.store = new JsonlSnapshotStore({filePath, isPayload: isRecord});
    for (const record of this.store.readAll()) this.latest.set(record.clientOrderId, record);
  }

  get(clientOrderId: string): ZebPaySubmissionJournalRecord | null {
    const record = this.latest.get(clientOrderId.trim());
    return record ? structuredClone(record) : null;
  }

  record(record: ZebPaySubmissionJournalRecord): void {
    if (!record.clientOrderId.trim() || !record.market.trim() || !Number.isSafeInteger(record.recordedAt) || record.recordedAt <= 0) {
      throw new Error("Invalid ZebPay submission journal record.");
    }
    this.store.append(record);
    this.latest.set(record.clientOrderId, structuredClone(record));
  }
}

function isRecord(value: unknown): value is ZebPaySubmissionJournalRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Partial<ZebPaySubmissionJournalRecord>;
  return typeof row.clientOrderId === "string" && typeof row.market === "string" &&
    (row.state === "PREPARED" || row.state === "SUBMITTED" || row.state === "AMBIGUOUS") &&
    (row.orderId === null || typeof row.orderId === "string") &&
    typeof row.recordedAt === "number" && Number.isSafeInteger(row.recordedAt) && row.recordedAt > 0;
}

export const zebPayOrderSubmissionJournalService = new ZebPayOrderSubmissionJournalService();
