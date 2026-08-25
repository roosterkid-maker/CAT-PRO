import type {
  StrategyOneCanonicalPreflightReport,
} from "./StrategyOneCanonicalLivePreflightService";

import type {
  StrategyOneDynamicCandidate,
  StrategyOneDynamicDecisionReport,
} from "./StrategyOneDynamicExecutionDecisionManager";

export type StrategyOneExecutionRejectionStage =
  | "CURRENT_EVIDENCE"
  | "DYNAMIC_DECISION"
  | "CANONICAL_PREFLIGHT";

export interface StrategyOneExecutionRejectionDetail {
  readonly rejectedAt: number;
  readonly stage: StrategyOneExecutionRejectionStage;
  readonly rejectionCode: string;
  readonly reason: string;
  readonly market: string | null;
  readonly route: string | null;
  readonly buyExchange: string | null;
  readonly sellExchange: string | null;
  readonly proposedCapital: number | null;
  readonly proposedQuantity: number | null;
  readonly grossSpreadPercent: number | null;
  readonly fees: number | null;
  readonly slippageReserve: number | null;
  readonly safetyBuffer: number | null;
  readonly expectedNetProfit: number | null;
  readonly tdsImpact: number | null;
  readonly buyBookAgeMs: number | null;
  readonly sellBookAgeMs: number | null;
  readonly timestampSkewMs: number | null;
  readonly availableBuyDepth: number | null;
  readonly availableSellDepth: number | null;
  readonly requiredBuyBalance: number | null;
  readonly availableBuyBalance: number | null;
  readonly requiredSellInventory: number | null;
  readonly availableSellInventory: number | null;
}

export interface StrategyOneExecutionFunnelMeterSnapshot {
  readonly scope: "PROCESS_LIFETIME";
  readonly startedAt: number;
  readonly dynamicExecuteRecommendations: number;
  readonly dynamicWaitRecommendations: number;
  readonly dynamicOtherRecommendations: number;
  readonly preflightAttempts: number;
  readonly preflightPassed: number;
  readonly preflightRejected: number;
  readonly rejectionCounts: Readonly<Record<string, number>>;
  readonly recentDetailedRejections: readonly StrategyOneExecutionRejectionDetail[];
}

const MAXIMUM_RECENT_REJECTIONS =
  50;

export class StrategyOneExecutionFunnelMeter {
  private readonly startedAt =
    Date.now();

  private dynamicExecuteRecommendations =
    0;

  private dynamicWaitRecommendations =
    0;

  private dynamicOtherRecommendations =
    0;

  private preflightAttempts =
    0;

  private preflightPassed =
    0;

  private preflightRejected =
    0;

  private readonly recentDetailedRejections:
    StrategyOneExecutionRejectionDetail[] = [];

  private readonly rejectionCounts =
    new Map<string, number>();

  recordDynamic(
    candidate: StrategyOneDynamicCandidate,
    report: StrategyOneDynamicDecisionReport,
  ): void {
    if (
      report.decision === "EXECUTE_NOW" ||
      report.decision === "REDUCE_QUANTITY"
    ) {
      this.dynamicExecuteRecommendations +=
        1;
    } else if (
      report.decision === "WAIT"
    ) {
      this.dynamicWaitRecommendations +=
        1;
    } else {
      this.dynamicOtherRecommendations +=
        1;
    }

    for (const code of report.blockers) {
      this.pushRejection(
        detail(
          "DYNAMIC_DECISION",
          code,
          candidate,
          report,
        ),
      );
    }
  }

  recordCurrentEvidenceRejection(
    opportunityId: string | null,
    blockers: readonly string[],
    rejectedAt: number,
  ): void {
    for (const blocker of blockers) {
      this.pushRejection({
        rejectedAt,
        stage:
          "CURRENT_EVIDENCE",
        rejectionCode:
          stableCode(
            blocker,
            opportunityId === null
              ? "NO_CURRENT_OPPORTUNITY"
              : "CURRENT_EVIDENCE_UNAVAILABLE",
          ),
        reason:
          blocker,
        market:
          null,
        route:
          null,
        buyExchange:
          null,
        sellExchange:
          null,
        proposedCapital:
          null,
        proposedQuantity:
          null,
        grossSpreadPercent:
          null,
        fees:
          null,
        slippageReserve:
          null,
        safetyBuffer:
          null,
        expectedNetProfit:
          null,
        tdsImpact:
          null,
        buyBookAgeMs:
          null,
        sellBookAgeMs:
          null,
        timestampSkewMs:
          null,
        availableBuyDepth:
          null,
        availableSellDepth:
          null,
        requiredBuyBalance:
          null,
        availableBuyBalance:
          null,
        requiredSellInventory:
          null,
        availableSellInventory:
          null,
      });
    }
  }

  recordPreflight(
    candidate: StrategyOneDynamicCandidate,
    report: StrategyOneCanonicalPreflightReport,
  ): void {
    this.preflightAttempts +=
      1;

    if (report.approvedForOneTimeArm) {
      this.preflightPassed +=
        1;
      return;
    }

    this.preflightRejected +=
      1;

    for (const code of report.blockers) {
      this.pushRejection(
        detail(
          "CANONICAL_PREFLIGHT",
          code,
          candidate,
          report.dynamicRecommendation,
        ),
      );
    }
  }

  getSnapshot():
    StrategyOneExecutionFunnelMeterSnapshot {
    return Object.freeze({
      scope:
        "PROCESS_LIFETIME" as const,
      startedAt:
        this.startedAt,
      dynamicExecuteRecommendations:
        this.dynamicExecuteRecommendations,
      dynamicWaitRecommendations:
        this.dynamicWaitRecommendations,
      dynamicOtherRecommendations:
        this.dynamicOtherRecommendations,
      preflightAttempts:
        this.preflightAttempts,
      preflightPassed:
        this.preflightPassed,
      preflightRejected:
        this.preflightRejected,
      rejectionCounts:
        Object.freeze(
          Object.fromEntries(
            [...this.rejectionCounts.entries()]
              .sort(
                ([first], [second]) =>
                  first.localeCompare(
                    second,
                  ),
              ),
          ),
        ),
      recentDetailedRejections:
        this.recentDetailedRejections.map(
          (item) =>
            Object.freeze({
              ...item,
            }),
        ),
    });
  }

  private pushRejection(
    value: StrategyOneExecutionRejectionDetail,
  ): void {
    this.rejectionCounts.set(
      value.rejectionCode,
      (
        this.rejectionCounts.get(
          value.rejectionCode,
        ) ??
        0
      ) +
        1,
    );

    this.recentDetailedRejections.unshift(
      Object.freeze({
        ...value,
      }),
    );

    if (
      this.recentDetailedRejections.length >
      MAXIMUM_RECENT_REJECTIONS
    ) {
      this.recentDetailedRejections.length =
        MAXIMUM_RECENT_REJECTIONS;
    }
  }
}

function detail(
  stage: StrategyOneExecutionRejectionStage,
  code: string,
  candidate: StrategyOneDynamicCandidate,
  report: StrategyOneDynamicDecisionReport,
): StrategyOneExecutionRejectionDetail {
  const economics =
    report.economics;
  const quantity =
    report.recommendedQuantity ??
    candidate.requestedQuantity;
  const buyBookAgeMs =
    candidate.now -
    candidate.buyBookTimestamp;
  const sellBookAgeMs =
    candidate.now -
    candidate.sellBookTimestamp;
  const requiredBuyBalance =
    economics
      ? economics.buyCost +
        economics.buyFee +
        economics.buySlippageReserve +
        economics.safetyBuffer
      : candidate.buyVwap *
        quantity;

  return Object.freeze({
    rejectedAt:
      candidate.now,
    stage,
    rejectionCode:
      stableCode(
        code,
        "UNCLASSIFIED_REJECTION",
      ),
    reason:
      humanReason(
        code,
      ),
    market:
      candidate.market,
    route:
      report.routeKey,
    buyExchange:
      candidate.buyExchange,
    sellExchange:
      candidate.sellExchange,
    proposedCapital:
      candidate.requestedCapitalInr,
    proposedQuantity:
      quantity,
    grossSpreadPercent:
      candidate.buyVwap > 0
        ? (
            (
              candidate.sellVwap -
              candidate.buyVwap
            ) /
            candidate.buyVwap
          ) * 100
        : null,
    fees:
      economics?.tradingFees ??
      null,
    slippageReserve:
      economics?.slippageCost ??
      null,
    safetyBuffer:
      economics?.safetyBuffer ??
      null,
    expectedNetProfit:
      economics?.economicNetProfit ??
      null,
    tdsImpact:
      economics?.tdsWithheld ??
      null,
    buyBookAgeMs:
      Number.isFinite(
        buyBookAgeMs,
      )
        ? buyBookAgeMs
        : null,
    sellBookAgeMs:
      Number.isFinite(
        sellBookAgeMs,
      )
        ? sellBookAgeMs
        : null,
    timestampSkewMs:
      Math.abs(
        candidate.buyBookTimestamp -
        candidate.sellBookTimestamp,
      ),
    availableBuyDepth:
      candidate.buyDepthQuantity,
    availableSellDepth:
      candidate.sellDepthQuantity,
    requiredBuyBalance,
    availableBuyBalance:
      candidate.buyAvailableQuoteBalance,
    requiredSellInventory:
      quantity,
    availableSellInventory:
      candidate.sellAvailableBaseInventory,
  });
}

function stableCode(
  value: string,
  fallback: string,
): string {
  const normalized =
    value
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9]+/gu,
        "_",
      )
      .replace(
        /^_+|_+$/gu,
        "",
      )
      .slice(
        0,
        96,
      );

  return normalized ||
    fallback;
}

function humanReason(
  code: string,
): string {
  const trimmed =
    code.trim();

  if (
    trimmed.includes(
      " ",
    )
  ) {
    return trimmed;
  }

  return trimmed
    .toLowerCase()
    .replace(
      /_/gu,
      " ",
    )
    .replace(
      /^./u,
      (value) =>
        value.toUpperCase(),
    );
}

export const strategyOneExecutionFunnelMeter =
  new StrategyOneExecutionFunnelMeter();
