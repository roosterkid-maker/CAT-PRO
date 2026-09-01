/*
 * Binance capital-movement client for the Automated Capital Rebalancer.
 *
 * Two distinct capabilities live here, deliberately kept in one file so a
 * reviewer sees both together:
 *
 *  - Universal Transfer (same Binance account, e.g. Spot -> USDS-M Futures):
 *    needs only the "Permits Universal Transfer" key permission. No funds
 *    ever leave the account; this is the lower-risk half of rebalancing.
 *
 *  - Withdrawal (this account -> a different exchange's deposit address):
 *    needs the "Enable Withdrawals" key permission, which every other key
 *    in this codebase deliberately keeps OFF (see
 *    StrategyOneApiPermissionBoundaryService). Only a key provisioned
 *    specifically for the rebalancer, restricted to a whitelisted
 *    destination address on Binance's own side, should ever carry it.
 *
 * Both are signed SAPI endpoints - same request/response shape discipline
 * as BinanceOrderApi (never trust raw response fields; validate before use).
 */

import type {
  BinanceCredentials,
} from "./BinanceCredentialsProvider";

import {
  binanceHttpClient,
} from "./BinanceHttpClient";

import type {
  BinanceRequestParameters,
} from "./BinanceSigner";

import {
  BINANCE,
} from "../constants";

export type BinanceUniversalTransferType =
  | "MAIN_UMFUTURE"
  | "UMFUTURE_MAIN"
  | "MAIN_FUNDING"
  | "FUNDING_MAIN";

export interface BinanceUniversalTransferRequest {
  type: BinanceUniversalTransferType;
  asset: string;
  amount: number;
}

export interface BinanceUniversalTransferResult {
  transactionId: string;
}

export interface BinanceWithdrawRequest {
  coin: string;
  address: string;
  amount: number;
  network?: string;
  addressTag?: string;
  withdrawOrderId?: string;
}

export interface BinanceWithdrawResult {
  withdrawId: string;
}

export type BinanceWithdrawStatus =
  | "EMAIL_SENT"
  | "CANCELLED"
  | "AWAITING_APPROVAL"
  | "REJECTED"
  | "PROCESSING"
  | "FAILURE"
  | "COMPLETED"
  | "UNKNOWN";

const WITHDRAW_STATUS_BY_CODE: Record<number, BinanceWithdrawStatus> = {
  0: "EMAIL_SENT",
  1: "CANCELLED",
  2: "AWAITING_APPROVAL",
  3: "REJECTED",
  4: "PROCESSING",
  5: "FAILURE",
  6: "COMPLETED",
};

export interface BinanceWithdrawHistoryRecord {
  withdrawId: string;
  coin: string;
  amount: number;
  transactionFee: number;
  address: string;
  network: string | null;
  status: BinanceWithdrawStatus;
  transactionHash: string | null;
  withdrawOrderId: string | null;
  applyTime: string | null;
  completeTime: string | null;
}

export interface BinanceWithdrawAddressListEntry {
  address: string;
  addressTag: string;
  coin: string;
  network: string;
  whitelisted: boolean;
}

export interface BinanceNetworkConfig {
  network: string;
  name: string;
  withdrawEnable: boolean;
  withdrawFee: number;
  withdrawMin: number;
  withdrawMax: number;
  withdrawIntegerMultiple: number;
  isDefault: boolean;
  addressRegex: string | null;
  memoRegex: string | null;
  withdrawTag: boolean;
}

export interface BinanceCoinConfig {
  coin: string;
  withdrawAllEnable: boolean;
  networks: readonly BinanceNetworkConfig[];
}

export interface BinanceDepositAddress {
  address: string;
  tag: string | null;
  coin: string;
}

interface BinanceUniversalTransferResponse {
  tranId?: unknown;
}

interface BinanceWithdrawResponse {
  id?: unknown;
}

interface BinanceWithdrawHistoryResponse {
  id?: unknown;
  coin?: unknown;
  amount?: unknown;
  transactionFee?: unknown;
  address?: unknown;
  network?: unknown;
  status?: unknown;
  txId?: unknown;
  withdrawOrderId?: unknown;
  applyTime?: unknown;
  completeTime?: unknown;
}

interface BinanceWithdrawAddressListResponse {
  address?: unknown;
  addressTag?: unknown;
  coin?: unknown;
  network?: unknown;
  whiteStatus?: unknown;
}

interface BinanceNetworkConfigResponse {
  network?: unknown;
  name?: unknown;
  withdrawEnable?: unknown;
  withdrawFee?: unknown;
  withdrawMin?: unknown;
  withdrawMax?: unknown;
  withdrawIntegerMultiple?: unknown;
  isDefault?: unknown;
  addressRegex?: unknown;
  memoRegex?: unknown;
  withdrawTag?: unknown;
}

interface BinanceCoinConfigResponse {
  coin?: unknown;
  withdrawAllEnable?: unknown;
  networkList?: unknown;
}

interface BinanceDepositAddressResponse {
  address?: unknown;
  tag?: unknown;
  coin?: unknown;
}

export interface BinanceSignedCapitalClient {
  synchronizeServerTime(): Promise<number>;
  postSigned<T>(path: string, parameters?: BinanceRequestParameters, credentials?: BinanceCredentials): Promise<T>;
  getSigned<T>(path: string, parameters?: BinanceRequestParameters, credentials?: BinanceCredentials): Promise<T>;
}

export class BinanceCapitalTransferApi {
  constructor(
    private readonly client: BinanceSignedCapitalClient = binanceHttpClient,
  ) {}

  /** Same-account move (e.g. Spot -> USDS-M Futures). No withdrawal permission required. */
  async universalTransfer(
    request: BinanceUniversalTransferRequest,
    credentials?: BinanceCredentials,
  ): Promise<BinanceUniversalTransferResult> {
    this.requireAsset(request.asset);
    this.requirePositiveAmount(request.amount);

    await this.client.synchronizeServerTime();

    const response = await this.client.postSigned<BinanceUniversalTransferResponse>(
      BINANCE.REST.UNIVERSAL_TRANSFER,
      {
        type: request.type,
        asset: request.asset.trim().toUpperCase(),
        amount: formatAmount(request.amount),
      },
      credentials,
    );

    const transactionId = this.toIdentifierString(response.tranId);
    if (!transactionId) {
      throw new Error(`Invalid Binance universal transfer response: ${this.safeStringify(response)}`);
    }

    return {transactionId};
  }

  /**
   * Sends funds off this account to an external address. Callers MUST have
   * already validated the destination against a known-good whitelist -
   * this method does not do that itself, it only talks to Binance.
   */
  async withdraw(
    request: BinanceWithdrawRequest,
    credentials?: BinanceCredentials,
  ): Promise<BinanceWithdrawResult> {
    const coin = this.requireAsset(request.coin);
    const address = this.requireAddress(request.address);
    this.requirePositiveAmount(request.amount);

    await this.client.synchronizeServerTime();

    const parameters: Record<string, string | number> = {
      coin,
      address,
      amount: formatAmount(request.amount),
    };
    if (request.network) parameters.network = request.network.trim().toUpperCase();
    if (request.addressTag) parameters.addressTag = request.addressTag.trim();
    if (request.withdrawOrderId) parameters.withdrawOrderId = request.withdrawOrderId.trim();

    const response = await this.client.postSigned<BinanceWithdrawResponse>(
      BINANCE.REST.WITHDRAW,
      parameters,
      credentials,
    );

    const withdrawId = this.toIdentifierString(response.id);
    if (!withdrawId) {
      throw new Error(`Invalid Binance withdraw response: ${this.safeStringify(response)}`);
    }

    return {withdrawId};
  }

  async getWithdrawHistory(
    coin: string,
    credentials?: BinanceCredentials,
  ): Promise<readonly BinanceWithdrawHistoryRecord[]> {
    await this.client.synchronizeServerTime();

    const response = await this.client.getSigned<BinanceWithdrawHistoryResponse[]>(
      BINANCE.REST.WITHDRAW_HISTORY,
      {coin: this.requireAsset(coin)},
      credentials,
    );

    if (!Array.isArray(response)) {
      throw new Error("Invalid Binance withdraw-history response.");
    }

    return response.map((record) => this.normalizeWithdrawHistoryRecord(record));
  }

  /** Binance's own withdrawal-address whitelist - the real enforcement point if the account has "withdraw only to whitelisted addresses" enabled. */
  async getWithdrawAddressList(
    credentials?: BinanceCredentials,
  ): Promise<readonly BinanceWithdrawAddressListEntry[]> {
    await this.client.synchronizeServerTime();

    const response = await this.client.getSigned<BinanceWithdrawAddressListResponse[]>(
      BINANCE.REST.WITHDRAW_ADDRESS_LIST,
      {},
      credentials,
    );

    if (!Array.isArray(response)) {
      throw new Error("Invalid Binance withdraw-address-list response.");
    }

    return response
      .map((entry): BinanceWithdrawAddressListEntry | null => {
        const address = this.toOptionalString(entry.address);
        const coin = this.toOptionalString(entry.coin)?.toUpperCase();
        const network = this.toOptionalString(entry.network)?.toUpperCase();
        if (!address || !coin || !network) return null;
        return {
          address,
          addressTag: this.toOptionalString(entry.addressTag) ?? "",
          coin,
          network,
          whitelisted: entry.whiteStatus === true,
        };
      })
      .filter((entry): entry is BinanceWithdrawAddressListEntry => entry !== null);
  }

  async getCoinConfig(
    coin: string,
    credentials?: BinanceCredentials,
  ): Promise<BinanceCoinConfig | null> {
    await this.client.synchronizeServerTime();

    const response = await this.client.getSigned<BinanceCoinConfigResponse[]>(
      BINANCE.REST.ASSET_CONFIG,
      {},
      credentials,
    );

    if (!Array.isArray(response)) {
      throw new Error("Invalid Binance asset-config response.");
    }

    const normalizedCoin = this.requireAsset(coin);
    const match = response.find((entry) => this.toOptionalString(entry.coin)?.toUpperCase() === normalizedCoin);
    return match ? this.normalizeCoinConfig(match) : null;
  }

  async getDepositAddress(
    coin: string,
    network: string,
    credentials?: BinanceCredentials,
  ): Promise<BinanceDepositAddress> {
    await this.client.synchronizeServerTime();

    const response = await this.client.getSigned<BinanceDepositAddressResponse>(
      BINANCE.REST.DEPOSIT_ADDRESS,
      {
        coin: this.requireAsset(coin),
        network: network.trim().toUpperCase(),
      },
      credentials,
    );

    const address = this.toOptionalString(response.address);
    const responseCoin = this.toOptionalString(response.coin);
    if (!address || !responseCoin) {
      throw new Error(`Invalid Binance deposit-address response: ${this.safeStringify(response)}`);
    }

    return {
      address,
      tag: this.toOptionalString(response.tag),
      coin: responseCoin.toUpperCase(),
    };
  }

  private normalizeWithdrawHistoryRecord(record: BinanceWithdrawHistoryResponse): BinanceWithdrawHistoryRecord {
    const withdrawId = this.toIdentifierString(record.id);
    const coin = this.toOptionalString(record.coin)?.toUpperCase();
    if (!withdrawId || !coin) {
      throw new Error(`Invalid Binance withdraw-history record: ${this.safeStringify(record)}`);
    }

    const statusCode = Number(record.status);
    return {
      withdrawId,
      coin,
      amount: this.toNonNegativeNumber(record.amount),
      transactionFee: this.toNonNegativeNumber(record.transactionFee),
      address: this.toOptionalString(record.address) ?? "",
      network: this.toOptionalString(record.network),
      status: WITHDRAW_STATUS_BY_CODE[statusCode] ?? "UNKNOWN",
      transactionHash: this.toOptionalString(record.txId),
      withdrawOrderId: this.toOptionalString(record.withdrawOrderId),
      applyTime: this.toOptionalString(record.applyTime),
      completeTime: this.toOptionalString(record.completeTime),
    };
  }

  private normalizeCoinConfig(response: BinanceCoinConfigResponse): BinanceCoinConfig {
    const coin = this.toOptionalString(response.coin)?.toUpperCase();
    if (!coin) {
      throw new Error(`Invalid Binance coin-config response: ${this.safeStringify(response)}`);
    }

    const rawNetworks = Array.isArray(response.networkList) ? response.networkList : [];
    const networks = rawNetworks
      .map((entry): BinanceNetworkConfig | null => {
        const record = entry as BinanceNetworkConfigResponse;
        const network = this.toOptionalString(record.network)?.toUpperCase();
        if (!network) return null;
        return {
          network,
          name: this.toOptionalString(record.name) ?? network,
          withdrawEnable: record.withdrawEnable === true,
          withdrawFee: this.toNonNegativeNumber(record.withdrawFee),
          withdrawMin: this.toNonNegativeNumber(record.withdrawMin),
          withdrawMax: this.toNonNegativeNumber(record.withdrawMax),
          withdrawIntegerMultiple: this.toNonNegativeNumber(record.withdrawIntegerMultiple),
          isDefault: record.isDefault === true,
          addressRegex: this.toOptionalString(record.addressRegex),
          memoRegex: this.toOptionalString(record.memoRegex),
          withdrawTag: record.withdrawTag === true,
        };
      })
      .filter((network): network is BinanceNetworkConfig => network !== null);

    return {
      coin,
      withdrawAllEnable: response.withdrawAllEnable === true,
      networks,
    };
  }

  private requireAsset(asset: string): string {
    const normalized = asset.trim().toUpperCase();
    if (!normalized) throw new Error("Binance asset/coin is required.");
    return normalized;
  }

  private requireAddress(address: string): string {
    const normalized = address.trim();
    if (!normalized) throw new Error("Binance withdrawal address is required.");
    return normalized;
  }

  private requirePositiveAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Binance transfer/withdraw amount must be a positive finite number.");
    }
  }

  private toIdentifierString(value: unknown): string | null {
    if (typeof value === "string") return value.trim() || null;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return null;
  }

  private toOptionalString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private toNonNegativeNumber(value: unknown): number {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Binance transfer/withdraw amount must be positive and finite.");
  }
  return value
    .toFixed(12)
    .replace(/\.0+$/u, "")
    .replace(/(\.\d*?)0+$/u, "$1");
}

export const binanceCapitalTransferApi = new BinanceCapitalTransferApi();
