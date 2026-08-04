import {
  defaultTradingAccount,
  type TradingAccount,
} from "./TradingAccount";

export interface TradingAccountCheckResult {
  approved: boolean;
  reasons: string[];
}

export class TradingAccountService {
  private account: TradingAccount =
    structuredClone(defaultTradingAccount);

  getAccount(): TradingAccount {
    return structuredClone(
      this.account,
    );
  }

  updateAccount(
    account: TradingAccount,
  ): void {
    this.account =
      structuredClone(account);
  }

  evaluateTrade(
    requestedCapital: number,
  ): TradingAccountCheckResult {
    const reasons: string[] = [];

    if (
      !Number.isFinite(requestedCapital) ||
      requestedCapital <= 0
    ) {
      reasons.push(
        "Requested capital must be a positive number.",
      );
    }

    if (!this.account.enabled) {
      reasons.push(
        "Trading account is disabled.",
      );
    }

    if (this.account.emergencyStop) {
      reasons.push(
        "Emergency stop is active.",
      );
    }

    if (
      requestedCapital >
      this.account.availableCapital
    ) {
      reasons.push(
        "Insufficient available capital.",
      );
    }

    if (
      requestedCapital >
      this.account.limits.maximumCapitalPerTrade
    ) {
      reasons.push(
        "Maximum capital per trade exceeded.",
      );
    }

    if (
      this.account.todayLoss >=
      this.account.limits.maximumDailyLoss
    ) {
      reasons.push(
        "Daily loss limit reached.",
      );
    }

    if (
      this.account.openTrades >=
      this.account.limits.maximumOpenTrades
    ) {
      reasons.push(
        "Maximum open trades reached.",
      );
    }

    if (
      this.account.tradesToday >=
      this.account.limits.maximumDailyTrades
    ) {
      reasons.push(
        "Maximum daily trades reached.",
      );
    }

    return {
      approved:
        reasons.length === 0,

      reasons,
    };
  }

  reserveCapital(
    amount: number,
  ): boolean {
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount >
        this.account.availableCapital
    ) {
      return false;
    }

    this.account.availableCapital -=
      amount;

    this.account.openTrades += 1;

    this.account.tradesToday += 1;

    return true;
  }

  releaseCapital(
    amount: number,
  ): void {
    if (
      Number.isFinite(amount) &&
      amount > 0
    ) {
      this.account.availableCapital =
        Math.min(
          this.account.currentCapital,
          this.account.availableCapital +
            amount,
        );
    }

    this.account.openTrades =
      Math.max(
        0,
        this.account.openTrades - 1,
      );
  }

  recordProfit(
    profit: number,
  ): void {
    if (!Number.isFinite(profit)) {
      throw new Error(
        "Profit must be a finite number.",
      );
    }

    if (profit >= 0) {
      this.account.todayProfit +=
        profit;
    } else {
      this.account.todayLoss +=
        Math.abs(profit);
    }

    this.account.currentCapital +=
      profit;

    this.account.availableCapital +=
      profit;

    this.account.currentCapital =
      Math.max(
        0,
        this.account.currentCapital,
      );

    this.account.availableCapital =
      Math.max(
        0,
        Math.min(
          this.account.currentCapital,
          this.account.availableCapital,
        ),
      );
  }

  enableEmergencyStop(): void {
    this.account.emergencyStop =
      true;
  }

  disableEmergencyStop(): void {
    this.account.emergencyStop =
      false;
  }

  resetDailyMetrics(): void {
    this.account.todayProfit = 0;
    this.account.todayLoss = 0;
    this.account.tradesToday = 0;
  }

  resetAccount(): void {
    this.account =
      structuredClone(
        defaultTradingAccount,
      );
  }
}

export const tradingAccountService =
  new TradingAccountService();