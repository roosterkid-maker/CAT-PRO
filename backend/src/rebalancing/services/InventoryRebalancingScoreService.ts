import type {
  CandidateQualificationRecord,
} from "../../automation/models/CandidateQualification";

import {
  strategyOneTradeFlowReportService,
  type StrategyOneTradeFlowReport,
} from "../../strategies/services/StrategyOneTradeFlowReportService";

export type InventoryRebalancingScoreState =
  | "INELIGIBLE"
  | "NO_EVIDENCE"
  | "NEUTRAL"
  | "INVENTORY_IMPROVING"
  | "NATURAL_REBALANCE";

export interface InventoryRebalancingScore {
  readonly version: "123.0";
  readonly candidateKey: string;
  readonly state: InventoryRebalancingScoreState;
  readonly evidenceWindow: "TODAY" | "14D";
  readonly baseAsset: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly executableQuantity: number;
  readonly imbalanceBefore: number;
  readonly imbalanceAfter: number;
  readonly inventoryImprovementPercent: number;
  readonly rebalanceBonusBps: number;
  readonly reason: string;
  readonly safety: {
    readonly rankOnly: true;
    readonly actualProfitAdjusted: false;
    readonly accountingProfitAdjusted: false;
    readonly executionEligibilityGranted: false;
    readonly orderSubmitted: false;
    readonly transferSubmitted: false;
  };
}

export type InventoryRebalanceBonusResolver = (
  qualification: CandidateQualificationRecord,
) => number;

const MAXIMUM_REBALANCE_BONUS_BPS = 5;

interface InventoryFlowEvaluationContext {
  readonly evidenceWindow: "TODAY" | "14D";
  readonly flowByKey: ReadonlyMap<string, number>;
}

/**
 * Calculates a bounded rank-only bonus from settled Strategy #1 inventory
 * flow. A reverse trade is useful when it buys base inventory on a venue that
 * has historically distributed that asset and sells it on a venue that has
 * accumulated the asset. No profit, eligibility, balance or order state is
 * mutated here.
 */
export class InventoryRebalancingScoreService {
  createBonusResolver(
    report: StrategyOneTradeFlowReport =
      strategyOneTradeFlowReportService.getReport(),
  ): InventoryRebalanceBonusResolver {
    const cache = new Map<string, number>();
    const context = this.createEvaluationContext(report);

    return (qualification) => {
      const key = `${qualification.key}\u0000${qualification.evaluatedAt}`;
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const bonus = this.evaluateWithContext(
        qualification,
        context,
      ).rebalanceBonusBps;
      cache.set(key, bonus);
      return bonus;
    };
  }

  evaluate(
    qualification: CandidateQualificationRecord,
    report: StrategyOneTradeFlowReport =
      strategyOneTradeFlowReportService.getReport(),
  ): InventoryRebalancingScore {
    return this.evaluateWithContext(
      qualification,
      this.createEvaluationContext(report),
    );
  }

  private evaluateWithContext(
    qualification: CandidateQualificationRecord,
    context: InventoryFlowEvaluationContext,
  ): InventoryRebalancingScore {
    const latest = qualification.candidate.latest;
    const executableQuantity = Number.isFinite(latest.executableQuantity)
      ? Math.max(0, latest.executableQuantity)
      : 0;
    const baseAsset = this.resolveBaseAsset(
      qualification.market,
      latest.quoteAsset,
    );
    const buyExchange = qualification.buyExchange.trim().toLowerCase();
    const sellExchange = qualification.sellExchange.trim().toLowerCase();
    const financiallyEligible =
      qualification.qualified &&
      Number.isFinite(latest.netProfitPercent) &&
      latest.netProfitPercent > 0 &&
      executableQuantity > 0;
    const evidenceWindow = context.evidenceWindow;

    if (!financiallyEligible) {
      return this.result({
        qualification,
        state: "INELIGIBLE",
        evidenceWindow,
        baseAsset,
        buyExchange,
        sellExchange,
        executableQuantity,
        reason:
          "Candidate is not already qualified, positive-net and executable; inventory scoring cannot grant eligibility.",
      });
    }

    const buyBefore = context.flowByKey.get(
      this.flowKey(buyExchange, baseAsset),
    ) ?? 0;
    const sellBefore = context.flowByKey.get(
      this.flowKey(sellExchange, baseAsset),
    ) ?? 0;

    if (Math.abs(buyBefore) < 1e-12 && Math.abs(sellBefore) < 1e-12) {
      return this.result({
        qualification,
        state: "NO_EVIDENCE",
        evidenceWindow,
        baseAsset,
        buyExchange,
        sellExchange,
        executableQuantity,
        reason: "No settled inventory-flow imbalance exists for this asset and route.",
      });
    }

    const imbalanceBefore = Math.abs(buyBefore) + Math.abs(sellBefore);
    const imbalanceAfter =
      Math.abs(buyBefore + executableQuantity) +
      Math.abs(sellBefore - executableQuantity);
    const improvement = Math.max(0, imbalanceBefore - imbalanceAfter);
    const inventoryImprovementPercent = imbalanceBefore > 0
      ? improvement / imbalanceBefore * 100
      : 0;
    const naturalReverse =
      buyBefore < -1e-12 &&
      sellBefore > 1e-12 &&
      improvement > 1e-12;
    const state: InventoryRebalancingScoreState = naturalReverse
      ? "NATURAL_REBALANCE"
      : improvement > 1e-12
        ? "INVENTORY_IMPROVING"
        : "NEUTRAL";
    const rebalanceBonusBps = improvement > 1e-12
      ? Math.min(
          MAXIMUM_REBALANCE_BONUS_BPS,
          inventoryImprovementPercent *
            MAXIMUM_REBALANCE_BONUS_BPS /
            100,
        )
      : 0;

    return this.result({
      qualification,
      state,
      evidenceWindow,
      baseAsset,
      buyExchange,
      sellExchange,
      executableQuantity,
      imbalanceBefore,
      imbalanceAfter,
      inventoryImprovementPercent,
      rebalanceBonusBps,
      reason: naturalReverse
        ? "Candidate reverses settled base-asset inventory flow and receives a bounded rank-only bonus."
        : improvement > 1e-12
          ? "Candidate reduces settled base-asset flow imbalance and receives a bounded rank-only bonus."
          : "Candidate does not reduce the current settled base-asset flow imbalance.",
    });
  }

  private createEvaluationContext(
    report: StrategyOneTradeFlowReport,
  ): InventoryFlowEvaluationContext {
    const useToday = report.windows.TODAY.summary.settlements > 0;
    const window = useToday
      ? report.windows.TODAY
      : report.windows["14D"];

    return {
      evidenceWindow: useToday ? "TODAY" : "14D",
      flowByKey: new Map(
        window.inventoryFlows.map((flow) => [
          this.flowKey(flow.exchange, flow.asset),
          flow.netQuantity,
        ]),
      ),
    };
  }

  private result(input: {
    qualification: CandidateQualificationRecord;
    state: InventoryRebalancingScoreState;
    evidenceWindow: "TODAY" | "14D";
    baseAsset: string;
    buyExchange: string;
    sellExchange: string;
    executableQuantity: number;
    imbalanceBefore?: number;
    imbalanceAfter?: number;
    inventoryImprovementPercent?: number;
    rebalanceBonusBps?: number;
    reason: string;
  }): InventoryRebalancingScore {
    return Object.freeze({
      version: "123.0" as const,
      candidateKey: input.qualification.key,
      state: input.state,
      evidenceWindow: input.evidenceWindow,
      baseAsset: input.baseAsset,
      buyExchange: input.buyExchange,
      sellExchange: input.sellExchange,
      executableQuantity: this.round(input.executableQuantity),
      imbalanceBefore: this.round(input.imbalanceBefore ?? 0),
      imbalanceAfter: this.round(input.imbalanceAfter ?? 0),
      inventoryImprovementPercent:
        this.round(input.inventoryImprovementPercent ?? 0),
      rebalanceBonusBps: this.round(input.rebalanceBonusBps ?? 0),
      reason: input.reason,
      safety: Object.freeze({
        rankOnly: true as const,
        actualProfitAdjusted: false as const,
        accountingProfitAdjusted: false as const,
        executionEligibilityGranted: false as const,
        orderSubmitted: false as const,
        transferSubmitted: false as const,
      }),
    });
  }

  private resolveBaseAsset(
    market: string,
    quoteAsset: string | undefined,
  ): string {
    const normalizedMarket = market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const normalizedQuote = quoteAsset?.trim().toUpperCase();
    if (normalizedQuote && normalizedMarket.endsWith(normalizedQuote)) {
      return normalizedMarket.slice(0, -normalizedQuote.length) || "UNKNOWN";
    }

    for (const quote of ["USDT", "USDC", "BUSD", "INR", "BTC", "ETH"]) {
      if (normalizedMarket.endsWith(quote) && normalizedMarket.length > quote.length) {
        return normalizedMarket.slice(0, -quote.length);
      }
    }

    return normalizedMarket || "UNKNOWN";
  }

  private flowKey(exchange: string, asset: string): string {
    return `${exchange.trim().toLowerCase()}\u0000${asset.trim().toUpperCase()}`;
  }

  private round(value: number): number {
    return Number.isFinite(value)
      ? Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000
      : 0;
  }
}

export const inventoryRebalancingScoreService =
  new InventoryRebalancingScoreService();
