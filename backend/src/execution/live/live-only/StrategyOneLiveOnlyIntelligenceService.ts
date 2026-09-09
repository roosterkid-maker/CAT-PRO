import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  isStrategyOneTinyLiveDynamicRoute,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

import {
  STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS,
} from "../../../arbitrage/execution/StrategyOneLiveTimingPolicy";

import type {
  LiveOnlyRuntimePolicy,
} from "../../../config/LiveOnlyRuntimePolicy";

import type {
  ExchangeFoundationCapability,
} from "../../../exchanges/core/ExchangeFleetRegistry";

import type {
  StrategyOneLiveOnlyPreflightReport,
} from "./StrategyOneLiveOnlyPreflightService";

import type {
  OpportunityCapitalStudyDecision,
  OpportunityCapitalStudyReport,
} from "../../../rebalancing/services/OpportunityCapitalStudyService";

export type LiveOnlyIntelligenceCheckState =
  | "PASS"
  | "BLOCKED"
  | "NOT_EVALUATED";

export interface LiveOnlyIntelligencePolicyCheck {
  readonly key: string;
  readonly label: string;
  readonly state:
    LiveOnlyIntelligenceCheckState;
  readonly current: string;
  readonly required: string;
  readonly reason: string;
}

export interface LiveOnlyIntelligenceLegPlan {
  readonly side:
    | "BUY"
    | "SELL";
  readonly exchange: string;
  readonly asset: string;
  readonly price: number;
  readonly quantity: number | null;
  readonly requiredBalance: number | null;
  readonly availableBalance: number | null;
  readonly shortfall: number | null;
  readonly balanceSnapshotAgeMs: number | null;
  readonly maximumBalanceSnapshotAgeMs: number | null;
  readonly balanceSufficient: boolean;
  readonly explanation: string;
}

export interface LiveOnlyIntelligenceOpportunity {
  readonly opportunityId: string;
  readonly market: string;
  readonly route: string;
  readonly status:
    | "READY_FOR_FINAL_EXECUTION"
    | "BLOCKED"
    | "ANALYTICAL_ONLY";
  readonly engineDecision: string;
  readonly netProfitPercent: number;
  readonly qualityScore: number;
  readonly generatedAt: number;
  readonly opportunityAgeMs: number;
  readonly requestedCapitalPerLegInr: number;
  readonly maximumCapitalPerLegInr: number;
  readonly estimatedExecutableCapitalInr: number | null;
  readonly estimatedBuyRequirementInr: number | null;
  readonly executionQuantity: number | null;
  readonly buy: LiveOnlyIntelligenceLegPlan;
  readonly sell: LiveOnlyIntelligenceLegPlan;
  readonly postStressNetProfitPercent: number | null;
  readonly postStressNetProfit: number | null;
  readonly blockers: readonly string[];
  readonly whatWouldMakeExecutable: readonly string[];
  readonly policyChecks:
    readonly LiveOnlyIntelligencePolicyCheck[];
  readonly capitalStudy: OpportunityCapitalStudyDecision | null;
  readonly safety: {
    readonly reportIsReadOnly: true;
    readonly authorityGranted: false;
    readonly orderSubmitted: false;
    readonly finalLastLookStillRequired: true;
  };
}

export interface LiveOnlyIntelligenceReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly sourceOpportunityCount: number;
  readonly displayedOpportunityCount: number;
  readonly truncated: boolean;
  readonly runtime: unknown;
  readonly policy: LiveOnlyRuntimePolicy;
  readonly policyReference:
    readonly LiveOnlyIntelligencePolicyCheck[];
  readonly capitalManager: unknown;
  readonly capitalStudy: OpportunityCapitalStudyReport;
  readonly opportunities:
    readonly LiveOnlyIntelligenceOpportunity[];
  readonly recentAttempts:
    readonly unknown[];
  readonly exchangeFoundations:
    readonly ExchangeFoundationCapability[];
  readonly safety: {
    readonly readOnly: true;
    readonly externalRequestPerformed: false;
    readonly balanceMutated: false;
    readonly transferInitiated: false;
    readonly withdrawalInitiated: false;
    readonly orderSubmissionAllowed: false;
  };
}

const MAXIMUM_DISPLAYED_OPPORTUNITIES =
  20;

export class StrategyOneLiveOnlyIntelligenceService {
  build(input: {
    readonly opportunities:
      readonly ArbitrageOpportunity[];
    readonly policy:
      LiveOnlyRuntimePolicy;
    readonly runtime:
      unknown;
    readonly capitalManager:
      unknown;
    readonly capitalStudy:
      OpportunityCapitalStudyReport;
    readonly recentAttempts:
      readonly unknown[];
    readonly exchangeFoundations:
      readonly ExchangeFoundationCapability[];
    readonly evaluatePreflight: (
      opportunity: ArbitrageOpportunity,
      now: number,
    ) => StrategyOneLiveOnlyPreflightReport;
    readonly now?: number;
  }): LiveOnlyIntelligenceReport {
    const now =
      input.now ??
      Date.now();

    if (
      !Number.isSafeInteger(now) ||
      now <= 0
    ) {
      throw new Error(
        "LIVE intelligence time must be a positive safe integer.",
      );
    }

    const sorted =
      [...input.opportunities]
        .sort(
          (first, second) =>
            second.netProfitPercent -
            first.netProfitPercent,
        );
    const selected =
      sorted.slice(
        0,
        MAXIMUM_DISPLAYED_OPPORTUNITIES,
      );

    const opportunities =
      selected.map(
        (opportunity) =>
          this.buildOpportunity(
            opportunity,
            input.policy,
            input.evaluatePreflight,
            now,
          ),
      );

    return deepFreeze({
      schemaVersion:
        "1.0" as const,
      generatedAt:
        now,
      sourceOpportunityCount:
        sorted.length,
      displayedOpportunityCount:
        opportunities.length,
      truncated:
        sorted.length >
        selected.length,
      runtime:
        input.runtime,
      policy:
        input.policy,
      policyReference:
        this.buildPolicyReference(
          input.policy,
        ),
      capitalManager:
        input.capitalManager,
      capitalStudy:
        input.capitalStudy,
      opportunities,
      recentAttempts:
        input.recentAttempts,
      exchangeFoundations:
        input.exchangeFoundations,
      safety: {
        readOnly:
          true as const,
        externalRequestPerformed:
          false as const,
        balanceMutated:
          false as const,
        transferInitiated:
          false as const,
        withdrawalInitiated:
          false as const,
        orderSubmissionAllowed:
          false as const,
      },
    });
  }

  private buildOpportunity(
    opportunity:
      ArbitrageOpportunity,
    policy:
      LiveOnlyRuntimePolicy,
    evaluatePreflight:
      (
        opportunity: ArbitrageOpportunity,
        now: number,
      ) => StrategyOneLiveOnlyPreflightReport,
    now:
      number,
  ): LiveOnlyIntelligenceOpportunity {
    const market =
      normalizeMarket(
        opportunity.pair.market,
      );
    const buyExchange =
      normalizeExchange(
        opportunity.pair.buy.exchange,
      );
    const sellExchange =
      normalizeExchange(
        opportunity.pair.sell.exchange,
      );
    const routeEligible =
      isStrategyOneTinyLiveDynamicRoute({
        market,
        buyExchange,
        sellExchange,
      });
    const opportunityAgeMs =
      now -
      opportunity.timestamp;
    const assets =
      resolveAssets(
        market,
        opportunity.quoteAsset,
      );

    if (!routeEligible) {
      const blockers = [
        "This route is visible for analysis but is outside the audited LIVE USDT venue pool (Binance, Bybit and CoinDCX).",
      ];

      return deepFreeze({
        opportunityId:
          opportunity.id,
        market,
        route:
          `${buyExchange} → ${sellExchange}`,
        status:
          "ANALYTICAL_ONLY" as const,
        engineDecision:
          opportunity.decision,
        netProfitPercent:
          opportunity.netProfitPercent,
        qualityScore:
          opportunity.score,
        generatedAt:
          opportunity.timestamp,
        opportunityAgeMs,
        requestedCapitalPerLegInr:
          policy.preferredCapitalPerLegInr,
        maximumCapitalPerLegInr:
          policy.maximumCapitalPerLegInr,
        estimatedExecutableCapitalInr:
          opportunity.executableCapitalInr ??
          null,
        estimatedBuyRequirementInr:
          null,
        executionQuantity:
          finitePositive(
            opportunity.executableQty,
          ),
        buy:
          this.unverifiedLeg(
            "BUY",
            buyExchange,
            assets.quoteAsset,
            opportunity.buyPrice,
            opportunity.executableQty,
            "Balance requirement was not evaluated because this venue route is not in the LIVE execution pool.",
          ),
        sell:
          this.unverifiedLeg(
            "SELL",
            sellExchange,
            assets.baseAsset,
            opportunity.sellPrice,
            opportunity.executableQty,
            "Inventory requirement was not evaluated because this venue route is not in the LIVE execution pool.",
          ),
        postStressNetProfitPercent:
          null,
        postStressNetProfit:
          null,
        blockers,
        whatWouldMakeExecutable: [
          "Implement and independently verify this exchange route's market rules, signed balances, fees, clock safety and complete order/fill lifecycle before adding it to the LIVE venue pool.",
        ],
        policyChecks: [
          check(
            "route",
            "Audited LIVE route",
            "BLOCKED",
            `${buyExchange} → ${sellExchange}`,
            "USDT route between Binance, Bybit or CoinDCX",
            blockers[0],
          ),
        ],
        capitalStudy:
          null,
        safety:
          readOnlySafety(),
      });
    }

    let preflight:
      StrategyOneLiveOnlyPreflightReport;

    try {
      preflight =
        evaluatePreflight(
          opportunity,
          now,
        );
    } catch (
      error:
        unknown
    ) {
      const reason =
        `Exact LIVE preflight failed closed: ${message(
          error,
        )}`;

      return deepFreeze({
        opportunityId:
          opportunity.id,
        market,
        route:
          `${buyExchange} → ${sellExchange}`,
        status:
          "BLOCKED" as const,
        engineDecision:
          opportunity.decision,
        netProfitPercent:
          opportunity.netProfitPercent,
        qualityScore:
          opportunity.score,
        generatedAt:
          opportunity.timestamp,
        opportunityAgeMs,
        requestedCapitalPerLegInr:
          policy.preferredCapitalPerLegInr,
        maximumCapitalPerLegInr:
          policy.maximumCapitalPerLegInr,
        estimatedExecutableCapitalInr:
          null,
        estimatedBuyRequirementInr:
          null,
        executionQuantity:
          finitePositive(
            opportunity.executableQty,
          ),
        buy:
          this.unverifiedLeg(
            "BUY",
            buyExchange,
            assets.quoteAsset,
            opportunity.buyPrice,
            opportunity.executableQty,
            reason,
          ),
        sell:
          this.unverifiedLeg(
            "SELL",
            sellExchange,
            assets.baseAsset,
            opportunity.sellPrice,
            opportunity.executableQty,
            reason,
          ),
        postStressNetProfitPercent:
          null,
        postStressNetProfit:
          null,
        blockers: [
          reason,
        ],
        whatWouldMakeExecutable: [
          "Restore the missing exact preflight evidence, then wait for a new current opportunity snapshot. This report never retries or submits an order.",
        ],
        policyChecks: [
          check(
            "preflight",
            "Exact LIVE preflight",
            "BLOCKED",
            "Unavailable",
            "Complete current evidence",
            reason,
          ),
        ],
        capitalStudy:
          null,
        safety:
          readOnlySafety(),
      });
    }

    const buy =
      this.fundedLeg(
        "BUY",
        opportunity.buyPrice,
        preflight.funding.executableQuantity,
        preflight.funding.buyFunding,
      );
    const sell =
      this.fundedLeg(
        "SELL",
        opportunity.sellPrice,
        preflight.funding.executableQuantity,
        preflight.funding.sellFunding,
      );
    const blockers =
      [...preflight.blockers];

    return deepFreeze({
      opportunityId:
        opportunity.id,
      market,
      route:
        `${buyExchange} → ${sellExchange}`,
      status:
        preflight.approved
          ? "READY_FOR_FINAL_EXECUTION" as const
          : "BLOCKED" as const,
      engineDecision:
        opportunity.decision,
      netProfitPercent:
        opportunity.netProfitPercent,
      qualityScore:
        opportunity.score,
      generatedAt:
        opportunity.timestamp,
      opportunityAgeMs,
      requestedCapitalPerLegInr:
        preflight.requestedCapitalPerLegInr,
      maximumCapitalPerLegInr:
        preflight.maximumCapitalPerLegInr,
      estimatedExecutableCapitalInr:
        preflight.funding
          .estimatedExecutableCapitalInr,
      estimatedBuyRequirementInr:
        preflight.funding
          .estimatedBuyRequirementInr ??
        null,
      executionQuantity:
        preflight.funding
          .executableQuantity,
      buy,
      sell,
      postStressNetProfitPercent:
        preflight.stress
          ?.postStressNetProfitPercent ??
        null,
      postStressNetProfit:
        preflight.stress
          ?.postStressNetProfit ??
        null,
      blockers,
      whatWouldMakeExecutable:
        this.buildRemedies(
          buy,
          sell,
          blockers,
          preflight.approved,
        ),
      policyChecks:
        this.buildChecks(
          opportunity,
          preflight,
          policy,
        ),
      capitalStudy:
        preflight.capitalStudy,
      safety:
        readOnlySafety(),
    });
  }

  private fundedLeg(
    side:
      "BUY" | "SELL",
    price:
      number,
    quantity:
      number | null,
    funding: {
      readonly exchange: string;
      readonly asset: string | null;
      readonly requiredBalance: number | null;
      readonly availableBalance: number | null;
      readonly snapshotAgeMs: number | null;
      readonly maximumSnapshotAgeMs: number;
      readonly sufficient: boolean;
    },
  ): LiveOnlyIntelligenceLegPlan {
    const shortfall =
      funding.requiredBalance !==
        null &&
      funding.availableBalance !==
        null
        ? Math.max(
            0,
            funding.requiredBalance -
            funding.availableBalance,
          )
        : null;
    const asset =
      funding.asset ??
      "UNKNOWN";

    return deepFreeze({
      side,
      exchange:
        funding.exchange,
      asset,
      price,
      quantity,
      requiredBalance:
        funding.requiredBalance,
      availableBalance:
        funding.availableBalance,
      shortfall,
      balanceSnapshotAgeMs:
        funding.snapshotAgeMs,
      maximumBalanceSnapshotAgeMs:
        funding.maximumSnapshotAgeMs,
      balanceSufficient:
        funding.sufficient,
      explanation:
        funding.sufficient
          ? `${funding.exchange} has enough ${asset} for the ${side} leg.`
          : shortfall !==
              null
            ? `${funding.exchange} needs ${formatNumber(
                shortfall,
              )} more ${asset} for this exact ${side} leg.`
            : `${funding.exchange} needs a fresh authenticated ${asset} balance before this ${side} leg can execute.`,
    });
  }

  private unverifiedLeg(
    side:
      "BUY" | "SELL",
    exchange:
      string,
    asset:
      string,
    price:
      number,
    quantity:
      number,
    explanation:
      string,
  ): LiveOnlyIntelligenceLegPlan {
    return deepFreeze({
      side,
      exchange,
      asset,
      price,
      quantity:
        finitePositive(
          quantity,
        ),
      requiredBalance:
        null,
      availableBalance:
        null,
      shortfall:
        null,
      balanceSnapshotAgeMs:
        null,
      maximumBalanceSnapshotAgeMs:
        null,
      balanceSufficient:
        false,
      explanation,
    });
  }

  private buildChecks(
    opportunity:
      ArbitrageOpportunity,
    preflight:
      StrategyOneLiveOnlyPreflightReport,
    policy:
      LiveOnlyRuntimePolicy,
  ): readonly LiveOnlyIntelligencePolicyCheck[] {
    const depthEvidence =
      preflight.funding
        .multiLevelDepthEvidence;
    const checks:
      LiveOnlyIntelligencePolicyCheck[] = [
      check(
        "runtime",
        "LIVE runtime confirmation",
        policy.enabled
          ? "PASS"
          : "BLOCKED",
        policy.enabled
          ? "Enabled"
          : "Disabled",
        "All explicit LIVE environment confirmations enabled",
        policy.enabled
          ? "The process is configured for the LIVE-only profile."
          : "The exact LIVE process configuration is incomplete.",
      ),
      check(
        "decision",
        "Opportunity-engine decision",
        opportunity.decision ===
          "EXECUTE"
          ? "PASS"
          : "BLOCKED",
        opportunity.decision,
        "EXECUTE",
        opportunity.decision ===
          "EXECUTE"
          ? "The central opportunity engine accepted this snapshot."
          : "REVIEW or SKIP candidates cannot reach automatic LIVE execution.",
      ),
      check(
        "current-net",
        "Current fee-adjusted net",
        opportunity.netProfitPercent >=
          preflight.capitalStudy.effectiveMinimumCurrentNetProfitPercent
          ? "PASS"
          : "BLOCKED",
        `${opportunity.netProfitPercent.toFixed(
          3,
        )}%`,
        `≥ ${preflight.capitalStudy.effectiveMinimumCurrentNetProfitPercent.toFixed(
          2,
        )}%`,
        `Route-specific studied gate; baseline is ${policy.minimumCurrentNetProfitPercent.toFixed(2)}% and the hard adaptive floor is 0.20%.`,
      ),
      check(
        "capital-study",
        "Independent route confirmations",
        preflight.capitalStudy.executionQualified
          ? "PASS"
          : "BLOCKED",
        `${preflight.capitalStudy.currentConsecutiveSamples}/${preflight.capitalStudy.requiredCurrentSamples}`,
        `${preflight.capitalStudy.requiredCurrentSamples} fresh independent samples`,
        preflight.capitalStudy.executionQualified
          ? "This exact market and BUY/SELL venue direction earned the current route threshold."
          : "The same cached book never counts twice; a new route still needs fresh independent confirmations.",
      ),
      check(
        "freshness",
        "Authoritative quote freshness",
        opportunity.quotesAreFresh &&
          !opportunity.usedLastPriceFallback
          ? "PASS"
          : "BLOCKED",
        opportunity.usedLastPriceFallback
          ? "Fallback price"
          : opportunity.quotesAreFresh
            ? "Fresh"
            : "Stale",
        "Fresh executable bid/ask; no last-price fallback",
        "Only genuine executable order-book quotes may authorize a trade.",
      ),
      check(
        "opportunity-age",
        "Opportunity age",
        preflight.opportunityAgeMs >=
            0 &&
          preflight.opportunityAgeMs <=
            policy.maximumOpportunityAgeMs
          ? "PASS"
          : "BLOCKED",
        `${preflight.opportunityAgeMs} ms`,
        `0-${policy.maximumOpportunityAgeMs} ms`,
        "The accepted snapshot must still be current at preflight time.",
      ),
      check(
        "buy-book-age",
        "BUY book age",
        validAge(
          preflight.buyQuoteAgeMs,
          STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
        )
          ? "PASS"
          : "BLOCKED",
        `${preflight.buyQuoteAgeMs} ms`,
        `≤ ${STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS} ms`,
        "BUY-side price and depth must be action-time fresh.",
      ),
      check(
        "sell-book-age",
        "SELL book age",
        validAge(
          preflight.sellQuoteAgeMs,
          STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
        )
          ? "PASS"
          : "BLOCKED",
        `${preflight.sellQuoteAgeMs} ms`,
        `≤ ${STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS} ms`,
        "SELL-side price and depth must be action-time fresh.",
      ),
      check(
        "book-skew",
        "BUY/SELL book skew",
        validAge(
          preflight.quoteSkewMs,
          STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS,
        )
          ? "PASS"
          : "BLOCKED",
        `${preflight.quoteSkewMs} ms`,
        `≤ ${STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS} ms`,
        "Both venue books must describe nearly the same instant.",
      ),
      check(
        "buy-funding",
        "BUY-side quote balance",
        preflight.funding.buyFunding.sufficient
          ? "PASS"
          : "BLOCKED",
        fundingValue(
          preflight.funding.buyFunding.availableBalance,
          preflight.funding.buyFunding.asset,
        ),
        fundingValue(
          preflight.funding.buyFunding.requiredBalance,
          preflight.funding.buyFunding.asset,
        ),
        "The BUY exchange needs enough quote currency from a fresh signed balance read.",
      ),
      check(
        "sell-funding",
        "SELL-side coin inventory",
        preflight.funding.sellFunding.sufficient
          ? "PASS"
          : "BLOCKED",
        fundingValue(
          preflight.funding.sellFunding.availableBalance,
          preflight.funding.sellFunding.asset,
        ),
        fundingValue(
          preflight.funding.sellFunding.requiredBalance,
          preflight.funding.sellFunding.asset,
        ),
        "The SELL exchange must already hold the exact base coin quantity.",
      ),
      check(
        "depth",
        "Full multi-level depth",
        depthEvidence?.status ===
          "PASSED"
          ? "PASS"
          : depthEvidence?.status ===
              "BLOCKED"
            ? "BLOCKED"
            : "NOT_EVALUATED",
        depthEvidence
          ?.sharedDepthQuantity ==
          null
          ? "Unavailable"
          : formatNumber(
              depthEvidence
                .sharedDepthQuantity,
            ),
        "100% exact quantity executable on both books",
        depthEvidence
          ?.blockers[0] ??
          "Both legs must retain adequate real depth after quantity normalization.",
      ),
      check(
        "post-stress-net",
        "Post-stress net",
        preflight.stress?.status ===
          "PASSED"
          ? "PASS"
          : preflight.stress?.status ===
              "BLOCKED"
            ? "BLOCKED"
            : "NOT_EVALUATED",
        preflight.stress
          ?.postStressNetProfitPercent ===
          null ||
          !preflight.stress
          ? "Unavailable"
          : `${preflight.stress.postStressNetProfitPercent.toFixed(
              3,
            )}%`,
        `≥ ${policy.minimumPostStressNetProfitPercent.toFixed(
          2,
        )}%`,
        preflight.stress
          ?.reasons[0] ??
          "Net is recalculated after depth, fees, statutory withholding, adverse movement reserve and safety buffer.",
      ),
      check(
        "permission-boundary",
        "API permission boundary",
        preflight.permissionBoundary.ready
          ? "PASS"
          : "BLOCKED",
        preflight.permissionBoundary.ready
          ? "Ready"
          : "Blocked",
        "Trading-only keys; withdrawals disabled; fresh authenticated evidence",
        preflight.permissionBoundary
          .blockers[0] ??
          "Both venue API permissions are inside the audited order boundary.",
      ),
    ];

    for (
      const gate
      of preflight.core?.gates ??
        []
    ) {
      checks.push(
        check(
          `core-${gate.key}`,
          gate.message,
          gate.state,
          gate.state,
          "PASS",
          gate.reasons[0] ??
            "Central LIVE safety gate passed.",
        ),
      );
    }

    return deepFreeze(
      checks,
    );
  }

  private buildPolicyReference(
    policy:
      LiveOnlyRuntimePolicy,
  ): readonly LiveOnlyIntelligencePolicyCheck[] {
    return deepFreeze([
      check(
        "capital",
        "Capital per leg",
        "NOT_EVALUATED",
        `Preferred ₹${policy.preferredCapitalPerLegInr}`,
        `₹${policy.minimumCapitalPerLegInr}-₹${policy.maximumCapitalPerLegInr}`,
        "Quantity may reduce for depth or balances, but cannot exceed the hard cap.",
      ),
      check(
        "minimum-current-net",
        "Current net threshold",
        "NOT_EVALUATED",
        "Per current opportunity",
        `≥ ${policy.minimumCurrentNetProfitPercent.toFixed(
          2,
        )}%`,
        "Fee-adjusted opportunity-engine net before LIVE stress reserves.",
      ),
      check(
        "minimum-stress-net",
        "Post-stress net threshold",
        "NOT_EVALUATED",
        "Per exact preflight",
        `≥ ${policy.minimumPostStressNetProfitPercent.toFixed(
          2,
        )}%`,
        "After VWAP depth, fees, tax withholding, adverse movement and safety buffer.",
      ),
      check(
        "book-age",
        "Action-time book age",
        "NOT_EVALUATED",
        "BUY and SELL measured separately",
        `≤ ${STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS} ms`,
        "Old books fail closed; the report never substitutes last prices.",
      ),
      check(
        "book-skew-policy",
        "Cross-venue book skew",
        "NOT_EVALUATED",
        "Measured per route",
        `≤ ${STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS} ms`,
        "Prevents combining prices observed too far apart in time.",
      ),
      check(
        "concurrency",
        "Concurrent trades",
        "NOT_EVALUATED",
        `${policy.maximumConcurrentTrades}`,
        "Exactly 1",
        "Only one two-leg lifecycle can own the execution boundary at a time.",
      ),
      check(
        "retry",
        "Automatic retry",
        "PASS",
        "Disabled",
        "No retry for the same opportunity",
        "A refreshed opportunity receives a new identity and a full new preflight.",
      ),
    ]);
  }

  private buildRemedies(
    buy:
      LiveOnlyIntelligenceLegPlan,
    sell:
      LiveOnlyIntelligenceLegPlan,
    blockers:
      readonly string[],
    approved:
      boolean,
  ): readonly string[] {
    if (approved) {
      return [
        "All displayed preflight gates passed. The runner must still obtain one-time authority and pass the final order-time last look before any exchange request.",
      ];
    }

    const remedies:
      string[] = [];

    for (
      const leg
      of [buy, sell]
    ) {
      if (
        leg.shortfall !==
        null &&
        leg.shortfall >
          0
      ) {
        remedies.push(
          `${leg.exchange} would need ${formatNumber(
            leg.shortfall,
          )} additional ${leg.asset} for the ${leg.side} leg (required ${formatNullable(
            leg.requiredBalance,
          )}, available ${formatNullable(
            leg.availableBalance,
          )}).`,
        );
      } else if (
        !leg.balanceSufficient &&
        leg.availableBalance ===
          null
      ) {
        remedies.push(
          `${leg.exchange} needs a fresh authenticated ${leg.asset} balance; the current available amount is unknown.`,
        );
      }
    }

    if (
      remedies.length ===
      0
    ) {
      remedies.push(
        blockers[0] ??
          "Wait for a new opportunity that passes every current-book, inventory, rule, fee, depth, stress and safety gate.",
      );
    }

    return deepFreeze(
      remedies,
    );
  }
}

function check(
  key:
    string,
  label:
    string,
  state:
    LiveOnlyIntelligenceCheckState,
  current:
    string,
  required:
    string,
  reason:
    string,
): LiveOnlyIntelligencePolicyCheck {
  return {
    key,
    label,
    state,
    current,
    required,
    reason,
  };
}

function readOnlySafety() {
  return {
    reportIsReadOnly:
      true as const,
    authorityGranted:
      false as const,
    orderSubmitted:
      false as const,
    finalLastLookStillRequired:
      true as const,
  };
}

function resolveAssets(
  market:
    string,
  explicitQuoteAsset:
    string | undefined,
): {
  readonly baseAsset: string;
  readonly quoteAsset: string;
} {
  const quoteAsset =
    explicitQuoteAsset
      ?.trim()
      .toUpperCase() ||
    (
      market.endsWith(
        "USDT",
      )
        ? "USDT"
        : market.endsWith(
              "INR",
            )
          ? "INR"
          : "QUOTE"
    );
  const baseAsset =
    quoteAsset !==
        "QUOTE" &&
      market.endsWith(
        quoteAsset,
      )
      ? market.slice(
          0,
          -quoteAsset.length,
        )
      : "BASE";

  return {
    baseAsset:
      baseAsset ||
      "BASE",
    quoteAsset,
  };
}

function normalizeMarket(
  value:
    string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/gu,
      "",
    );
}

function normalizeExchange(
  value:
    string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function finitePositive(
  value:
    number,
): number | null {
  return Number.isFinite(
    value,
  ) &&
    value > 0
    ? value
    : null;
}

function validAge(
  value:
    number,
  maximum:
    number,
): boolean {
  return Number.isSafeInteger(
    value,
  ) &&
    value >= 0 &&
    value <= maximum;
}

function fundingValue(
  value:
    number | null,
  asset:
    string | null,
): string {
  return value ===
    null
    ? "Unavailable"
    : `${formatNumber(
        value,
      )} ${asset ?? "UNKNOWN"}`;
}

function formatNullable(
  value:
    number | null,
): string {
  return value ===
    null
    ? "unknown"
    : formatNumber(
        value,
      );
}

function formatNumber(
  value:
    number,
): string {
  return value.toLocaleString(
    "en-IN",
    {
      maximumFractionDigits:
        8,
    },
  );
}

function message(
  error:
    unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Unknown preflight error.";
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const child
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      child,
    );
  }

  return Object.freeze(
    value,
  );
}

export const strategyOneLiveOnlyIntelligenceService =
  new StrategyOneLiveOnlyIntelligenceService();
