import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  exchangeOrderValidator,
} from "../../execution/capabilities/validation/ExchangeOrderValidator";

import {
  liveExecutionService,
} from "../../execution/live/LiveExecutionService";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  riskEngine,
} from "../../risk/services/RiskEngine";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import type {
  LiveCandidateEligibilityGate,
  LiveCandidateEligibilityRequest,
  LiveCandidateEligibilityResult,
} from "../models/LiveCandidateEligibility";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  paperAutomationAccountingService,
} from "./PaperAutomationAccountingService";

import {
  paperPortfolioOptimizerService,
} from "./PaperPortfolioOptimizerService";

import {
  shadowPerformanceAnalyticsService,
} from "./ShadowPerformanceAnalyticsService";

const MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL =
  100;

export class LiveCandidateEligibilityService {
  async evaluate(
    request:
      LiveCandidateEligibilityRequest,
  ): Promise<
    LiveCandidateEligibilityResult
  > {
    const generatedAt =
      Date.now();

    const candidateKey =
      request
        .candidateKey
        .trim();

    const capital =
      request.capital;

    const gates:
      LiveCandidateEligibilityGate[] =
      [];

    const validRequest =
      candidateKey.length >
        0 &&
      Number.isFinite(
        capital,
      ) &&
      capital >
        0;

    gates.push(
      this.gate(
        "VALID_REQUEST",

        validRequest,

        "Candidate key and validation capital are valid.",

        "Candidate key is required and capital must be a positive finite number.",
      ),
    );

    gates.push(
      this.gate(
        "TINY_LIVE_CAPITAL_CAP",

        Number.isFinite(
          capital,
        ) &&
          capital >
            0 &&
          capital <=
            MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL,

        `Validation capital is within the Version 17.0 ₹${MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL} safety cap.`,

        `Version 17.0 candidate validation capital must not exceed ₹${MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL}.`,
      ),
    );

    const account =
      tradingAccountService
        .getAccount();

    const coordinator =
      liveExecutionCoordinator
        .getDiagnostics();

    const shadow =
      shadowPerformanceAnalyticsService
        .getAnalytics();

    const accounting =
      paperAutomationAccountingService
        .getDiagnostics();

    gates.push(
      this.gate(
        "ACCOUNT_ENABLED",

        account.enabled,

        "Trading account is enabled.",

        "Trading account is disabled.",
      ),

      this.gate(
        "LIVE_ACCOUNT_MODE",

        account.mode ===
          "LIVE",

        "Trading account is explicitly in LIVE mode.",

        `Trading account mode is ${account.mode}; LIVE mode is required before any future submission.`,
      ),

      this.gate(
        "EMERGENCY_STOP_CLEAR",

        !account
          .emergencyStop,

        "Emergency stop is clear.",

        "Emergency stop is active.",
      ),

      this.gate(
        "GLOBAL_LIVE_CONFIRMATION",

        coordinator
          .liveExecutionConfirmed,

        "Existing global LIVE confirmation is present.",

        "Existing global LIVE confirmation is not present.",
      ),

      {
        key:
          "SESSION_LIVE_CONFIRMATION",

        state:
          "NOT_IMPLEMENTED",

        required:
          true,

        message:
          "Version 17.0 does not expose session-level LIVE arming yet.",
      },

      this.gate(
        "SHADOW_READINESS",

        shadow
          .readiness
          .readyForPaperAutomation,

        "Existing shadow readiness policy has passed.",

        `Shadow readiness is ${shadow.readiness.level} with score ${shadow.readiness.score}.`,
      ),

      this.gate(
        "PAPER_HISTORY_PRESENT",

        accounting
          .totalEntries >
          0,

        "Automated paper execution evidence exists.",

        "No automated paper execution evidence exists yet.",
      ),

      this.gate(
        "ACCOUNTING_INTEGRITY",

        this.accountingIntegrityPassed(
          accounting.integrity,
        ),

        "Paper automation accounting integrity passes.",

        "Paper automation accounting integrity has one or more failures.",
      ),

      this.gate(
        "NO_ACTIVE_LIVE_SESSION",

        coordinator
          .activeSessions ===
          0,

        "No active LIVE execution session exists.",

        `${coordinator.activeSessions} active LIVE execution session(s) exist.`,
      ),
    );

    const qualification =
      candidateKey.length >
      0
        ? candidateQualificationService
            .getQualification(
              candidateKey,
            )
        : null;

    gates.push(
      this.gate(
        "CANDIDATE_EXISTS",

        qualification !==
          null,

        "Monitored automation candidate exists.",

        "Monitored automation candidate was not found.",
      ),

      this.gate(
        "CANDIDATE_QUALIFIED",

        qualification
          ?.qualified ===
          true,

        "Candidate passes the existing Version 15.2 qualification policy.",

        qualification
          ? `Candidate qualification status is ${qualification.status} with score ${qualification.score}.`
          : "Candidate cannot be qualified because it was not found.",
      ),
    );

    const market =
      qualification
        ?.market ??
      null;

    const buyExchange =
      qualification
        ?.buyExchange ??
      null;

    const sellExchange =
      qualification
        ?.sellExchange ??
      null;

    const routeEvidence =
      buyExchange &&
      sellExchange
        ? paperPortfolioOptimizerService
            .evaluateRoute(
              buyExchange,
              sellExchange,
            )
        : null;

    gates.push(
      this.gate(
        "ROUTE_NOT_BLOCKED",

        routeEvidence !==
          null &&
          routeEvidence
            .status !==
            "BLOCKED",

        routeEvidence
          ? `Route status is ${routeEvidence.status}; Version 16.5 does not block it.`
          : "Route evidence is available and not blocked.",

        routeEvidence
          ? `Version 16.5 route status is ${routeEvidence.status}.`
          : "Route evidence could not be evaluated without a valid candidate route.",
      ),
    );

    const currentOpportunity =
      market &&
      buyExchange &&
      sellExchange
        ? this.findCurrentOpportunity(
            market,
            buyExchange,
            sellExchange,
          )
        : null;

    gates.push(
      this.gate(
        "EXACT_CURRENT_OPPORTUNITY",

        currentOpportunity !==
          null,

        "A fresh exact opportunity exists for the candidate route.",

        "No fresh exact opportunity exists for the candidate route right now.",
      ),
    );

    const pairIntegrity =
      currentOpportunity
        ? freshnessIntegrityService
            .evaluatePair(
              currentOpportunity
                .pair
                .buy,

              currentOpportunity
                .pair
                .sell,

              generatedAt,
            )
        : null;

    gates.push(
      this.gate(
        "BUY_QUOTE_FRESH",

        pairIntegrity
          ?.buy
          .fresh ===
          true,

        "Buy-side executable quote is fresh.",

        pairIntegrity
          ? `Buy-side quote freshness failed: ${pairIntegrity.buy.reason}.`
          : "Buy-side quote freshness cannot be evaluated without a current opportunity.",
      ),

      this.gate(
        "SELL_QUOTE_FRESH",

        pairIntegrity
          ?.sell
          .fresh ===
          true,

        "Sell-side executable quote is fresh.",

        pairIntegrity
          ? `Sell-side quote freshness failed: ${pairIntegrity.sell.reason}.`
          : "Sell-side quote freshness cannot be evaluated without a current opportunity.",
      ),

      this.gate(
        "PAIR_SYNCHRONIZED",

        pairIntegrity
          ?.synchronized ===
          true,

        pairIntegrity
          ? `Cross-exchange timestamps are synchronized within ${pairIntegrity.maximumPairSkewMs} ms.`
          : "Cross-exchange timestamps are synchronized.",

        pairIntegrity
          ? `Timestamp skew is ${pairIntegrity.timestampSkewMs ?? "unavailable"} ms; maximum is ${pairIntegrity.maximumPairSkewMs} ms.`
          : "Pair synchronization cannot be evaluated without a current opportunity.",
      ),
    );

    const buyBookValid =
      currentOpportunity
        ? this.isCurrentBookValid(
            currentOpportunity
              .pair
              .buy
              .exchange,

            currentOpportunity
              .pair
              .market,
          )
        : false;

    const sellBookValid =
      currentOpportunity
        ? this.isCurrentBookValid(
            currentOpportunity
              .pair
              .sell
              .exchange,

            currentOpportunity
              .pair
              .market,
          )
        : false;

    gates.push(
      this.gate(
        "BUY_BOOK_INTEGRITY",

        buyBookValid,

        "Buy-side order book exists and is executable/non-crossed.",

        "Buy-side order book is missing, empty, invalid, or crossed.",
      ),

      this.gate(
        "SELL_BOOK_INTEGRITY",

        sellBookValid,

        "Sell-side order book exists and is executable/non-crossed.",

        "Sell-side order book is missing, empty, invalid, or crossed.",
      ),
    );

    const simulation =
      currentOpportunity &&
      Number.isFinite(
        capital,
      ) &&
      capital >
        0
        ? executionSimulator
            .simulate({
              market:
                currentOpportunity
                  .pair
                  .market,

              buyExchange:
                currentOpportunity
                  .pair
                  .buy
                  .exchange,

              sellExchange:
                currentOpportunity
                  .pair
                  .sell
                  .exchange,

              capital,
            })
        : null;

    const simulationData =
      simulation
        ?.success &&
      simulation
        .simulation
        ? simulation
            .simulation
        : null;

    gates.push(
      this.gate(
        "EXECUTION_SIMULATION",

        simulationData !==
          null,

        "Existing ExecutionSimulator produced a complete simulation.",

        simulation
          ?.failureReason ??
          "Execution simulation could not be completed.",
      ),

      this.gate(
        "SIMULATION_DECISION_EXECUTE",

        simulationData
          ?.decision
          .recommendation ===
          "EXECUTE",

        "Existing execution decision recommends EXECUTE.",

        simulationData
          ? `Existing execution decision is ${simulationData.decision.recommendation}.`
          : "Execution decision is unavailable because simulation did not complete.",
      ),

      this.gate(
        "POSITIVE_NET_PROFIT_AFTER_COSTS",

        (
          simulationData
            ?.profit
            .breakdown
            .netProfit ??
          0
        ) >
          0,

        "Simulated net profit after modeled costs is positive.",

        "Simulated net profit after modeled costs is not positive or unavailable.",
      ),

      this.gate(
        "FULL_EXECUTABLE_LIQUIDITY",

        simulationData
          ?.depth
          .fullyExecutable ===
          true &&
          simulationData
            .depth
            .fillPercent >=
            100,

        "Requested validation capital is fully executable in current depth.",

        simulationData
          ? `Simulation fill is ${simulationData.depth.fillPercent}%.`
          : "Executable liquidity is unavailable because simulation did not complete.",
      ),
    );

    const adapters =
      buyExchange &&
      sellExchange
        ? liveExecutionService
            .getExchangeStatuses([
              buyExchange,
              sellExchange,
            ])
        : [];

    const adaptersReady =
      adapters.length ===
        2 &&
      adapters.every(
        (
          adapter,
        ) =>
          adapter
            .adapterRegistered &&
          adapter
            .adapterConnected,
      );

    gates.push(
      this.gate(
        "EXECUTION_ADAPTERS_READY",

        adaptersReady,

        "Both route execution adapters have explicit LIVE execution availability.",

        "One or more route execution adapters are missing, unverified, or LIVE-disabled.",
      ),
    );

    let buyCapability =
      null;

    let sellCapability =
      null;

    const capabilityErrors:
      string[] =
      [];

    if (
      market &&
      buyExchange
    ) {
      try {
        buyCapability =
          await exchangeCapabilityService
            .getCapability({
              exchange:
                buyExchange,

              market,

              product:
                "spot",
            });
      } catch (
        error:
          unknown
      ) {
        capabilityErrors.push(
          this.errorMessage(
            error,

            `Unable to load ${buyExchange} capability for ${market}.`,
          ),
        );
      }
    }

    if (
      market &&
      sellExchange
    ) {
      try {
        sellCapability =
          await exchangeCapabilityService
            .getCapability({
              exchange:
                sellExchange,

              market,

              product:
                "spot",
            });
      } catch (
        error:
          unknown
      ) {
        capabilityErrors.push(
          this.errorMessage(
            error,

            `Unable to load ${sellExchange} capability for ${market}.`,
          ),
        );
      }
    }

    gates.push(
      this.gate(
        "EXCHANGE_CAPABILITIES_AVAILABLE",

        buyCapability !==
          null &&
          sellCapability !==
          null,

        "Current spot trading capabilities are available for both exchanges.",

        capabilityErrors.length >
        0
          ? capabilityErrors.join(
              " ",
            )
          : "Spot trading capability is unavailable for one or both exchanges.",
      ),
    );

    const executableQuantity =
      simulationData
        ?.depth
        .executableQuantity ??
      0;

    const buyOrderValidation =
      buyCapability &&
      simulationData &&
      executableQuantity >
        0
        ? exchangeOrderValidator
            .validate({
              exchange:
                buyCapability
                  .exchange,

              market:
                buyCapability
                  .market,

              product:
                buyCapability
                  .product,

              side:
                "buy",

              orderType:
                "limit",

              timeInForce:
                "IOC",

              quantity:
                executableQuantity,

              price:
                simulationData
                  .buyVWAP
                  .averagePrice,

              capability:
                buyCapability,
            })
        : null;

    const sellOrderValidation =
      sellCapability &&
      simulationData &&
      executableQuantity >
        0
        ? exchangeOrderValidator
            .validate({
              exchange:
                sellCapability
                  .exchange,

              market:
                sellCapability
                  .market,

              product:
                sellCapability
                  .product,

              side:
                "sell",

              orderType:
                "limit",

              timeInForce:
                "IOC",

              quantity:
                executableQuantity,

              price:
                simulationData
                  .sellVWAP
                  .averagePrice,

              capability:
                sellCapability,
            })
        : null;

    gates.push(
      this.gate(
        "BUY_ORDER_CONSTRAINTS",

        buyOrderValidation
          ?.valid ===
          true,

        "Buy-side quantity, price, notional and order-type constraints pass.",

        buyOrderValidation
          ? buyOrderValidation
              .reasons
              .join(
                " ",
              ) ||
            "Buy-side order constraints failed."
          : "Buy-side order constraints could not be evaluated.",
      ),

      this.gate(
        "SELL_ORDER_CONSTRAINTS",

        sellOrderValidation
          ?.valid ===
          true,

        "Sell-side quantity, price, notional and order-type constraints pass.",

        sellOrderValidation
          ? sellOrderValidation
              .reasons
              .join(
                " ",
              ) ||
            "Sell-side order constraints failed."
          : "Sell-side order constraints could not be evaluated.",
      ),
    );

    const buyQuoteBalance =
      buyCapability &&
      Number.isFinite(
        capital,
      ) &&
      capital >
        0
        ? tradingAccountService
            .evaluateExchangeBalance({
              exchange:
                buyCapability
                  .exchange,

              asset:
                buyCapability
                  .quoteAsset,

              requiredAmount:
                capital,
            })
        : null;

    const sellBaseBalance =
      sellCapability &&
      executableQuantity >
        0
        ? tradingAccountService
            .evaluateExchangeBalance({
              exchange:
                sellCapability
                  .exchange,

              asset:
                sellCapability
                  .baseAsset,

              requiredAmount:
                executableQuantity,
            })
        : null;

    const balancesReady =
      buyQuoteBalance
        ?.approved ===
        true &&
      sellBaseBalance
        ?.approved ===
        true;

    gates.push(
      this.gate(
        "BUY_BALANCE_FRESH_AND_SUFFICIENT",

        buyQuoteBalance
          ?.approved ===
          true,

        buyQuoteBalance
          ? `${buyQuoteBalance.asset} buy-side balance is fresh and sufficient.`
          : "Buy-side balance is fresh and sufficient.",

        buyQuoteBalance
          ? buyQuoteBalance
              .reasons
              .join(
                " ",
              ) ||
            "Buy-side balance check failed."
          : "Buy-side balance could not be evaluated.",
      ),

      this.gate(
        "SELL_INVENTORY_FRESH_AND_SUFFICIENT",

        sellBaseBalance
          ?.approved ===
          true,

        sellBaseBalance
          ? `${sellBaseBalance.asset} sell-side inventory is fresh and sufficient.`
          : "Sell-side inventory is fresh and sufficient.",

        sellBaseBalance
          ? sellBaseBalance
              .reasons
              .join(
                " ",
              ) ||
            "Sell-side inventory check failed."
          : "Sell-side inventory could not be evaluated.",
      ),
    );

    const accountTradeCheck =
      Number.isFinite(
        capital,
      ) &&
      capital >
        0
        ? tradingAccountService
            .evaluateTrade(
              capital,
            )
        : null;

    gates.push(
      this.gate(
        "ACCOUNT_TRADE_LIMITS",

        accountTradeCheck
          ?.approved ===
          true,

        "Trading account capital/daily/open-trade limits pass.",

        accountTradeCheck
          ? accountTradeCheck
              .reasons
              .join(
                " ",
              ) ||
            "Trading account limits rejected the request."
          : "Trading account limits could not be evaluated.",
      ),
    );

    const risk =
      currentOpportunity &&
      simulation &&
      simulationData &&
      Number.isFinite(
        capital,
      ) &&
      capital >
        0
        ? riskEngine
            .assess({
              capital,

              market:
                currentOpportunity
                  .pair
                  .market,

              buyExchange:
                currentOpportunity
                  .pair
                  .buy
                  .exchange,

              sellExchange:
                currentOpportunity
                  .pair
                  .sell
                  .exchange,

              quotesFresh:
                pairIntegrity
                  ?.buy
                  .fresh ===
                  true &&
                pairIntegrity
                  ?.sell
                  .fresh ===
                  true,

              pairSynchronized:
                pairIntegrity
                  ?.synchronized ===
                  true,

              timestampSkewMs:
                pairIntegrity
                  ?.timestampSkewMs ??
                null,

              maximumPairSkewMs:
                pairIntegrity
                  ?.maximumPairSkewMs ??
                null,

              confidence:
                simulationData
                  .confidence
                  .score,

              fillPercent:
                simulationData
                  .depth
                  .fillPercent,

              netProfit:
                simulationData
                  .profit
                  .breakdown
                  .netProfit,

              executionTimeMs:
                simulation
                  .executionTimeMs,

              liquidityScore:
                currentOpportunity
                  .liquidityScore,

              quoteAgeMs:
                Math.max(
                  0,

                  generatedAt -
                    currentOpportunity
                      .timestamp,
                ),

              exchangeConnected:
                adaptersReady,

              balanceAvailable:
                balancesReady,

              dailyLoss:
                account.todayLoss,

              dailyTradeCount:
                account.tradesToday,
            })
        : null;

    gates.push(
      this.gate(
        "UNIFIED_RISK_APPROVED",

        risk
          ?.approved ===
          true,

        risk
          ? `Unified risk engine approved the candidate with ${risk.level} risk and score ${risk.score}.`
          : "Unified risk engine approved the candidate.",

        risk
          ? risk
              .reasons
              .join(
                " ",
              ) ||
            "Unified risk engine rejected the candidate."
          : "Unified risk assessment could not be completed.",
      ),

      {
        key:
          "FINAL_LAST_LOOK",

        state:
          "NOT_IMPLEMENTED",

        required:
          true,

        message:
          "Submission-time final last-look remains intentionally unavailable in Version 17.0 Build 2 and will be integrated before any live order path.",
      },

      {
        key:
          "LIVE_ORDER_SUBMISSION",

        state:
          "NOT_IMPLEMENTED",

        required:
          true,

        message:
          "No live order submission path is exposed by Version 17.0 Build 2.",
      },
    );

    const blockers =
      gates
        .filter(
          (
            gate,
          ) =>
            gate.required &&
            gate.state !==
              "PASS",
        )
        .map(
          (
            gate,
          ) =>
            `${gate.key}: ${gate.message}`,
        );

    return {
      generatedAt,

      version:
        "17.0",

      mode:
        "CONTROLLED_LIVE",

      status:
        blockers.length ===
          0
          ? "TECHNICALLY_READY"
          : "BLOCKED",

      candidateKey,

      capital,

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      candidate: {
        found:
          qualification !==
          null,

        qualified:
          qualification
            ?.qualified ===
          true,

        qualificationScore:
          qualification
            ?.score ??
          null,

        market,

        buyExchange,

        sellExchange,

        currentOpportunityId:
          currentOpportunity
            ?.id ??
          null,
      },

      routeEvidence: {
        status:
          routeEvidence
            ?.status ??
          null,

        score:
          routeEvidence
            ?.score ??
          null,

        capitalMultiplier:
          routeEvidence
            ?.capitalMultiplier ??
          null,

        reasons:
          routeEvidence
            ? structuredClone(
                routeEvidence
                  .reasons,
              )
            : [],
      },

      marketIntegrity: {
        buyFresh:
          pairIntegrity
            ?.buy
            .fresh ??
          false,

        sellFresh:
          pairIntegrity
            ?.sell
            .fresh ??
          false,

        synchronized:
          pairIntegrity
            ?.synchronized ??
          false,

        timestampSkewMs:
          pairIntegrity
            ?.timestampSkewMs ??
          null,

        maximumPairSkewMs:
          pairIntegrity
            ?.maximumPairSkewMs ??
          null,

        buyBookValid,

        sellBookValid,
      },

      simulation: {
        attempted:
          simulation !==
          null,

        success:
          simulationData !==
          null,

        recommendation:
          simulationData
            ?.decision
            .recommendation ??
          null,

        confidence:
          simulationData
            ?.confidence
            .score ??
          null,

        fillPercent:
          simulationData
            ?.depth
            .fillPercent ??
          null,

        executableQuantity:
          simulationData
            ?.depth
            .executableQuantity ??
          null,

        buyVwap:
          simulationData
            ?.buyVWAP
            .averagePrice ??
          null,

        sellVwap:
          simulationData
            ?.sellVWAP
            .averagePrice ??
          null,

        netProfit:
          simulationData
            ?.profit
            .breakdown
            .netProfit ??
          null,

        netProfitPercent:
          simulationData
            ?.profit
            .profitPercent ??
          null,

        executionTimeMs:
          simulation
            ?.executionTimeMs ??
          null,

        failureReason:
          simulation
            ?.failureReason ??
          null,
      },

      adapters,

      balances: {
        buyQuote:
          buyQuoteBalance,

        sellBase:
          sellBaseBalance,
      },

      orderValidation: {
        buy:
          buyOrderValidation,

        sell:
          sellOrderValidation,
      },

      risk,

      gates,

      blockers,
    };
  }

  private findCurrentOpportunity(
    market:
      string,

    buyExchange:
      string,

    sellExchange:
      string,
  ): ArbitrageOpportunity | null {
    const normalizedMarket =
      market
        .trim()
        .toUpperCase();

    const normalizedBuy =
      buyExchange
        .trim()
        .toLowerCase();

    const normalizedSell =
      sellExchange
        .trim()
        .toLowerCase();

    return (
      opportunityService
        .getLastOpportunities()
        .find(
          (
            opportunity,
          ) =>
            opportunity
              .pair
              .market
              .trim()
              .toUpperCase() ===
              normalizedMarket &&
            opportunity
              .pair
              .buy
              .exchange
              .trim()
              .toLowerCase() ===
              normalizedBuy &&
            opportunity
              .pair
              .sell
              .exchange
              .trim()
              .toLowerCase() ===
              normalizedSell,
        ) ??
      null
    );
  }

  private isCurrentBookValid(
    exchange:
      string,

    market:
      string,
  ): boolean {
    const book =
      orderBookService
        .get(
          exchange,
          market,
        );

    if (
      !book ||
      book.bids.length ===
        0 ||
      book.asks.length ===
        0
    ) {
      return false;
    }

    const bestBid =
      book.bids[0];

    const bestAsk =
      book.asks[0];

    return (
      Number.isFinite(
        bestBid.price,
      ) &&
      Number.isFinite(
        bestBid.quantity,
      ) &&
      Number.isFinite(
        bestAsk.price,
      ) &&
      Number.isFinite(
        bestAsk.quantity,
      ) &&
      bestBid.price >
        0 &&
      bestBid.quantity >
        0 &&
      bestAsk.price >
        0 &&
      bestAsk.quantity >
        0 &&
      bestAsk.price >=
        bestBid.price
    );
  }

  private gate(
    key:
      string,

    passed:
      boolean,

    passMessage:
      string,

    blockedMessage:
      string,
  ): LiveCandidateEligibilityGate {
    return {
      key,

      state:
        passed
          ? "PASS"
          : "BLOCKED",

      required:
        true,

      message:
        passed
          ? passMessage
          : blockedMessage,
    };
  }

  private accountingIntegrityPassed(
    integrity:
      ReturnType<
        typeof paperAutomationAccountingService.getDiagnostics
      >["integrity"],
  ): boolean {
    return (
      integrity
        .accountCapitalValid &&
      integrity
        .availableCapitalValid &&
      integrity
        .portfolioCapitalMatchesAccount &&
      integrity
        .automationLedgerMatchesPaperTrades &&
      integrity
        .exclusiveAutomationCoverage &&
      integrity
        .accountProfitMatchesAutomationLedger !==
        false
    );
  }

  private errorMessage(
    error:
      unknown,

    fallback:
      string,
  ): string {
    return error instanceof Error
      ? error.message
      : fallback;
  }
}

export const liveCandidateEligibilityService =
  new LiveCandidateEligibilityService();
