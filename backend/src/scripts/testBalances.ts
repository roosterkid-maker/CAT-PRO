import {
  coinDCXTrading,
} from "../trading/exchange/coindcx/CoinDCXTrading";

import {
  inventoryManager,
} from "../trading/inventory/InventoryManager";

import {
  inventorySyncService,
} from "../trading/inventory/InventorySyncService";

async function main(): Promise<void> {
  await inventorySyncService.syncExchange(
    "coindcx",
    coinDCXTrading,
  );

  console.table(
    inventoryManager
      .getExchangeInventory("coindcx")
      ?.balances ?? [],
  );

  console.log(
    "Free INR:",
    inventoryManager.getAvailableBalance(
      "coindcx",
      "INR",
    ),
  );

  console.log(
    "Free USDT:",
    inventoryManager.getAvailableBalance(
      "coindcx",
      "USDT",
    ),
  );

  console.log(
    "Free BTC:",
    inventoryManager.getAvailableBalance(
      "coindcx",
      "BTC",
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    "[Balance Test] Failed:",
    error,
  );

  process.exitCode = 1;
});