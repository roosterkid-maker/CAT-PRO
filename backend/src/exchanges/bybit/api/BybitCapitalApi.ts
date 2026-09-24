import {
  randomUUID,
} from "node:crypto";

import {
  bybitPrivateHttpClient,
  type BybitPrivateHttpClient,
} from "./BybitPrivateHttpClient";

/*
 * Bybit asset endpoints used by the capital manager: sweep deposits from the
 * Funding account into the Unified trading account the bot reads, and
 * withdraw USDT to the operator's own whitelisted account on another
 * exchange (with the Travel Rule beneficiary Bybit requires for India).
 */
export interface BybitFundBalance {
  readonly coin: string;
  readonly transferable: number;
}

export interface BybitWithdrawRequest {
  readonly coin: string;
  readonly chain: string;
  readonly address: string;
  readonly tag: string | null;
  readonly amount: number;
  readonly requestId: string;
  /** Receiving exchange's Travel Rule entity and the account holder's KYC name. */
  readonly vaspEntityId: string | null;
  readonly beneficiaryName: string;
}

export class BybitCapitalApi {
  private vasps: readonly {vaspEntityId: string; vaspName: string}[] | null = null;

  constructor(private readonly client: BybitPrivateHttpClient = bybitPrivateHttpClient) {}

  async getFundBalances(): Promise<readonly BybitFundBalance[]> {
    const result = await this.client.getSigned<{balance?: readonly {coin?: unknown; transferBalance?: unknown}[]}>(
      "/v5/asset/transfer/query-account-coins-balance",
      {accountType: "FUND"},
    );
    return (result.balance ?? [])
      .map((entry) => ({coin: String(entry.coin ?? "").toUpperCase(), transferable: Number(entry.transferBalance)}))
      .filter((entry) => entry.coin !== "" && Number.isFinite(entry.transferable) && entry.transferable > 0);
  }

  async transferFundToUnified(coin: string, amount: string): Promise<{transferId: string; status: string}> {
    const transferId = randomUUID();
    const result = await this.client.postSigned<{transferId?: unknown; status?: unknown}>(
      "/v5/asset/transfer/inter-transfer",
      {transferId, coin, amount, fromAccountType: "FUND", toAccountType: "UNIFIED"},
    );
    return {transferId: String(result.transferId ?? transferId), status: String(result.status ?? "STATUS_UNKNOWN")};
  }

  async findVaspEntityId(vaspName: string): Promise<string | null> {
    if (!this.vasps) {
      const result = await this.client.getSigned<{vasp?: readonly {vaspEntityId?: unknown; vaspName?: unknown}[]}>(
        "/v5/asset/withdraw/vasp/list",
      );
      this.vasps = (result.vasp ?? []).map((entry) => ({vaspEntityId: String(entry.vaspEntityId ?? ""), vaspName: String(entry.vaspName ?? "")}));
    }
    const wanted = vaspName.trim().toLowerCase();
    return this.vasps.find((entry) => entry.vaspName.trim().toLowerCase() === wanted)?.vaspEntityId || null;
  }

  async withdraw(request: BybitWithdrawRequest): Promise<{id: string}> {
    const beneficiary: Record<string, string> = {
      beneficiaryName: request.beneficiaryName,
      beneficiaryLegalType: "individual",
      beneficiaryWalletType: "0",
      ...(request.vaspEntityId ? {vaspEntityId: request.vaspEntityId} : {}),
    };
    const result = await this.client.postSigned<{id?: unknown}>("/v5/asset/withdraw/create", {
      coin: request.coin,
      chain: request.chain,
      address: request.address,
      ...(request.tag ? {tag: request.tag} : {}),
      amount: String(request.amount),
      timestamp: Date.now(),
      forceChain: 1,
      // The bot trades from the Unified account; Bybit moves it to Funding to withdraw.
      accountType: "UTA",
      // The fee comes out of the amount, so exactly `amount` leaves the account.
      feeType: 1,
      requestId: request.requestId,
      beneficiary,
    });
    const id = String(result.id ?? "");
    if (!id) throw new Error("Bybit withdrawal response has no id.");
    return {id};
  }
}

export const bybitCapitalApi = new BybitCapitalApi();
