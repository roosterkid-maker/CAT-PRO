import assert from "node:assert/strict";

import type {
  DerivativeAccountEvidenceSnapshot,
  DerivativeVenueAccountEvidence,
} from "../../derivatives/models/DerivativeAccountEvidence";

import type {
  DerivativeFeeEvidenceSnapshot,
} from "../../derivatives/models/DerivativeFeeEvidence";

import {
  createSpotPerpetualBasisConfiguration,
} from "../spot-perpetual-basis-arbitrage/SpotPerpetualBasisConfiguration";

import type {
  SpotPerpetualBasisEconomicsSnapshot,
} from "../spot-perpetual-basis-arbitrage/SpotPerpetualBasisEconomicsEngine";

import {
  SpotPerpetualBasisPaperClosureObservabilityService,
  type SpotPerpetualBasisPaperClosurePort,
} from "../spot-perpetual-basis-arbitrage/SpotPerpetualBasisPaperClosureObservabilityService";

const now = 1_800_000_000_000;
const configuration = createSpotPerpetualBasisConfiguration({
  enabled: true,
  targetQuoteCapital: 1_000,
  minimumExpectedNetPercent: 0.25,
});

const economics: SpotPerpetualBasisEconomicsSnapshot = {
  generatedAt: now - 10,
  sourceSnapshotGeneratedAt: now - 20,
  evaluatedRoutes: 2,
  qualifiedRoutes: 0,
  blockedRoutes: 2,
  assessments: [{
    id: "binance:BTCUSDT:snapshot",
    exchange: "binance",
    market: "BTCUSDT",
    status: "BLOCKED",
    blockers: ["EXPECTED_NET_THRESHOLD_NOT_MET"],
    economics: {
      quantity: 10,
      spotBuyVwap: 100,
      perpetualSellVwap: 100.2,
      grossBasisPercent: 0.2,
      totalFeeQuote: 2,
      totalFeePercent: 0.2,
      fundingRate: 0.0005,
      expectedFundingQuote: 0.5,
      expectedFundingPercent: 0.05,
      safetyBufferQuote: 2,
      safetyBufferPercent: 0.2,
      expectedNetQuote: -1.5,
      expectedNetPercent: -0.15,
      minimumExpectedNetPercent: 0.25,
      thresholdShortfallPercent: 0.4,
    },
    evidence: null,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
  }, {
    id: "bybit:ETHUSDT:snapshot",
    exchange: "bybit",
    market: "ETHUSDT",
    status: "BLOCKED",
    blockers: ["DERIVATIVE_DEPTH_MISSING"],
    economics: null,
    evidence: null,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
  }],
  safety: {
    expectedFundingNotGuaranteed: true,
    shadowOnly: true,
    positionEvidenceRequiredBeforeExecution: true,
    marginEvidenceRequiredBeforeExecution: true,
    liquidationControlRequiredBeforeExecution: true,
    paperExecutionAllowed: false,
    liveExecutionAllowed: false,
    orderSubmissionAllowed: false,
  },
};

function venue(exchange: "binance" | "bybit", availableMargin: number): DerivativeVenueAccountEvidence {
  return {
    exchange,
    product: "LINEAR_PERPETUAL",
    settlementAsset: "USDT",
    availableMargin,
    availableMarginUnit: exchange === "binance" ? "USDT" : "ACCOUNT_USD_VALUE",
    walletBalance: availableMargin,
    totalEquity: availableMargin,
    totalInitialMargin: 0,
    totalMaintenanceMargin: 0,
    positions: configuration.markets.map((market) => ({
      exchange,
      market,
      product: "LINEAR_PERPETUAL" as const,
      positionSide: "FLAT" as const,
      signedQuantity: 0,
      entryPrice: null,
      markPrice: null,
      liquidationPrice: null,
      leverage: 10,
      positionStatus: null,
      source: "AUTHENTICATED_READ_ONLY_REST" as const,
      sourceEndpoint: "SIGNED GET",
      observedAt: now,
    })),
    marginSourceEndpoint: "SIGNED GET /balance",
    positionSourceEndpoint: "SIGNED GET /positions",
    observedAt: now,
    expiresAt: now + 30_000,
    authenticatedReadVerified: true,
    positionReadVerified: true,
    orderSubmissionAllowed: false,
    liveExecutionAllowed: false,
  };
}

function accountSnapshot(input: {
  binanceReady: boolean;
  bybitReady: boolean;
  binanceMargin: number;
  bybitMargin: number;
}): DerivativeAccountEvidenceSnapshot {
  const definitions = [
    {exchange: "binance" as const, ready: input.binanceReady, margin: input.binanceMargin},
    {exchange: "bybit" as const, ready: input.bybitReady, margin: input.bybitMargin},
  ];
  return {
    version: "49.0",
    generatedAt: now,
    mode: "AUTHENTICATED_READ_ONLY_DERIVATIVE_ACCOUNT_EVIDENCE",
    configuredMarkets: [...configuration.markets],
    freshnessThresholdMs: 30_000,
    providers: definitions.map((item) => ({
      exchange: item.exchange,
      state: item.ready ? "READY" as const : "NO_DATA" as const,
      configured: true,
      lastAttemptAt: now,
      lastSuccessAt: item.ready ? now : null,
      retainedUntil: item.ready ? now + 30_000 : null,
      positionMarkets: item.ready ? configuration.markets.length : 0,
      lastError: item.ready ? null : `${item.exchange} signed read rejected`,
    })),
    evidence: definitions.filter((item) => item.ready)
      .map((item) => venue(item.exchange, item.margin)),
    safety: {
      signedGetOnly: true,
      credentialValuesExposed: false,
      balanceInferenceAllowed: false,
      positionInferenceAllowed: false,
      orderSubmissionAllowed: false,
      liveExecutionAllowed: false,
    },
  };
}

const feeSnapshot: DerivativeFeeEvidenceSnapshot = {
  generatedAt: now,
  version: "27.0",
  evidenceStatus: "AVAILABLE",
  expectedExchanges: ["binance", "bybit"],
  configuredExchanges: 2,
  evidence: ["binance", "bybit"].map((exchange) => ({
    exchange,
    product: "LINEAR_PERPETUAL" as const,
    makerPercent: 0.02,
    takerPercent: 0.05,
    source: "EXPLICIT_OPERATOR_CONFIG" as const,
    configuredAt: now,
    executionAuthorized: false,
    liveExecutionAllowed: false,
  })),
  missingExchanges: [],
  safety: {
    undocumentedDefaultAllowed: false,
    feeInferenceAllowed: false,
    orderSubmissionAllowed: false,
    liveExecutionAllowed: false,
  },
};

function main(): void {
  let currentSignals = 0;
  let account = accountSnapshot({
    binanceReady: false,
    bybitReady: true,
    binanceMargin: 0,
    bybitMargin: 0,
  });
  let admissions: ReturnType<SpotPerpetualBasisPaperClosurePort["getAdmissions"]> = [];
  let intake: ReturnType<SpotPerpetualBasisPaperClosurePort["getIntake"]> = [];
  const port: SpotPerpetualBasisPaperClosurePort = {
    getConfiguration: () => configuration,
    getRuntime: () => ({running: true, currentSignalCount: currentSignals,
      totalSignalsObserved: currentSignals, lastSignalObservedAt: currentSignals > 0 ? now - 100 : null}),
    getEconomics: () => structuredClone(economics),
    getAccountEvidence: () => structuredClone(account),
    getFeeEvidence: () => structuredClone(feeSnapshot),
    getAdmissions: () => admissions,
    getIntake: () => intake,
    getQueue: () => [],
  };
  const service = new SpotPerpetualBasisPaperClosureObservabilityService(port, 1_000);

  const evidenceBlocked = service.getReport(now);
  assert.equal(evidenceBlocked.version, "69.0");
  assert.equal(evidenceBlocked.state, "DERIVATIVE_EVIDENCE_BLOCKED");
  assert.equal(evidenceBlocked.derivativeEvidence.authenticatedReadReadyVenues, 1);
  assert.equal(evidenceBlocked.derivativeEvidence.targetMarginCoveredVenues, 0);
  assert.equal(evidenceBlocked.derivativeEvidence.paperEvidenceReadyVenues, 0);
  assert.equal(evidenceBlocked.derivativeEvidence.venues.find((item) => item.exchange === "binance")?.lastError,
    "binance signed read rejected");
  assert.equal(evidenceBlocked.economics.economicallyEvaluableRoutes, 1);
  assert.equal(evidenceBlocked.economics.bestRoute?.expectedNetPercent, -0.15);
  assert.equal(evidenceBlocked.economics.bestRoute?.thresholdShortfallPercent, 0.4);

  account = accountSnapshot({
    binanceReady: true,
    bybitReady: true,
    binanceMargin: 1_500,
    bybitMargin: 1_500,
  });
  const waiting = service.getReport(now);
  assert.equal(waiting.state, "WAITING_FOR_QUALIFIED_EDGE");
  assert.equal(waiting.derivativeEvidence.paperEvidenceReadyVenues, 2);

  currentSignals = 1;
  admissions = [{generatedAt: now - 100, strategyId: configuration.strategyId,
    decision: "SHADOW_SIGNAL_ADMITTED", plan: {id: "basis-plan"}}];
  intake = [{generatedAt: now - 50, strategyId: configuration.strategyId,
    planId: "basis-plan", state: "BLOCKED", blockers: ["DERIVATIVE_AVAILABLE_MARGIN_INSUFFICIENT"]}];
  const paperBlocked = service.getReport(now);
  assert.equal(paperBlocked.state, "PAPER_BLOCKED");
  assert.equal(paperBlocked.lineage.plansAdmitted, 1);
  assert.deepEqual(paperBlocked.lineage.latestPlanIntakeBlockers,
    ["DERIVATIVE_AVAILABLE_MARGIN_INSUFFICIENT"]);
  assert.equal(paperBlocked.safety.balanceOrMarginInferenceAllowed, false);
  assert.equal(paperBlocked.safety.profitabilityThresholdMutated, false);
  assert.equal(paperBlocked.safety.signalFabricationAllowed, false);
  assert.equal(paperBlocked.safety.paperExecutionTriggeredByRead, false);
  assert.equal(paperBlocked.safety.liveExecutionAllowed, false);
  assert.equal(paperBlocked.safety.orderSubmissionAllowed, false);

  console.log("SPOT-PERPETUAL BASIS PAPER CLOSURE OBSERVABILITY TEST PASSED.");
  console.log("Exact route economics, signed-read state, target margin and central lineage remained read-only; no credential, threshold, PAPER, LIVE or order action was manufactured.");
}

main();
