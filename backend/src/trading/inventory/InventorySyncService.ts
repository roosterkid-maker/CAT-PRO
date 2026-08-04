import type {
  IExchangeTrading,
} from "../exchange/IExchangeTrading";

import {
  inventoryManager,
} from "./InventoryManager";

export class InventorySyncService {
  async syncExchange(
    exchange: string,
    tradingAdapter: IExchangeTrading,
  ): Promise<void> {
    const balances =
      await tradingAdapter.getBalances();

    inventoryManager.updateExchangeInventory(
      exchange,
      balances.map((balance) => ({
        asset: balance.asset,
        available: balance.available,
        reserved: balance.locked,
      })),
    );

    console.log(
      `[Inventory] ${exchange} synced: ${balances.length} assets`,
    );
  }
}

export const inventorySyncService =
  new InventorySyncService();