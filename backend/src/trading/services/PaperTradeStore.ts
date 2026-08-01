import type {
  PaperTrade,
  PaperTradeStatus,
} from "../models/PaperTrade";

export class PaperTradeStore {
  private readonly trades = new Map<string, PaperTrade>();

  create(trade: PaperTrade): PaperTrade {
    if (this.trades.has(trade.id)) {
      throw new Error(
        `Paper trade already exists: ${trade.id}`,
      );
    }

    this.trades.set(trade.id, trade);

    return trade;
  }

  getById(id: string): PaperTrade | undefined {
    return this.trades.get(id);
  }

  getAll(): PaperTrade[] {
    return Array.from(this.trades.values()).sort(
      (first, second) =>
        second.openedAt - first.openedAt,
    );
  }

  getByStatus(
    status: PaperTradeStatus,
  ): PaperTrade[] {
    return this.getAll().filter(
      (trade) => trade.status === status,
    );
  }

  update(
    id: string,
    changes: Partial<PaperTrade>,
  ): PaperTrade | undefined {
    const existingTrade = this.trades.get(id);

    if (!existingTrade) {
      return undefined;
    }

    const updatedTrade: PaperTrade = {
      ...existingTrade,
      ...changes,
      id: existingTrade.id,
    };

    this.trades.set(id, updatedTrade);

    return updatedTrade;
  }

countOpenTrades(): number {
  return this.countActiveTrades();
}
  countActiveTrades(): number {
  return this.getAll().filter((trade) =>
    trade.status === "validated" ||
    trade.status === "open" ||
    trade.status === "monitoring"
  ).length;
}

  clear(): void {
    this.trades.clear();
  }
}

export const paperTradeStore =
  new PaperTradeStore();