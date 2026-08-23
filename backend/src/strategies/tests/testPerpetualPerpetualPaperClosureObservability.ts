import assert from "node:assert/strict";

import type {
  DerivativeAccountEvidenceSnapshot,
  DerivativeVenueAccountEvidence,
} from "../../derivatives/models/DerivativeAccountEvidence";

import type {
  DerivativeFeeEvidenceSnapshot,
} from "../../derivatives/models/DerivativeFeeEvidence";

import {
  createPerpetualPerpetualArbitrageConfiguration,
} from "../perpetual-perpetual-arbitrage/PerpetualPerpetualArbitrageConfiguration";

import type {
  PerpetualPerpetualArbitrageEconomicsSnapshot,
} from "../perpetual-perpetual-arbitrage/PerpetualPerpetualArbitrageEconomicsEngine";

import {
  PerpetualPerpetualPaperClosureObservabilityService,
  type PerpetualPerpetualPaperClosurePort,
} from "../perpetual-perpetual-arbitrage/PerpetualPerpetualPaperClosureObservabilityService";

const now = 1_800_000_000_000;
const configuration = createPerpetualPerpetualArbitrageConfiguration({
  enabled: true,
  targetQuoteNotional: 1_000,
  minimumGrossDislocationPercent: 0.2,
  minimumExpectedNetPercent: 0.05,
});

const economics: PerpetualPerpetualArbitrageEconomicsSnapshot = {
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
    blockers: ["GROSS_DISLOCATION_TOO_LOW", "EXPECTED_NET_THRESHOLD_NOT_MET"],
    dislocation: {
      market: "BTCUSDT",
      longExchange: "binance",
      shortExchange: "bybit",
      longBestAsk: 100.1,
      shortBestBid: 100.15,
      grossTopDislocationPercent: 0.04995,
      minimumGrossDislocationPercent: 0.2,
      longFundingRate: 0.001,
      shortFundingRate: 0.001,
      nextFundingTimeLong: now + 3_600_000,
      nextFundingTimeShort: now + 3_600_000,
    },
    economics: {
      quantity: 10,
      longEntryVwap: 100.2,
      shortEntryVwap: 100.1,
      longNotional: 1_002,
      shortNotional: 1_001,
      referenceNotional: 1_001,
      grossDislocationQuote: -1,
      grossDislocationPercent: -0.0998,
      roundTripFeeQuote: 2.1031,
      roundTripFeePercent: 0.2101,
      adverseFundingReserveQuote: 2.002,
      adverseFundingReservePercent: 0.2,
      adverseFundingPeriodsReserved: 1,
      safetyBufferQuote: 0.5005,
      safetyBufferPercent: 0.05,
      expectedNetQuote: -5.6056,
      expectedNetPercent: -0.559999,
      minimumExpectedNetPercent: 0.05,
      thresholdShortfallPercent: 0.609999,
    },
    evidence: null,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
  }],
  safety: {
    convergenceNotGuaranteed: true,
    roundTripFeesReserved: true,
    adverseFundingReserved: true,
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
      market: null,
    product: "LINEAR_PERPETUAL",
    makerPercent: 0.02,
    takerPercent: 0.05,
    source: "EXPLICIT_OPERATOR_CONFIG",
    configuredAt: now,
    executionAuthorized: false,
    liveExecutionAllowed: false,
  }, {
      exchange: "bybit",
      market: null,
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
  let admissions: ReturnType<PerpetualPerpetualPaperClosurePort["getAdmissions"]> = [];
  let intake: ReturnType<PerpetualPerpetualPaperClosurePort["getIntake"]> = [];
  const port: PerpetualPerpetualPaperClosurePort = {
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
  const service = new PerpetualPerpetualPaperClosureObservabilityService(port, 1_000);

  const evidenceBlocked = service.getReport(now);
  assert.equal(evidenceBlocked.version, "71.0");
  assert.equal(evidenceBlocked.state, "DERIVATIVE_EVIDENCE_BLOCKED");
  assert.equal(evidenceBlocked.derivativeEvidence.authenticatedReadReadyVenues, 1);
  assert.equal(evidenceBlocked.derivativeEvidence.targetMarginCoveredVenues, 0);
  assert.equal(evidenceBlocked.derivativeEvidence.paperEvidenceReadyRoutes, 0);
  assert.equal(evidenceBlocked.economics.dislocationEvaluableRoutes, 1);
  assert.equal(evidenceBlocked.economics.grossQualifiedRoutes, 0);
  assert.equal(evidenceBlocked.economics.bestGrossRoute?.dislocation?.grossTopDislocationPercent, 0.04995);
  assert.equal(evidenceBlocked.economics.bestNetRoute?.economics?.expectedNetPercent, -0.559999);

  account = accountSnapshot({
    binanceReady: true,
    bybitReady: true,
    binanceMargin: 1_500,
    bybitMargin: 1_500,
  });
  const waiting = service.getReport(now);
  assert.equal(waiting.state, "WAITING_FOR_DISLOCATION");
  assert.equal(waiting.derivativeEvidence.paperEvidenceReadyVenues, 2);
  assert.equal(waiting.derivativeEvidence.paperEvidenceReadyRoutes, 1);

  currentSignals = 1;
  admissions = [{generatedAt: now - 100, strategyId: configuration.strategyId,
    decision: "SHADOW_SIGNAL_ADMITTED", plan: {id: "perpetual-plan"}}];
  intake = [{generatedAt: now - 50, strategyId: configuration.strategyId,
    planId: "perpetual-plan", state: "BLOCKED", blockers: ["DERIVATIVE_AVAILABLE_MARGIN_INSUFFICIENT"]}];
  const paperBlocked = service.getReport(now);
  assert.equal(paperBlocked.state, "PAPER_BLOCKED");
  assert.equal(paperBlocked.lineage.plansAdmitted, 1);
  assert.deepEqual(paperBlocked.lineage.latestPlanIntakeBlockers,
    ["DERIVATIVE_AVAILABLE_MARGIN_INSUFFICIENT"]);
  assert.equal(paperBlocked.safety.balanceOrMarginInferenceAllowed, false);
  assert.equal(paperBlocked.safety.convergenceNotGuaranteed, true);
  assert.equal(paperBlocked.safety.roundTripFeesReserved, true);
  assert.equal(paperBlocked.safety.adverseFundingReserved, true);
  assert.equal(paperBlocked.safety.profitabilityThresholdMutated, false);
  assert.equal(paperBlocked.safety.signalFabricationAllowed, false);
  assert.equal(paperBlocked.safety.liveExecutionAllowed, false);
  assert.equal(paperBlocked.safety.orderSubmissionAllowed, false);

  console.log("PERPETUAL-PERPETUAL PAPER CLOSURE OBSERVABILITY TEST PASSED.");
  console.log("Exact dislocation, full-depth economics, funding reserve, signed margin gates and central lineage remained read-only; no threshold, signal, PAPER, LIVE or order action was manufactured.");
}

main();
