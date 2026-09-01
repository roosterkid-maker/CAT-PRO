import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {ArbitrageOpportunity} from "../../models/ArbitrageOpportunity";
import type {OpportunitySnapshot} from "../../services/OpportunityService";
import type {MonitoredOpportunityCandidate} from "../../../automation/models/OpportunityMonitor";
import {CandidateQualificationService} from "../../../automation/services/CandidateQualificationService";
import {
  StrategyOnePilotEquivalentPaperEvidenceService,
} from "../StrategyOnePilotEquivalentPaperEvidenceService";
import {
  StrategyOneTinyLiveOpportunityAuditService,
} from "../../../execution/live/tiny-live/StrategyOneTinyLiveOpportunityAuditService";
import type {
  StrategyOnePilotPreviewReport,
} from "../../../execution/live/tiny-live/StrategyOnePilotPreflightService";

const NOW = 1_780_800_000_000;

function opportunity(input: {
  readonly generatedAt: number;
  readonly market?: string;
  readonly buyExchange?: string;
  readonly sellExchange?: string;
  readonly buyAgeMs?: number;
  readonly sellAgeMs?: number;
  readonly netProfitPercent?: number;
  readonly decision?: ArbitrageOpportunity["decision"];
}): ArbitrageOpportunity {
  const buyExchange = input.buyExchange ?? "binance";
  const sellExchange = input.sellExchange ?? "bybit";
  const market = input.market ?? "BTCUSDT";
  const netProfitPercent = input.netProfitPercent ?? 1.8;
  return {
    id: `v112-${input.generatedAt}-${buyExchange}-${sellExchange}`,
    pair: {
      market,
      buy: {exchange: buyExchange, market, lastPrice: 100, bestBidPrice: 99,
        bestBidQty: 10, bestAskPrice: 100, bestAskQty: 10, spread: 1,
        timestamp: input.generatedAt - (input.buyAgeMs ?? 20), source: "orderBook", executable: true},
      sell: {exchange: sellExchange, market, lastPrice: 102, bestBidPrice: 102,
        bestBidQty: 10, bestAskPrice: 103, bestAskQty: 10, spread: 1,
        timestamp: input.generatedAt - (input.sellAgeMs ?? 15), source: "orderBook", executable: true},
    },
    buyPrice: 100, sellPrice: 102, buyAvailableQty: 10, sellAvailableQty: 10,
    requiredQty: 1, availableExecutableQty: 10, executableQty: 1, liquidityScore: 100,
    enoughLiquidity: true, freshnessScore: 100, feeScore: 100, spreadScore: 100,
    decision: input.decision ?? "EXECUTE", analysisSummary: [], rawSpread: 2,
    rawSpreadPercent: netProfitPercent + 0.2,
    estimatedFees: 0.2, netProfit: netProfitPercent, netProfitPercent,
    usedLastPriceFallback: false, quotesAreFresh: true, score: 100,
    timestamp: input.generatedAt,
  };
}

function snapshot(value: ArbitrageOpportunity): OpportunitySnapshot {
  return {generatedAt: value.timestamp, opportunities: [value]};
}

function rawPilotSnapshot(generatedAt: number): OpportunitySnapshot {
  return {generatedAt, opportunities: [], pilotRouteBooks: [{
    market: "BBUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
    buyTimestamp: generatedAt - 20,
    sellTimestamp: generatedAt - 15,
  }]};
}

function candidate(value: ArbitrageOpportunity, now: number): MonitoredOpportunityCandidate {
  return {
    strategyAttribution: {attributionStatus: "UNATTRIBUTED_LEGACY", strategyId: null, signalId: null, intentId: null},
    key: "BTCUSDT:binance->bybit", market: "BTCUSDT", buyExchange: "binance", sellExchange: "bybit",
    status: "ACTIVE", latestOpportunityId: value.id, firstSeenAt: now - 10_000, lastSeenAt: now,
    disappearedAt: null, lifetimeMs: 10_000, totalObservations: 3, consecutiveObservations: 3,
    missedSnapshots: 0, reappearances: 0,
    latest: {buyPrice: value.buyPrice, sellPrice: value.sellPrice, executableQuantity: value.executableQty,
      netProfit: value.netProfit, netProfitPercent: value.netProfitPercent, estimatedFees: value.estimatedFees,
      rawSpread: value.rawSpread, rawSpreadPercent: value.rawSpreadPercent, liquidityScore: value.liquidityScore,
      freshnessScore: value.freshnessScore, opportunityTimestamp: value.timestamp,
      buyQuoteTimestamp: value.pair.buy.timestamp, sellQuoteTimestamp: value.pair.sell.timestamp,
      quotesAreFresh: value.quotesAreFresh, usedLastPriceFallback: value.usedLastPriceFallback},
    best: {netProfit: value.netProfit, netProfitPercent: value.netProfitPercent, observedAt: now,
      opportunityId: value.id},
  };
}

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-v112-"));
  const filePath = join(directory, "pilot.jsonl");
  try {
    const service = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath, minimumExecutionGradeGenerations: 2, minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000, maximumGenerationKeysPerRoute: 8,
    });
    const stale = opportunity({generatedAt: NOW, buyAgeMs: 20, sellAgeMs: 600});
    service.observeSnapshot(snapshot(stale), NOW + 5);
    service.observeSnapshot(snapshot(stale), NOW + 6);
    service.observeSnapshot(snapshot(opportunity({generatedAt: NOW + 1_000})), NOW + 1_005);
    service.observeSnapshot(snapshot(opportunity({generatedAt: NOW + 2_000})), NOW + 2_005);
    service.observeSnapshot(snapshot(opportunity({generatedAt: NOW + 3_000,
      buyExchange: "coindcx", sellExchange: "binance"})), NOW + 3_005);

    const report = service.getReport(NOW + 3_100);
    const route = report.routes.find((item) =>
      item.routeKey === "BTCUSDT:binance->bybit");
    assert.ok(route, "The requested dynamic route must retain its own evidence bucket.");
    assert.equal(route.uniqueGenerations, 3);
    assert.equal(route.repeatedGenerationsIgnored, 1);
    assert.equal(route.executionGradeGenerations, 2);
    assert.equal(route.rejectionCounts.SELL_BOOK_STALE, 1);
    assert.equal(route.rejectionCounts.BOOK_TIMESTAMP_SKEW, 1);
    assert.equal(route.executionGradeBuyAgeMs.p99Ms, 25);
    assert.equal(route.executionGradeSellAgeMs.p99Ms, 20);
    assert.equal(route.calibration.ready, true);
    assert.equal(route.dispatchReserved.maximumBookAgeMs, 500);
    assert.equal(route.dispatchReserved.generations, 2);
    assert.equal(route.dispatchReserved.buyAgeMs.p99Ms, 25);
    assert.equal(route.dispatchReserved.sellAgeMs.p99Ms, 20);
    assert.equal(route.dispatchReserved.calibration.ready, true);
    assert.equal(route.economics.observedGenerations, 3);
    assert.equal(route.economics.profitBands.liveEligible, 3);
    assert.equal(route.economics.dispatchReservedLiveEligibleGenerations, 2);
    assert.equal(route.economics.netProfitPercent.p95Percent, 1.8);
    assert.equal(report.excludedVenueOpportunities, 0,
      "CoinDCX is a supported venue in the dynamic route pool.");
    assert.equal(report.safety.evidenceDoesNotAuthorizeLiveOrOrders, true);

    const cachedReport = service.getReport(NOW + 3_101);
    assert.equal(cachedReport.generatedAt, NOW + 3_101,
      "A cached pilot derivation must retain the caller's exact action-time timestamp.");
    assert.equal(cachedReport.routes, report.routes,
      "Unchanged pilot evidence must reuse frozen distributions across preview and authorization.");
    assert.notEqual(cachedReport.persistence, report.persistence,
      "Pilot persistence diagnostics must remain fresh on a cached evidence read.");

    const absoluteOnly = opportunity({
      generatedAt: NOW + 4_000,
      buyAgeMs: 520,
      sellAgeMs: 20,
    });
    service.observeSnapshot(snapshot(absoluteOnly), NOW + 4_005);
    const afterMutationReport = service.getReport(NOW + 4_100);
    assert.notEqual(afterMutationReport.routes, cachedReport.routes,
      "Every genuine pilot observation must invalidate the frozen report derivation.");
    const dispatchReport = afterMutationReport.routes.find((item) =>
      item.routeKey === "BTCUSDT:binance->bybit");
    assert.ok(dispatchReport);
    assert.equal(dispatchReport.executionGradeGenerations, 3,
      "A generation inside the operator-reviewed 560 ms ceiling remains in historical execution-grade evidence.");
    assert.equal(dispatchReport.dispatchReserved.generations, 2,
      "A generation without dispatch reserve must not enter readiness calibration.");
    assert.equal(dispatchReport.dispatchReserved.rejectedExecutionGradeGenerations, 1);

    const qualifier = new CandidateQualificationService({
      minimumConsecutiveObservations: 1, minimumPersistenceMs: 1, minimumLiquidityScore: 0,
      minimumFreshnessScore: 0, minimumNetProfitPercent: 0.01, maximumProfitDrawdownPercent: 100,
      capitalAwareLiquidityEnabled: false,
    });
    assert.equal(qualifier.evaluate(candidate(stale, NOW + 5), NOW + 5).status, "REJECTED");
    assert.equal(qualifier.evaluate(candidate(absoluteOnly, NOW + 4_005), NOW + 4_005).status, "REJECTED",
      "The pilot PAPER lane must enforce the same dispatch-reserved admission boundary.");
    const fresh = opportunity({generatedAt: NOW + 5_000});
    assert.notEqual(qualifier.evaluate(candidate(fresh, NOW + 5_005), NOW + 5_005).status, "REJECTED");

    service.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 6_000,
      netProfitPercent: 0.1,
      decision: "REVIEW",
    })), NOW + 6_005);
    const preview = {
      state: "WAITING_FOR_CURRENT_OPPORTUNITY",
      minimumCurrentNetProfitPercent: 0.30,
      evidence: {fullyPreflightableMatches: 0},
      selected: null,
      blockers: ["No current Binance/Bybit candidate passed every action-time check."],
    } as unknown as StrategyOnePilotPreviewReport;
    const audit = new StrategyOneTinyLiveOpportunityAuditService({
      getEvidence: (now) => service.getReport(now),
      getCurrentPreview: () => preview,
    });
    const collectingAudit = audit.getReport(NOW + 6_100);
    assert.equal(collectingAudit.state, "COLLECTING");
    assert.equal(collectingAudit.observation.wallClockSpanMs, 6_095);
    assert.equal(collectingAudit.observation.eventSpanMs, 6_000);
    assert.equal(collectingAudit.observation.idleSinceLastObservationMs, 95);
    assert.equal(collectingAudit.observation.spanMs,
      collectingAudit.observation.wallClockSpanMs,
      "The compatibility span must represent the truthful wall-clock audit window.");
    assert.equal(collectingAudit.observation.profitBands.discovered, 1);
    assert.equal(collectingAudit.thresholds.activeTinyLiveNetProfitPercent, 0.30,
      "The action-time threshold must remain at the authoritative 0.30% floor.");
    assert.equal(collectingAudit.thresholds.liveNetProfitPercent, 0.30);
    assert.equal(collectingAudit.routeRanking[0]?.routeKey,
      "BTCUSDT:binance->bybit");
    assert.equal(collectingAudit.currentActionTime.categories.every(
      (category) => category.state === "NOT_EVALUATED"), true);
    assert.equal(collectingAudit.safety.orderSubmissionPerformed, false);

    const inactiveReviewableAudit = audit.getReport(NOW + 3_600_005);
    assert.equal(inactiveReviewableAudit.state, "READY_FOR_POLICY_REVIEW",
      "A market drought is valid audit evidence and must not freeze the one-hour wall clock.");
    assert.equal(inactiveReviewableAudit.observation.eventSpanMs, 6_000,
      "Event span must remain truthful when no new opportunity generation arrives.");
    assert.equal(inactiveReviewableAudit.observation.wallClockSpanMs, 3_600_000);
    assert.equal(inactiveReviewableAudit.observation.idleSinceLastObservationMs, 3_594_000);

    service.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 3_606_001,
      netProfitPercent: 0.35,
    })), NOW + 3_606_006);
    const reviewableAudit = audit.getReport(NOW + 3_606_100);
    assert.equal(reviewableAudit.state, "READY_FOR_POLICY_REVIEW");
    assert.equal(reviewableAudit.observation.profitBands.qualified, 0,
      "No intermediate band remains when qualification and LIVE both start at 0.30%.");
    assert.equal(reviewableAudit.observation.profitBands.liveEligible, 6,
      "Every supported dynamic-route observation above 0.30% must be reported under the current LIVE floor.");
    assert.equal(reviewableAudit.blockerRanking.find(
      (blocker) => blocker.code === "PROFIT_BELOW_LIVE_MINIMUM")?.count, 1);
    assert.notEqual(reviewableAudit.routeRanking[0]?.dominantBlocker,
      "PROFIT_BELOW_LIVE_MINIMUM",
      "A route whose displayed P95 exceeds 0.30% must not be labelled below the LIVE minimum.");
    assert.equal(reviewableAudit.safety.policyMutationAllowed, false);

    service.stop();
    const restored = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath, minimumExecutionGradeGenerations: 2, minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000, maximumGenerationKeysPerRoute: 8,
    });
    restored.observeSnapshot(snapshot(opportunity({generatedAt: NOW + 2_000})), NOW + 2_006);
    assert.equal(restored.getReport(NOW + 3_200).routes.find((item) =>
      item.routeKey === "BTCUSDT:binance->bybit")?.repeatedGenerationsIgnored, 2,
      "Restart restore must preserve exact quote-generation deduplication.");
    assert.equal(restored.getReport(NOW + 3_606_200).routes.find((item) =>
      item.routeKey === "BTCUSDT:binance->bybit")?.economics.observedGenerations, 6,
      "Restart restore must preserve economics counters without inventing observations.");

    const timingOnlyService = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath: join(directory, "pilot-route-books.jsonl"), minimumExecutionGradeGenerations: 2,
      minimumObservationSpanMs: 1_000, persistenceIntervalMs: 60_000,
      maximumGenerationKeysPerRoute: 8,
    });
    timingOnlyService.observeSnapshot(rawPilotSnapshot(NOW + 10_000), NOW + 10_005);
    timingOnlyService.observeSnapshot(rawPilotSnapshot(NOW + 11_000), NOW + 11_005);
    const timingOnlyReport = timingOnlyService.getReport(NOW + 11_100);
    const timingOnlyRoute = timingOnlyReport.routes[0]!;
    assert.equal(timingOnlyReport.routeBookObservationsObserved, 2);
    assert.equal(timingOnlyRoute.routeKey, "BBUSDT:coindcx->binance");
    assert.equal(timingOnlyRoute.executionGradeGenerations, 2);
    assert.equal(timingOnlyRoute.dispatchReserved.generations, 2);
    assert.equal(timingOnlyRoute.calibration.ready, true);
    assert.equal(timingOnlyRoute.dispatchReserved.calibration.ready, true);
    assert.equal(timingOnlyRoute.economics.observedGenerations, 0,
      "Timing-only books must never fabricate profitable opportunity economics.");
    assert.equal(timingOnlyReport.safety.timingEvidenceIsIndependentFromOpportunityEconomics, true);
    assert.equal(timingOnlyReport.safety.evidenceDoesNotAuthorizeLiveOrOrders, true);

    const capacityService = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath: join(directory, "pilot-capacity.jsonl"), maximumRoutes: 2,
      minimumExecutionGradeGenerations: 2, minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000, maximumGenerationKeysPerRoute: 8,
    });
    capacityService.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 20_000, market: "BTCUSDT",
    })), NOW + 20_005);
    capacityService.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 21_000, market: "BTCUSDT",
    })), NOW + 21_005);
    capacityService.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 22_000, market: "ETHUSDT",
    })), NOW + 22_005);
    capacityService.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 23_000, market: "SOLUSDT",
    })), NOW + 23_005);
    const capacityRoutes = capacityService.getReport(NOW + 23_100).routes;
    assert.equal(capacityRoutes.length, 2);
    assert.equal(capacityRoutes.some((item) => item.market === "BTCUSDT"), true,
      "Dispatch-reserved evidence approaching calibration must survive dynamic-route churn.");
    assert.equal(capacityRoutes.some((item) => item.market === "ETHUSDT"), true,
      "An equally progressed candidate must remain stable at hard capacity.");
    assert.equal(capacityRoutes.some((item) => item.market === "SOLUSDT"), false,
      "A new equal-progress route must not churn an already retained candidate.");

    const stableTimingCohort = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath: join(directory, "pilot-stable-capacity.jsonl"), maximumRoutes: 2,
      minimumExecutionGradeGenerations: 2, minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000, maximumGenerationKeysPerRoute: 8,
    });
    stableTimingCohort.observeSnapshot({
      generatedAt: NOW + 30_000,
      opportunities: [],
      pilotRouteBooks: [
        {market: "BTCUSDT", buyExchange: "binance", sellExchange: "bybit",
          buyTimestamp: NOW + 29_980, sellTimestamp: NOW + 29_985},
        {market: "ETHUSDT", buyExchange: "coindcx", sellExchange: "binance",
          buyTimestamp: NOW + 29_980, sellTimestamp: NOW + 29_985},
      ],
    }, NOW + 30_005);
    stableTimingCohort.observeSnapshot({
      generatedAt: NOW + 31_000,
      opportunities: [],
      pilotRouteBooks: [
        {market: "SOLUSDT", buyExchange: "binance", sellExchange: "bybit",
          buyTimestamp: NOW + 30_980, sellTimestamp: NOW + 30_985},
        {market: "XRPUSDT", buyExchange: "coindcx", sellExchange: "binance",
          buyTimestamp: NOW + 30_980, sellTimestamp: NOW + 30_985},
      ],
    }, NOW + 31_005);
    const stableRoutes = stableTimingCohort.getReport(NOW + 31_100).routes;
    assert.deepEqual(stableRoutes.map((item) => item.market).sort(), ["BTCUSDT", "ETHUSDT"],
      "Timing-only route-book overflow must not churn a full bounded evidence cohort.");

    stableTimingCohort.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 32_000, market: "SOLUSDT",
    })), NOW + 32_005);
    const admittedOpportunityRoutes = stableTimingCohort.getReport(NOW + 32_100).routes;
    assert.equal(admittedOpportunityRoutes.some((item) => item.market === "SOLUSDT"), true,
      "A current accepted dynamic opportunity must still enter a full timing cohort.");

    const candidatePriorityCohort = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath: join(directory, "pilot-candidate-priority.jsonl"), maximumRoutes: 2,
      minimumExecutionGradeGenerations: 2, minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000, maximumGenerationKeysPerRoute: 8,
    });
    for (const generatedAt of [NOW + 40_000, NOW + 41_000]) {
      candidatePriorityCohort.observeSnapshot({
        generatedAt,
        opportunities: [],
        pilotRouteBooks: [
          {market: "BTCUSDT", buyExchange: "binance", sellExchange: "bybit",
            buyTimestamp: generatedAt - 20, sellTimestamp: generatedAt - 15},
          {market: "ETHUSDT", buyExchange: "coindcx", sellExchange: "binance",
            buyTimestamp: generatedAt - 20, sellTimestamp: generatedAt - 15},
        ],
      }, generatedAt + 5);
    }
    assert.equal(candidatePriorityCohort.getReport(NOW + 41_100).routes
      .every((item) => item.dispatchReserved.calibration.ready), true,
    "The fixture must begin with a full mature timing-only cohort.");

    candidatePriorityCohort.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 42_000, market: "SANDUSDT", buyExchange: "bybit",
      sellExchange: "coindcx", buyAgeMs: 500, sellAgeMs: 600, netProfitPercent: 0.6,
    })), NOW + 42_005);
    candidatePriorityCohort.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 42_100, market: "ADAUSDT", buyExchange: "binance",
      sellExchange: "bybit", buyAgeMs: 500, sellAgeMs: 600, netProfitPercent: 0.6,
    })), NOW + 42_105);
    candidatePriorityCohort.observeSnapshot(snapshot(opportunity({
      generatedAt: NOW + 42_200, market: "XRPUSDT", buyExchange: "binance",
      sellExchange: "bybit", buyAgeMs: 500, sellAgeMs: 600, netProfitPercent: 0.6,
    })), NOW + 42_205);
    const stableCandidateMarkets = candidatePriorityCohort.getReport(NOW + 42_300).routes
      .map((item) => item.market).sort();
    assert.deepEqual(stableCandidateMarkets, ["ADAUSDT", "SANDUSDT"],
      "Profitable candidates must displace timing-only routes, while an equal new route cannot churn the bounded cohort.");

    for (const generatedAt of [NOW + 43_000, NOW + 44_000]) {
      candidatePriorityCohort.observeSnapshot(snapshot(opportunity({
        generatedAt, market: "SANDUSDT", buyExchange: "bybit", sellExchange: "coindcx",
        buyAgeMs: 20, sellAgeMs: 15, netProfitPercent: 0.6,
      })), generatedAt + 5);
    }
    const retainedCandidate = candidatePriorityCohort.getReport(NOW + 44_100).routes
      .find((item) => item.market === "SANDUSDT");
    assert.equal(retainedCandidate?.dispatchReserved.generations, 2);
    assert.equal(retainedCandidate?.dispatchReserved.calibration.ready, true,
      "A retained profitable route must be able to mature from later genuine fresh generations.");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  console.log("V126.1 exact registered pilot-route evidence preserves wall-clock and event-time truth, ranks read-only Tiny-LIVE blockers and grants no LIVE authority.");
}

main();
