import type {
  ExchangeMarketCapability,
  ExchangeTimeInForce,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  exchangeOrderValidator,
} from "../../execution/capabilities/validation/ExchangeOrderValidator";

import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import type {
  LiveOrderExecutionSemantics,
  LiveOrderValidationCheck,
  LiveOrderValidationLeg,
  LiveOrderValidationResult,
} from "../models/LiveOrderValidation";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

const MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL =
  100;

const MAXIMUM_CAPABILITY_AGE_MS =
  60_000;

export class LiveOrderValidationService {
  async evaluate(
    candidateKey:
      string,

    capital:
      number,
  ): Promise<
    LiveOrderValidationResult
  > {
    const generatedAt =
      Date.now();

    const normalizedKey =
      candidateKey.trim();

    const checks:
      LiveOrderValidationCheck[] =
      [];

    this.pushCheck(
      checks,

      "VALID_REQUEST",

      normalizedKey.length >
        0 &&
        Number.isFinite(
          capital,
        ) &&
        capital >
          0,

      "BLOCKER",

      "Candidate key and capital are valid.",

      "Candidate key is required and capital must be a positive finite number.",
    );

    this.pushCheck(
      checks,

      "TINY_CAPITAL_CAP",

      Number.isFinite(
        capital,
      ) &&
        capital >
          0 &&
        capital <=
          MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL,

      "BLOCKER",

      `Capital is within the Version 17.1 ₹${MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL} validation cap.`,

      `Capital exceeds the Version 17.1 ₹${MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL} validation cap.`,
    );

    const qualification =
      normalizedKey
        ? candidateQualificationService
            .getQualification(
              normalizedKey,
            )
        : null;

    this.pushCheck(
      checks,

      "CANDIDATE_EXISTS",

      qualification !==
        null,

      "BLOCKER",

      "Automation candidate exists.",

      "Automation candidate was not found.",
    );

    this.pushCheck(
      checks,

      "CANDIDATE_QUALIFIED",

      qualification
        ?.qualified ===
        true,

      "BLOCKER",

      "Candidate is qualified.",

      qualification
        ? `Candidate status is ${qualification.status} with score ${qualification.score}.`
        : "Candidate cannot be qualified because it was not found.",
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

    const simulation =
      market &&
      buyExchange &&
      sellExchange &&
      Number.isFinite(
        capital,
      ) &&
      capital >
        0
        ? executionSimulator
            .simulate({
              market,

              buyExchange,

              sellExchange,

              capital,
            })
        : null;

    const simulationData =
      simulation
        ?.success
        ? simulation
            .simulation
        : null;

    this.pushCheck(
      checks,

      "EXECUTION_SIMULATION",

      simulationData !==
        null,

      "BLOCKER",

      "Exact-capital execution simulation completed.",

      simulation
        ?.failureReason ??
        "Exact-capital execution simulation is unavailable.",
    );

    this.pushCheck(
      checks,

      "FULL_EXECUTABLE_QUANTITY",

      simulationData
        ?.depth
        .fullyExecutable ===
        true &&
        (
          simulationData
            ?.depth
            .fillPercent ??
          0
        ) >=
          100,

      "BLOCKER",

      "Requested capital is fully executable.",

      simulationData
        ? `Simulation fill is ${simulationData.depth.fillPercent}%.`
        : "Executable quantity is unavailable.",
    );

    const quantity =
      simulationData
        ?.depth
        .executableQuantity ??
      null;

    const buyPrice =
      simulationData
        ?.buyVWAP
        .averagePrice ??
      null;

    const sellPrice =
      simulationData
        ?.sellVWAP
        .averagePrice ??
      null;

    const buy =
      market &&
      buyExchange &&
      quantity &&
      buyPrice
        ? await this.evaluateLeg(
            "buy",

            buyExchange,

            market,

            quantity,

            buyPrice,

            generatedAt,
          )
        : null;

    const sell =
      market &&
      sellExchange &&
      quantity &&
      sellPrice
        ? await this.evaluateLeg(
            "sell",

            sellExchange,

            market,

            quantity,

            sellPrice,

            generatedAt,
          )
        : null;

    if (
      buy
    ) {
      checks.push(
        ...buy.checks,
      );
    }

    if (
      sell
    ) {
      checks.push(
        ...sell.checks,
      );
    }

    const blockers =
      checks
        .filter(
          (
            check,
          ) =>
            !check.passed &&
            check.severity ===
              "BLOCKER",
        )
        .map(
          (
            check,
          ) =>
            `${check.key}: ${check.message}`,
        );

    const warnings =
      checks
        .filter(
          (
            check,
          ) =>
            !check.passed &&
            check.severity ===
              "WARNING",
        )
        .map(
          (
            check,
          ) =>
            `${check.key}: ${check.message}`,
        );

    return {
      generatedAt,

      version:
        "17.1",

      mode:
        "CONTROLLED_LIVE",

      status:
        blockers.length >
          0
          ? "BLOCKED"
          : warnings.length >
              0
            ? "WARNING"
            : "READY",

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      candidateKey:
        normalizedKey,

      capital,

      market,

      buyExchange,

      sellExchange,

      simulationReady:
        simulationData !==
        null,

      executableQuantity:
        quantity,

      buy,

      sell,

      checks,

      blockers,

      warnings,
    };
  }

  private async evaluateLeg(
    side:
      "buy" | "sell",

    exchange:
      string,

    market:
      string,

    quantity:
      number,

    price:
      number,

    now:
      number,
  ): Promise<
    LiveOrderValidationLeg
  > {
    const checks:
      LiveOrderValidationCheck[] =
      [];

    let capability:
      ExchangeMarketCapability | null =
      null;

    try {
      capability =
        await exchangeCapabilityService
          .getCapability({
            exchange,

            market,

            product:
              "spot",

            forceRefresh:
              true,

            maximumAgeMs:
              MAXIMUM_CAPABILITY_AGE_MS,
          });
    } catch (
      error:
        unknown
    ) {
      this.pushCheck(
        checks,

        `${side.toUpperCase()}_CAPABILITY_LOOKUP`,

        false,

        "BLOCKER",

        "Capability lookup succeeded.",

        error instanceof Error
          ? error.message
          : `Unable to load ${exchange} capability for ${market}.`,
      );
    }

    this.pushCheck(
      checks,

      `${side.toUpperCase()}_CAPABILITY_AVAILABLE`,

      capability !==
        null,

      "BLOCKER",

      "Fresh exchange capability is available.",

      `No current spot capability is available for ${exchange}:${market}.`,
    );

    const capabilityAgeMs =
      capability
        ? Math.max(
            0,

            now -
              capability
                .synchronizedAt,
          )
        : null;

    this.pushCheck(
      checks,

      `${side.toUpperCase()}_CAPABILITY_FRESH`,

      capabilityAgeMs !==
        null &&
        capabilityAgeMs <=
          MAXIMUM_CAPABILITY_AGE_MS,

      "BLOCKER",

      capabilityAgeMs !==
        null
        ? `Capability age is ${capabilityAgeMs} ms.`
        : "Capability is fresh.",

      capabilityAgeMs ===
        null
        ? "Capability freshness is unavailable."
        : `Capability age ${capabilityAgeMs} ms exceeds ${MAXIMUM_CAPABILITY_AGE_MS} ms.`,
    );

    if (
      capability
    ) {
      this.pushCheck(
        checks,

        `${side.toUpperCase()}_TRADING_ENABLED`,

        capability
          .tradingEnabled &&
          !capability
            .maintenanceMode,

        "BLOCKER",

        "Market trading is enabled and maintenance mode is clear.",

        "Market trading is disabled or maintenance mode is active.",
      );

      this.pushCheck(
        checks,

        `${side.toUpperCase()}_LIMIT_SUPPORTED`,

        capability
          .order
          .supportedOrderTypes
          .includes(
            "limit",
          ),

        "BLOCKER",

        "LIMIT orders are supported.",

        "LIMIT orders are not reported as supported.",
      );

      this.pushCheck(
        checks,

        `${side.toUpperCase()}_CANCELLATION_SUPPORTED`,

        capability
          .order
          .supportsOrderCancellation,

        "BLOCKER",

        "Order cancellation is supported.",

        "Order cancellation is not supported.",
      );

      this.pushCheck(
        checks,

        `${side.toUpperCase()}_STATUS_POLLING_SUPPORTED`,

        capability
          .order
          .supportsOrderStatusPolling,

        "BLOCKER",

        "Order status polling is supported.",

        "Order status polling is not supported.",
      );

      this.pushCheck(
        checks,

        `${side.toUpperCase()}_CLIENT_ORDER_ID_SUPPORTED`,

        capability
          .order
          .supportsClientOrderId,

        "WARNING",

        "Client order IDs are supported.",

        "Client order IDs are not reported as supported; restart-safe duplicate prevention will require an alternate mechanism.",
      );
    }

    const executionSemantics =
      capability
        ? this.resolveExecutionSemantics(
            exchange,

            capability,

            checks,

            side,
          )
        : null;

    const validation =
      capability
        ? exchangeOrderValidator
            .validate({
              exchange,

              market,

              product:
                "spot",

              side,

              orderType:
                "limit",

              quantity,

              price,

              capability,
            })
        : null;

    this.pushCheck(
      checks,

      `${side.toUpperCase()}_ORDER_CONSTRAINTS`,

      validation
        ?.valid ===
        true,

      "BLOCKER",

      "Quantity, price, precision, step-size and notional constraints pass.",

      validation
        ? validation
            .reasons
            .join(
              " ",
            ) ||
          "Exchange order constraints failed."
        : "Exchange order constraints could not be evaluated.",
    );

    return {
      side,

      exchange:
        exchange
          .trim()
          .toLowerCase(),

      market:
        market
          .trim()
          .toUpperCase(),

      quantity,

      price,

      notional:
        quantity *
        price,

      capability,

      capabilityAgeMs,

      validation,

      executionSemantics,

      checks,
    };
  }

  private resolveExecutionSemantics(
    exchange:
      string,

    capability:
      ExchangeMarketCapability,

    checks:
      LiveOrderValidationCheck[],

    side:
      "buy" | "sell",
  ): LiveOrderExecutionSemantics {
    const normalizedExchange =
      exchange
        .trim()
        .toLowerCase();

    let adapterTimeInForce:
      ExchangeTimeInForce | null =
      null;

    let explicitlyEnforced =
      false;

    const notes:
      string[] =
      [];

    if (
      normalizedExchange ===
      "binance"
    ) {
      adapterTimeInForce =
        "GTC";

      explicitlyEnforced =
        true;

      const supported =
        capability
          .order
          .supportedTimeInForce
          .includes(
            "GTC",
          );

      this.pushCheck(
        checks,

        `${side.toUpperCase()}_ADAPTER_TIF_COMPATIBLE`,

        supported,

        "BLOCKER",

        "Binance adapter GTC behavior matches synchronized capability metadata.",

        "Binance adapter uses GTC for LIMIT orders, but current capability metadata does not confirm GTC support.",
      );

      notes.push(
        "Current BinanceExecutionAdapter sends LIMIT orders with GTC.",
      );
    } else if (
      normalizedExchange ===
      "coindcx"
    ) {
      notes.push(
        "Current CoinDCX capability metadata does not expose time-in-force support.",
      );

      notes.push(
        "Current CoinDCX execution adapter does not send an explicit time-in-force value.",
      );

      this.pushCheck(
        checks,

        `${side.toUpperCase()}_ADAPTER_TIF_KNOWN`,

        false,

        "WARNING",

        "Adapter time-in-force semantics are explicitly known.",

        "CoinDCX time-in-force semantics are not exposed by current metadata; Version 17.2 must treat timeout+cancellation as the explicit leg-control mechanism.",
      );
    } else {
      this.pushCheck(
        checks,

        `${side.toUpperCase()}_ADAPTER_TIF_KNOWN`,

        false,

        "WARNING",

        "Adapter time-in-force semantics are explicitly known.",

        `${normalizedExchange} time-in-force enforcement has not been normalized in Version 17.1.`,
      );
    }

    return {
      exchange:
        normalizedExchange,

      requestedOrderType:
        "limit",

      adapterTimeInForce,

      timeInForceExplicitlyEnforced:
        explicitlyEnforced,

      cancelOnTimeoutRequired:
        true,

      statusPollingRequired:
        true,

      clientOrderIdRequired:
        true,

      notes,
    };
  }

  private pushCheck(
    checks:
      LiveOrderValidationCheck[],

    key:
      string,

    passed:
      boolean,

    severity:
      "WARNING" | "BLOCKER",

    passMessage:
      string,

    failMessage:
      string,
  ): void {
    checks.push({
      key,

      passed,

      severity:
        passed
          ? "INFO"
          : severity,

      message:
        passed
          ? passMessage
          : failMessage,
    });
  }
}

export const liveOrderValidationService =
  new LiveOrderValidationService();