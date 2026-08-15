import assert from "node:assert/strict";

import type {
  DerivativeAccountEvidenceSnapshot,
  DerivativeVenueAccountEvidence,
} from "../../derivatives/models/DerivativeAccountEvidence";

import type {
  DerivativeFeeEvidenceSnapshot,
} from "../../derivatives/models/DerivativeFeeEvidence";

import {
  createFundingRateArbitrageConfiguration,
} from "../funding-rate-arbitrage/FundingRateArbitrageConfiguration";

import type {
  FundingRateArbitrageEconomicsSnapshot,
} from "../funding-rate-arbitrage/FundingRateArbitrageEconomicsEngine";

import {
  FundingRatePaperClosureObservabilityService,
  type FundingRatePaperClosurePort,
} from "../funding-rate-arbitrage/FundingRatePaperClosureObservabilityService";

const now = 1_800_000_000_000;
const configuration = createFundingRateArbitrageConfiguration({
  enabled: true,
  targetQuoteNotional: 1_000,
  minimumFundingDifferentialPercent: 0.01,
  minimumExpectedNetPercent: 0.05,
});

const economics: FundingRateArbitrageEconomicsSnapshot = {
  generatedAt: now - 10,
  sourceSnapshotGeneratedAt: now - 20,
  evaluatedRoutes: 1,
  qualifiedRoutes: 0,
  blockedRoutes: 1,
  assessments: [{
    id: "BTCUSDT:binance:bybit:snapshot",
    market: "BTCUSDT",
    firstExchange: "binance",
    secondExchange: "bybit",
    status: "BLOCKED",
    blockers: ["FUNDING_DIFFERENTIAL_TOO_LOW", "FUNDING_CARRY_HORIZON_EXCEEDED", "EXPECTED_NET_THRESHOLD_NOT_MET"],
    differential: {
      market: "BTCUSDT",
      longExchange: "binance",
      shortExchange: "bybit",
      longFundingRate: 0.00005,
      shortFundingRate: 0.000098,
      fundingDifferentialPercent: 0.0048,
      minimumFundingDifferentialPercent: 0.01,
      longFundingIntervalMinutes: 480,
      shortFundingIntervalMinutes: 480,
      nextFundingTimeLong: now + 3_600_000,
      nextFundingTimeShort: now + 3_600_000,
      fundingTimeSkewMs: 0,
    },
    economics: {
      quantity: 0.01,
      longEntryVwap: 63_400,
      shortEntryVwap: 63_399,
      longNotional: 634,
      shortNotional: 633.99,
      referenceNotional: 633.99,
      singlePeriodExpectedFundingQuote: 0.03043152,
      singlePeriodExpectedFundingPercent: 0.0048,
      modeledFundingPeriods: 6,
      minimumQualifyingFundingPeriods: 65,
      maximumFundingPeriodsToCapture: 6,
      projectedHoldingTimeMs: 147_600_000,
      expectedFundingQuote: 0.18258912,
      expectedFundingPercent: 0.0288,
      entryBasisCostQuote: 0.01,
      entryBasisCostPercent: 0.0015773,
      roundTripFeeQuote: 1.331379,
      roundTripFeePercent: 0.21,
      safetyBufferQuote: 0.316995,
      safetyBufferPercent: 0.05,
      expectedNetQuote: -1.47578488,
      expectedNetPercent: -0.232777311945,
      minimumExpectedNetPercent: 0.05,
      thresholdShortfallPercent: 0.282777311945,
    },
    evidence: null,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
  }],
  safety: {
    expectedFundingNotGuaranteed: true,
    favorableEntryBasisExcluded: true,
    roundTripFeesReserved: true,
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
  evidence: [{
    exchange: "binance",
    product: "LINEAR_PERPETUAL",
    makerPercent: 0.02,
    takerPercent: 0.05,
    source: "EXPLICIT_OPERATOR_CONFIG",
    configuredAt: now,
    executionAuthorized: false,
    liveExecutionAllowed: false,
  }, {
    exchange: "bybit",
    product: "LINEAR_PERPETUAL",
    makerPercent: 0.02,
    takerPercent: 0.055,
    source: "EXPLICIT_OPERATOR_CONFIG",
    configuredAt: now,
    executionAuthorized: false,
    liveExecutionAllowed: false,
  }],
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
  let admissions: ReturnType<FundingRatePaperClosurePort["getAdmissions"]> = [];
  let intake: ReturnType<FundingRatePaperClosurePort["getIntake"]> = [];
  const port: FundingRatePaperClosurePort = {
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
  const service = new FundingRatePaperClosureObservabilityService(port, 1_000);

  const evidenceBlocked = service.getReport(now);
  assert.equal(evidenceBlocked.version, "88.0");
  assert.equal(evidenceBlocked.state, "DERIVATIVE_EVIDENCE_BLOCKED");
  assert.equal(evidenceBlocked.derivativeEvidence.authenticatedReadReadyVenues, 1);
  assert.equal(evidenceBlocked.derivativeEvidence.targetMarginCoveredVenues, 0);
  assert.equal(evidenceBlocked.derivativeEvidence.paperEvidenceReadyRoutes, 0);
  assert.equal(evidenceBlocked.economics.differentialEvaluableRoutes, 1);
  assert.equal(evidenceBlocked.economics.differentialQualifiedRoutes, 0);
  assert.equal(evidenceBlocked.economics.bestDifferentialRoute?.differential.fundingDifferentialPercent, 0.0048);
  assert.equal(evidenceBlocked.economics.bestNetRoute?.economics?.expectedNetPercent, -0.232777311945);
  assert.equal(evidenceBlocked.economics.maximumFundingPeriodsToCapture, 6);

  account = accountSnapshot({
    binanceReady: true,
    bybitReady: true,
    binanceMargin: 1_500,
    bybitMargin: 1_500,
  });
  const waiting = service.getReport(now);
  assert.equal(waiting.state, "WAITING_FOR_FUNDING_EDGE");
  assert.equal(waiting.derivativeEvidence.paperEvidenceReadyVenues, 2);
  assert.equal(waiting.derivativeEvidence.paperEvidenceReadyRoutes, 1);

  currentSignals = 1;
  admissions = [{generatedAt: now - 100, strategyId: configuration.strategyId,
    decision: "SHADOW_SIGNAL_ADMITTED", plan: {id: "funding-plan"}}];
  intake = [{generatedAt: now - 50, strategyId: configuration.strategyId,
    planId: "funding-plan", state: "BLOCKED", blockers: ["DERIVATIVE_AVAILABLE_MARGIN_INSUFFICIENT"]}];
  const paperBlocked = service.getReport(now);
  assert.equal(paperBlocked.state, "PAPER_BLOCKED");
  assert.equal(paperBlocked.lineage.plansAdmitted, 1);
  assert.deepEqual(paperBlocked.lineage.latestPlanIntakeBlockers,
    ["DERIVATIVE_AVAILABLE_MARGIN_INSUFFICIENT"]);
  assert.equal(paperBlocked.safety.balanceOrMarginInferenceAllowed, false);
  assert.equal(paperBlocked.safety.expectedFundingNotGuaranteed, true);
  assert.equal(paperBlocked.safety.projectedFundingRatePersistenceRequired, true);
  assert.equal(paperBlocked.safety.roundTripFeesReserved, true);
  assert.equal(paperBlocked.safety.profitabilityThresholdMutated, false);
  assert.equal(paperBlocked.safety.signalFabricationAllowed, false);
  assert.equal(paperBlocked.safety.liveExecutionAllowed, false);
  assert.equal(paperBlocked.safety.orderSubmissionAllowed, false);

  console.log("FUNDING-RATE PAPER CLOSURE OBSERVABILITY TEST PASSED.");
  console.log("Exact funding differential, round-trip costs, signed account/margin gates and central lineage remained read-only; no credential, threshold, PAPER, LIVE or order action was manufactured.");
}

main();
