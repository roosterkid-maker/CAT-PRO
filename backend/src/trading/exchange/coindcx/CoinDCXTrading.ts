import axios from "axios";

import type {
  Balance,
  IExchangeTrading,
  OrderResult,
  PlaceOrderRequest,
} from "../IExchangeTrading";

import { createCoinDCXHeaders } from "./auth";

interface CoinDCXBalanceResponse {
  currency: string;
  balance: string | number;
  locked_balance: string | number;
}

export class CoinDCXTrading
  implements IExchangeTrading
{
  async getBalances(): Promise<Balance[]> {
    const body = JSON.stringify({
      timestamp: Date.now(),
    });

    const response = await axios.post<
      CoinDCXBalanceResponse[]
    >(
      "https://api.coindcx.com/exchange/v1/users/balances",
      body,
      {
        headers:
          createCoinDCXHeaders(body),

        timeout: 10_000,
      },
    );

    return response.data.map(
      (balance) => ({
        asset:
          balance.currency.toUpperCase(),

        available:
          Number(balance.balance),

        locked:
          Number(
            balance.locked_balance,
          ),
      }),
    );
  }

  async placeOrder(
    _request: PlaceOrderRequest,
  ): Promise<OrderResult> {
    throw new Error(
      "CoinDCX order placement is not implemented yet.",
    );
  }

  async cancelOrder(
    _orderId: string,
  ): Promise<boolean> {
    throw new Error(
      "CoinDCX order cancellation is not implemented yet.",
    );
  }

  async getOrder(
    _orderId: string,
  ): Promise<OrderResult> {
    throw new Error(
      "CoinDCX order lookup is not implemented yet.",
    );
  }

  async getOpenOrders(): Promise<
    OrderResult[]
  > {
    throw new Error(
      "CoinDCX open orders retrieval is not implemented yet.",
    );
  }
}

export const coinDCXTrading =
  new CoinDCXTrading();