import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {ArbitrageOpportunity} from "../../models/ArbitrageOpportunity";
import type {OpportunitySnapshot} from "../../services/OpportunityService";
import {StrategyOneLiveVenueContractRegistry} from "../../../execution/live/contracts/StrategyOneLiveVenueContractRegistry";
import {StrategyOneExecutionTimingEvidenceService} from "../StrategyOneExecutionTimingEvidenceService";
import {StrategyOnePilotEquivalentPaperEvidenceService} from "../StrategyOnePilotEquivalentPaperEvidenceService";
import {StrategyOneTimingCalibrationService} from "../StrategyOneTimingCalibrationService";

const NOW = 1_780_800_000_000;

function opportunity(timestamp: number, buyAgeMs = 20, sellAgeMs = 15): ArbitrageOpportunity {
  return {
    id: `v110-${timestamp}`,
    pair: {
      market: "BTCUSDT",
      buy: {
        exchange: "binance",
        market: "BTCUSDT",
        lastPrice: 100,
        bestBidPrice: 99,
        bestBidQty: 10,
        bestAskPrice: 100,
        bestAskQty: 10,
        spread: 1,
        timestamp: timestamp - buyAgeMs,
        source: "orderBook",
        executable: true,
      },
      sell: {
        exchange: "bybit",
        market: "BTCUSDT",
        lastPrice: 102,
        bestBidPrice: 102,
        bestBidQty: 10,
        bestAskPrice: 103,
        bestAskQty: 10,
        spread: 1,
        timestamp: timestamp - sellAgeMs,
        source: "orderBook",
        executable: true,
      },
    },
    buyPrice: 100,
    sellPrice: 102,
    buyAvailableQty: 10,
    sellAvailableQty: 10,
    requiredQty: 1,
    availableExecutableQty: 10,
    executableQty: 1,
    liquidityScore: 100,
    enoughLiquidity: true,
    freshnessScore: 100,
    feeScore: 100,
    spreadScore: 100,
    decision: "EXECUTE",
    analysisSummary: [],
    rawSpread: 2,
    rawSpreadPercent: 2,
    estimatedFees: 0.2,
    netProfit: 1.8,
    netProfitPercent: 1.8,
    usedLastPriceFallback: false,
    quotesAreFresh: true,
    score: 100,
    timestamp,
  };
}

function capture(
  service: StrategyOneExecutionTimingEvidenceService,
  generatedAt: number,
  executionStartDelayMs = 9,
): void {
  const snapshot: OpportunitySnapshot = {
    generatedAt,
    opportunities: [opportunity(generatedAt)],
  };

  service.observePaperStage(snapshot, "PIPELINE_START", generatedAt + 5);
  service.observePaperStage(snapshot, "QUEUE_READY", generatedAt + 7);
  service.observePaperStage(snapshot, "EXECUTION_START", generatedAt + executionStartDelayMs);
  service.observePaperStage(snapshot, "EXECUTION_COMPLETE", generatedAt + executionStartDelayMs + 4);
}

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-v110-"));

  try {
    const evidence = new StrategyOneExecutionTimingEvidenceService({
      filePath: join(directory, "timing.jsonl"),
      minimumPublicSamples: 2,
      minimumPrivateFillSamplesPerVenue: 2,
      minimumObservationSpanMs: 1_000,
      minimumRouteSampleIntervalMs: 1,
      minimumAdvisoryBookAgeMs: 25,
      maximumAdvisoryBookAgeMs: 250,
      advisorySafetyMarginMs: 10,
    });
    capture(evidence, NOW);
    capture(evidence, NOW + 1_000);

    const emptyPilotEvidence = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath: join(directory, "pilot.jsonl"),
      minimumExecutionGradeGenerations: 2,
      minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000,
    });
    const blockedService = new StrategyOneTimingCalibrationService(
      evidence,
      join(directory, "blocked-calibrations.jsonl"),
      1_000,
      emptyPilotEvidence,
    );
    assert.throws(
      () => blockedService.propose("BTCUSDT:BINANCE->BYBIT", NOW + 1_500),
      /dispatch-reserved pilot freshness evidence is not proposal-ready/iu,
    );

    const noHeadroomEvidence = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath: join(directory, "no-headroom-pilot.jsonl"),
      minimumExecutionGradeGenerations: 2,
      minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000,
    });
    noHeadroomEvidence.observeSnapshot({generatedAt: NOW,
      opportunities: [opportunity(NOW, 245, 245)]}, NOW + 5);
    noHeadroomEvidence.observeSnapshot({generatedAt: NOW + 1_000,
      opportunities: [opportunity(NOW + 1_000, 245, 245)]}, NOW + 1_005);
    const noHeadroomService = new StrategyOneTimingCalibrationService(
      evidence,
      join(directory, "no-headroom-calibrations.jsonl"),
      1_000,
      noHeadroomEvidence,
    );
    assert.throws(
      () => noHeadroomService.propose("BTCUSDT:BINANCE->BYBIT", NOW + 1_500),
      /dispatch-reserved pilot freshness evidence is not proposal-ready/iu,
    );

    const thinMarginTimingEvidence = new StrategyOneExecutionTimingEvidenceService({
      filePath: join(directory, "thin-margin-timing.jsonl"),
      minimumPublicSamples: 2,
      minimumPrivateFillSamplesPerVenue: 2,
      minimumObservationSpanMs: 1_000,
      minimumRouteSampleIntervalMs: 1,
      minimumAdvisoryBookAgeMs: 25,
      maximumAdvisoryBookAgeMs: 250,
      advisorySafetyMarginMs: 10,
    });
    capture(thinMarginTimingEvidence, NOW, 240);
    capture(thinMarginTimingEvidence, NOW + 1_000, 240);

    const thinMarginEvidence = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath: join(directory, "thin-margin-pilot.jsonl"),
      minimumExecutionGradeGenerations: 2,
      minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000,
    });
    thinMarginEvidence.observeSnapshot({generatedAt: NOW,
      opportunities: [opportunity(NOW, 185, 185)]}, NOW + 5);
    thinMarginEvidence.observeSnapshot({generatedAt: NOW + 1_000,
      opportunities: [opportunity(NOW + 1_000, 185, 185)]}, NOW + 1_005);
    const thinMarginService = new StrategyOneTimingCalibrationService(
      thinMarginTimingEvidence,
      join(directory, "thin-margin-calibrations.jsonl"),
      1_000,
      thinMarginEvidence,
    );
    const thinMarginReview = thinMarginService.reviewHeadroom({
      market: "BTCUSDT",
      buyExchange: "binance",
      sellExchange: "bybit",
    }, NOW + 1_500);
    assert.equal(thinMarginReview.state, "READY");
    assert.equal(thinMarginReview.timingBasis, "TINY_LIVE_TRIGGER_BOOK_AGE");
    assert.equal(thinMarginReview.decisionToTinyLiveTriggerP99Ms, 5);
    assert.equal(
      thinMarginReview.downstreamPaperDecisionToExecutionStartP99Ms,
      240,
    );
    assert.equal(thinMarginReview.dispatchBudgetMs, 5);
    assert.equal(thinMarginReview.maximumBookAgeMs, 245);
    assert.equal(thinMarginReview.residualOperationalHeadroomMs, 55);
    assert.deepEqual(thinMarginReview.blockers, [],
      "Downstream PAPER execution delay must not be charged again after book age was already measured at the Tiny-LIVE trigger.");

    const controlledBoundaryTimingEvidence = new StrategyOneExecutionTimingEvidenceService({
      filePath: join(directory, "controlled-boundary-timing.jsonl"),
      minimumPublicSamples: 2,
      minimumPrivateFillSamplesPerVenue: 2,
      minimumObservationSpanMs: 1_000,
      minimumRouteSampleIntervalMs: 1,
      minimumAdvisoryBookAgeMs: 25,
      maximumAdvisoryBookAgeMs: 250,
      advisorySafetyMarginMs: 10,
    });
    capture(controlledBoundaryTimingEvidence, NOW, 50);
    capture(controlledBoundaryTimingEvidence, NOW + 1_000, 50);

    const controlledBoundaryPilotEvidence = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath: join(directory, "controlled-boundary-pilot.jsonl"),
      minimumExecutionGradeGenerations: 2,
      minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000,
    });
    controlledBoundaryPilotEvidence.observeSnapshot({generatedAt: NOW,
      opportunities: [opportunity(NOW, 185, 185)]}, NOW + 5);
    controlledBoundaryPilotEvidence.observeSnapshot({generatedAt: NOW + 1_000,
      opportunities: [opportunity(NOW + 1_000, 185, 185)]}, NOW + 1_005);
    const controlledBoundaryService = new StrategyOneTimingCalibrationService(
      controlledBoundaryTimingEvidence,
      join(directory, "controlled-boundary-calibrations.jsonl"),
      1_000,
      controlledBoundaryPilotEvidence,
    );
    const controlledBoundaryReview = controlledBoundaryService.reviewHeadroom({
      market: "BTCUSDT",
      buyExchange: "binance",
      sellExchange: "bybit",
    }, NOW + 1_500);
    assert.equal(controlledBoundaryReview.state, "READY");
    assert.equal(controlledBoundaryReview.absoluteBookAgeCeilingMs, 250);
    assert.equal(controlledBoundaryReview.dispatchSafetyMarginMs, 5);
    assert.equal(controlledBoundaryReview.requiredOperationalHeadroomMs, 5);
    assert.equal(controlledBoundaryReview.maximumBookAgeMs, 245);
    assert.equal(controlledBoundaryReview.residualOperationalHeadroomMs, 55,
      "Trigger-time freshness retains the fixed 5 ms post-trigger safety reserve without charging later PAPER work twice.");

    const pilotEvidence = new StrategyOnePilotEquivalentPaperEvidenceService({
      filePath: join(directory, "ready-pilot.jsonl"),
      minimumExecutionGradeGenerations: 2,
      minimumObservationSpanMs: 1_000,
      persistenceIntervalMs: 60_000,
    });
    pilotEvidence.observeSnapshot({generatedAt: NOW, opportunities: [opportunity(NOW)]}, NOW + 5);
    pilotEvidence.observeSnapshot({generatedAt: NOW + 1_000, opportunities: [opportunity(NOW + 1_000)]}, NOW + 1_005);

    const service = new StrategyOneTimingCalibrationService(
      evidence,
      join(directory, "calibrations.jsonl"),
      1_000,
      pilotEvidence,
    );
    const review = service.reviewHeadroom({
      market: "BTCUSDT",
      buyExchange: "binance",
      sellExchange: "bybit",
    }, NOW + 1_500);
    assert.equal(review.state, "READY");
    assert.equal(review.maximumBookAgeMs, 245);
    assert.equal(review.residualOperationalHeadroomMs, 220);
    assert.equal(review.safety.thresholdRelaxationAllowed, false);
    const proposal = service.propose("BTCUSDT:BINANCE->BYBIT", NOW + 1_500);

    assert.equal(proposal.status, "PROPOSED");
    assert.equal(
      proposal.timingPolicyRevision,
      "STRATEGY_ONE_TRIGGER_SYNC_5MS_V2",
    );
    assert.equal(proposal.maximumBookAgeMs, 245,
      "250 ms ceiling minus the fixed 5 ms post-trigger safety reserve must leave synchronized LIVE headroom.");
    assert.equal(proposal.scope, "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT");
    assert.equal(proposal.automaticActivationAllowed, false);
    assert.equal(
      service.getApprovedRouteCalibration({
        market: "BTCUSDT",
        buyExchange: "binance",
        sellExchange: "bybit",
        now: NOW + 1_501,
      }),
      null,
    );
    assert.throws(
      () => service.approve(proposal.id, "wrong phrase", NOW + 1_501),
      /exact Strategy #1 timing approval phrase/iu,
    );

    const approved = service.approve(
      proposal.id,
      proposal.requiredApprovalPhrase,
      NOW + 1_502,
    );
    assert.equal(approved.status, "APPROVED");

    const registry = new StrategyOneLiveVenueContractRegistry({
      isPrivateFillSessionReady: () => true,
      getApprovedRouteTtl: (input) =>
        service.getApprovedRouteCalibration(input)?.maximumBookAgeMs ?? null,
    });
    const context = {
      market: "BTCUSDT",
      buyExchange: "binance",
      sellExchange: "bybit",
    };

    assert.equal(
      registry.getOrderTimeSafetyContract("binance", context, NOW + 1_503)
        ?.maximumOrderBookAgeMs,
      245,
    );
    assert.equal(
      registry.getOrderTimeSafetyContract("binance", context, NOW + 2_503)
        ?.maximumOrderBookAgeMs,
      null,
      "Expired calibration must fail closed.",
    );

    const revoked = service.revoke(proposal.id, NOW + 1_504);
    assert.equal(revoked.status, "REVOKED");
    assert.equal(revoked.liveOrderSubmissionAuthorized, false);

    const batchService = new StrategyOneTimingCalibrationService(
      evidence,
      join(directory, "batch-calibrations.jsonl"),
      3 * 60 * 60_000,
      pilotEvidence,
    );
    const batchProposal = batchService.propose(
      "BTCUSDT:BINANCE->BYBIT",
      NOW + 1_600,
      2,
    );
    assert.equal(batchProposal.scope, "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH");
    assert.equal(
      batchProposal.requiredApprovalPhrase,
      `APPROVE ${batchProposal.id} ATTEMPTS2 HOURS3`,
    );
    assert.notEqual(batchProposal.id, proposal.id);
    const batchApproved = batchService.approve(
      batchProposal.id,
      batchProposal.requiredApprovalPhrase,
      NOW + 1_601,
    );
    assert.equal(batchApproved.expiresAt, NOW + 1_601 + 3 * 60 * 60_000);
    const diagnostics = batchService.getDiagnostics(NOW + 1_602);
    assert.equal(
      diagnostics.controlledBatchHeadroom.routeKey,
      "COTIUSDT:coindcx->binance",
      "The dashboard must receive the exact controlled-batch headroom review before an operator clicks propose.",
    );
    assert.equal(
      diagnostics.controlledBatchHeadroom.safety.thresholdRelaxationAllowed,
      false,
    );
    assert.equal(
      diagnostics.pilotBasketHeadroom.length,
      0,
      "The retired fixed basket must not manufacture route-level timing reviews.",
    );
    assert.equal(
      diagnostics.pilotBasketHeadroom.every((review) =>
        review.safety.liveOrderSubmissionAuthorized === false),
      true,
    );
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "V110 Strategy #1 route timing calibration requires clean evidence, exact review, bounded expiry and explicit revocation; it never grants order authority.",
  );
}

main();
