export interface AssetBalance {
  asset: string;

  available: number;

  reserved: number;
}

export interface ExchangeInventory {
  exchange: string;

  balances: AssetBalance[];
}

export class InventoryManager {
  private readonly inventory =
    new Map<string, ExchangeInventory>();

  updateExchangeInventory(
    exchange: string,
    balances: AssetBalance[],
  ): void {
    this.inventory.set(
      exchange.toLowerCase(),
      {
        exchange,
        balances,
      },
    );
  }

  getExchangeInventory(
    exchange: string,
  ): ExchangeInventory | undefined {
    return this.inventory.get(
      exchange.toLowerCase(),
    );
  }

  getAvailableBalance(
    exchange: string,
    asset: string,
  ): number {
    const inventory =
      this.getExchangeInventory(
        exchange,
      );

    if (!inventory) {
      return 0;
    }

    const balance =
      inventory.balances.find(
        (item) =>
          item.asset.toUpperCase() ===
          asset.toUpperCase(),
      );

    if (!balance) {
      return 0;
    }

    return Math.max(
      0,
      balance.available -
        balance.reserved,
    );
  }

  reserve(
    exchange: string,
    asset: string,
    amount: number,
  ): boolean {
    const inventory =
      this.getExchangeInventory(
        exchange,
      );

    if (!inventory) {
      return false;
    }

    const balance =
      inventory.balances.find(
        (item) =>
          item.asset.toUpperCase() ===
          asset.toUpperCase(),
      );

    if (!balance) {
      return false;
    }

    const freeBalance =
      balance.available -
      balance.reserved;

    if (freeBalance < amount) {
      return false;
    }

    balance.reserved += amount;

    return true;
  }

  release(
    exchange: string,
    asset: string,
    amount: number,
  ): void {
    const inventory =
      this.getExchangeInventory(
        exchange,
      );

    if (!inventory) {
      return;
    }

    const balance =
      inventory.balances.find(
        (item) =>
          item.asset.toUpperCase() ===
          asset.toUpperCase(),
      );

    if (!balance) {
      return;
    }

    balance.reserved = Math.max(
      0,
      balance.reserved - amount,
    );
  }

  clear(): void {
    this.inventory.clear();
  }
}

export const inventoryManager =
  new InventoryManager();