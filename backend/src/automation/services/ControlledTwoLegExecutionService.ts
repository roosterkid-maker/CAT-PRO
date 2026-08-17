import type {
  ControlledTwoLegLegPlan,
  ControlledTwoLegPreparationResult,
  ControlledTwoLegRecoveryPolicy,
  ControlledTwoLegStrategy,
} from "../models/ControlledTwoLegExecution";

import {
  liveCandidateEligibilityService,
} from "./LiveCandidateEligibilityService";

import {
  liveFinalLastLookService,
} from "./LiveFinalLastLookService";

import {
  liveOrderValidationService,
} from "./LiveOrderValidationService";

const MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL =
  100;

const DEFAULT_LEG_TIMEOUT_MS =
  5_000;

export class ControlledTwoLegExecutionService {
  async prepare(
    candidateKey: string,
    capital: number,
  ): Promise<
    ControlledTwoLegPreparationResult
  > {
    const generatedAt =
      Date.now();

    const normalizedCandidateKey =
      candidateKey.trim();

    const blockers:
      string[] =
      [];

    const warnings:
      string[] =
      [];

    if (
      normalizedCandidateKey.length ===
      0
    ) {
      blockers.push(
        "Candidate key is required.",
      );
    }

    if (
      !Number.isFinite(
        capital,
      ) ||
      capital <=
        0
    ) {
      blockers.push(
        "Capital must be a positive finite number.",
      );
    }

    if (
      Number.isFinite(
        capital,
      ) &&
      capital >
        MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL
    ) {
      blockers.push(
        `Version 17.2 preparation capital must not exceed ₹${MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL}.`,
      );
    }

    if (
      blockers.length >
      0
    ) {
      return this.result({
        generatedAt,

        candidateKey:
          normalizedCandidateKey,

        capital,

        status:
          "BLOCKED",

        strategy:
          "NONE",

        strategyReasons: [],

        candidateEligibilityPassed:
          false,

        finalLastLookPassed:
          false,

        orderValidationPassed:
          false,

        buy:
          null,

        sell:
          null,

        blockers,

        warnings,
      });
    }

    /*
     * ---------------------------------------------
     * VERSION 17.0 CANDIDATE ELIGIBILITY
     * ---------------------------------------------
     */
    const eligibility =
      await liveCandidateEligibilityService
        .evaluate({
          candidateKey:
            normalizedCandidateKey,

          capital,
        });

    /*
     * Some blockers belong specifically to the
     * future LIVE arming/submission boundary.
     *
     * Build 17.2 is allowed to PREPARE architecture
     * without those gates being armed.
     *
     * Evidence gates such as:
     *
     * shadow readiness
     * paper history
     * paper performance
     * accounting
     * route
     * balances
     * adapters
     * risk
     *
     * are NOT ignored.
     */
    const eligibilityPassed =
      this.isEligibilityEvidenceReady(
        eligibility.blockers,
      );

    if (
      !eligibilityPassed
    ) {
      blockers.push(
        ...eligibility.blockers.map(
          (
            reason,
          ) =>
            `ELIGIBILITY: ${reason}`,
        ),
      );
    }

    /*
     * ---------------------------------------------
     * VERSION 17.0 FINAL LAST-LOOK
     * ---------------------------------------------
     */
    const lastLook =
      liveFinalLastLookService
        .evaluate({
          candidateKey:
            normalizedCandidateKey,

          capital,
        });

    if (
      !lastLook.passed
    ) {
      blockers.push(
        ...lastLook.reasons.map(
          (
            reason,
          ) =>
            `LAST_LOOK: ${reason}`,
        ),
      );
    }

    /*
     * ---------------------------------------------
     * VERSION 17.1 ORDER VALIDATION
     * ---------------------------------------------
     */
    const orderValidation =
      await liveOrderValidationService
        .evaluate(
          normalizedCandidateKey,

          capital,
        );

    if (
      orderValidation.status ===
      "BLOCKED"
    ) {
      blockers.push(
        ...orderValidation.blockers.map(
          (
            reason,
          ) =>
            `ORDER_VALIDATION: ${reason}`,
        ),
      );
    }

    warnings.push(
      ...orderValidation.warnings.map(
        (
          reason,
        ) =>
          `ORDER_VALIDATION: ${reason}`,
      ),
    );

    /*
     * ---------------------------------------------
     * EXACT FINAL EXECUTION INPUTS
     * ---------------------------------------------
     *
     * Prefer the second/final last-look simulation.
     *
     * We must never rebuild quantities from stale
     * candidate information when fresh execution
     * simulation already produced the intended
     * quantity and VWAP prices.
     */
    const finalSimulation =
      lastLook.finalExecution
        ?.simulation ??
      null;

    const quantity =
      finalSimulation
        ?.depth
        .executableQuantity ??
      orderValidation
        .executableQuantity ??
      null;

    const buyPrice =
      finalSimulation
        ?.buyVWAP
        .averagePrice ??
      orderValidation
        .buy
        ?.price ??
      null;

    const sellPrice =
      finalSimulation
        ?.sellVWAP
        .averagePrice ??
      orderValidation
        .sell
        ?.price ??
      null;

    const market =
      lastLook.market ??
      orderValidation.market;

    const buyExchange =
      lastLook.buyExchange ??
      orderValidation.buyExchange;

    const sellExchange =
      lastLook.sellExchange ??
      orderValidation.sellExchange;

    const legInputsReady =
      market !==
        null &&
      buyExchange !==
        null &&
      sellExchange !==
        null &&
      quantity !==
        null &&
      Number.isFinite(
        quantity,
      ) &&
      quantity >
        0 &&
      buyPrice !==
        null &&
      Number.isFinite(
        buyPrice,
      ) &&
      buyPrice >
        0 &&
      sellPrice !==
        null &&
      Number.isFinite(
        sellPrice,
      ) &&
      sellPrice >
        0;

    if (
      !legInputsReady
    ) {
      blockers.push(
        "Final executable quantity and both live limit prices are required before two-leg orchestration can be prepared.",
      );
    }

    /*
     * ---------------------------------------------
     * TWO-LEG STRATEGY DECISION
     * ---------------------------------------------
     */
    const strategyDecision =
      this.chooseStrategy({
        eligibilityPassed,

        finalLastLookPassed:
          lastLook.passed,

        orderValidationPassed:
          orderValidation.status !==
          "BLOCKED",

        buyBalanceApproved:
          eligibility
            .balances
            .buyQuote
            ?.approved ===
          true,

        sellInventoryApproved:
          eligibility
            .balances
            .sellBase
            ?.approved ===
          true,

        buyAdapterReady:
          this.adapterReady(
            eligibility.adapters,
            buyExchange,
          ),

        sellAdapterReady:
          this.adapterReady(
            eligibility.adapters,
            sellExchange,
          ),
      });

    if (
      strategyDecision.strategy ===
      "NONE"
    ) {
      blockers.push(
        "No safe two-leg execution strategy can be prepared from the current evidence.",
      );
    }

    /*
     * ---------------------------------------------
     * PREPARED LEG SPECIFICATIONS
     * ---------------------------------------------
     *
     * These are descriptions only.
     *
     * They are NOT LiveExecutionRequest objects,
     * are NOT handed to adapters and cannot submit.
     */
    const buy =
      legInputsReady
        ? this.createLeg(
            "BUY",

            buyExchange,

            market,

            quantity,

            buyPrice,
          )
        : null;

    const sell =
      legInputsReady
        ? this.createLeg(
            "SELL",

            sellExchange,

            market,

            quantity,

            sellPrice,
          )
        : null;

    return this.result({
      generatedAt,

      candidateKey:
        normalizedCandidateKey,

      capital,

      status:
        blockers.length ===
        0
          ? "PREPARED"
          : "BLOCKED",

      strategy:
        blockers.length ===
        0
          ? strategyDecision.strategy
          : "NONE",

      strategyReasons:
        strategyDecision.reasons,

      candidateEligibilityPassed:
        eligibilityPassed,

      finalLastLookPassed:
        lastLook.passed,

      orderValidationPassed:
        orderValidation.status !==
        "BLOCKED",

      buy,

      sell,

      blockers:
        this.unique(
          blockers,
        ),

      warnings:
        this.unique(
          warnings,
        ),
    });
  }

  private isEligibilityEvidenceReady(
    blockers:
      string[],
  ): boolean {
    /*
     * These gates are expected to remain unavailable
     * while Version 17 is still being constructed.
     *
     * They are arming/submission controls rather
     * than market-quality evidence.
     */
    const intentionallyUnavailableUntilFutureArm =
      new Set([
        "LIVE_ACCOUNT_MODE",
        "GLOBAL_LIVE_CONFIRMATION",
        "SESSION_LIVE_CONFIRMATION",
        "FINAL_LAST_LOOK",
        "LIVE_ORDER_SUBMISSION",
      ]);

    return blockers.every(
      (
        blocker,
      ) => {
        const separator =
          blocker.indexOf(
            ":",
          );

        const key =
          separator >=
          0
            ? blocker.slice(
                0,
                separator,
              )
            : blocker;

        return intentionallyUnavailableUntilFutureArm
          .has(
            key,
          );
      },
    );
  }

  private chooseStrategy(
    input: {
      eligibilityPassed: boolean;

      finalLastLookPassed: boolean;

      orderValidationPassed: boolean;

      buyBalanceApproved: boolean;

      sellInventoryApproved: boolean;

      buyAdapterReady: boolean;

      sellAdapterReady: boolean;
    },
  ): {
    strategy:
      ControlledTwoLegStrategy;

    reasons:
      string[];
  } {
    const reasons:
      string[] =
      [];

    if (
      !input.eligibilityPassed ||
      !input.finalLastLookPassed ||
      !input.orderValidationPassed
    ) {
      reasons.push(
        "Core eligibility, final last-look and order validation must all pass before a strategy is selected.",
      );

      return {
        strategy:
          "NONE",

        reasons,
      };
    }

    if (
      !input.buyAdapterReady ||
      !input.sellAdapterReady
    ) {
      reasons.push(
        "Both live execution adapters must be registered and connected.",
      );

      return {
        strategy:
          "NONE",

        reasons,
      };
    }

    /*
     * Cross-exchange arbitrage is safest when
     * quote currency exists on BUY exchange AND
     * base-asset inventory already exists on
     * SELL exchange.
     *
     * This avoids depending on blockchain transfer
     * completion during the arbitrage trade.
     */
    if (
      !input.buyBalanceApproved ||
      !input.sellInventoryApproved
    ) {
      reasons.push(
        "Both BUY quote balance and SELL base-asset inventory must be fresh and sufficient.",
      );

      return {
        strategy:
          "NONE",

        reasons,
      };
    }

    /*
     * At this stage PARALLEL is only a PREPARED
     * strategy recommendation.
     *
     * Build 17.2 does not execute it.
     */
    reasons.push(
      "Both legs have pre-positioned balance/inventory evidence.",
    );

    reasons.push(
      "Parallel preparation minimizes directional exposure time when both exchanges are independently executable.",
    );

    reasons.push(
      "Actual Version 17.2 Build 1 submission remains disabled; this is a strategy decision only.",
    );

    return {
      strategy:
        "PARALLEL",

      reasons,
    };
  }

  private adapterReady(
    adapters:
      Array<{
        exchange: string;

        adapterRegistered: boolean;

        adapterConnected: boolean;
      }>,

    exchange:
      string | null,
  ): boolean {
    if (
      !exchange
    ) {
      return false;
    }

    const normalized =
      exchange
        .trim()
        .toLowerCase();

    return adapters.some(
      (
        adapter,
      ) =>
        adapter.exchange
          .trim()
          .toLowerCase() ===
          normalized &&
        adapter.adapterRegistered &&
        adapter.adapterConnected,
    );
  }

  private createLeg(
    leg:
      "BUY" | "SELL",

    exchange:
      string,

    market:
      string,

    quantity:
      number,

    limitPrice:
      number,
  ): ControlledTwoLegLegPlan {
    return {
      leg,

      exchange:
        exchange
          .trim()
          .toLowerCase(),

      market:
        market
          .trim()
          .toUpperCase(),

      quantity,

      limitPrice,

      /*
       * Preparation policy only.
       *
       * Real adapter timeout behavior remains
       * authoritative when submission is eventually
       * implemented.
       */
      timeoutMs:
        DEFAULT_LEG_TIMEOUT_MS,

      cancelOnTimeout:
        true,

      submissionAllowed:
        false,
    };
  }

  private recoveryPolicies():
    ControlledTwoLegRecoveryPolicy[] {
    return [
      {
        scenario:
          "BUY_FILLED_SELL_FAILED",

        actions: [
          "FREEZE_NEW_ROUTE_EXECUTION",
          "POLL_REMOTE_STATUS",
          "RECONCILE_BOTH_LEGS",
          "HEDGE_RESIDUAL_EXPOSURE",
          "UNWIND_RESIDUAL_EXPOSURE",
          "ESCALATE_MANUAL_REVIEW",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "BUY fill with failed SELL creates long base-asset exposure. Future recovery must reconcile first, then choose hedge/unwind under an explicit recovery gate.",
      },

      {
        scenario:
          "SELL_FILLED_BUY_FAILED",

        actions: [
          "FREEZE_NEW_ROUTE_EXECUTION",
          "POLL_REMOTE_STATUS",
          "RECONCILE_BOTH_LEGS",
          "HEDGE_RESIDUAL_EXPOSURE",
          "UNWIND_RESIDUAL_EXPOSURE",
          "ESCALATE_MANUAL_REVIEW",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "SELL fill with failed BUY creates short/inventory depletion exposure. No blind retry is allowed.",
      },

      {
        scenario:
          "BUY_PARTIAL_SELL_FULL",

        actions: [
          "CANCEL_OPEN_LEG",
          "POLL_REMOTE_STATUS",
          "RECONCILE_BOTH_LEGS",
          "HEDGE_RESIDUAL_EXPOSURE",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "Mismatched fills require exact residual-quantity reconciliation before any hedge or unwind.",
      },

      {
        scenario:
          "SELL_PARTIAL_BUY_FULL",

        actions: [
          "CANCEL_OPEN_LEG",
          "POLL_REMOTE_STATUS",
          "RECONCILE_BOTH_LEGS",
          "HEDGE_RESIDUAL_EXPOSURE",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "Mismatched fills require exact residual-quantity reconciliation before any hedge or unwind.",
      },

      {
        scenario:
          "BOTH_PARTIAL",

        actions: [
          "CANCEL_OPEN_LEG",
          "POLL_REMOTE_STATUS",
          "RECONCILE_BOTH_LEGS",
          "HEDGE_RESIDUAL_EXPOSURE",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "Both partial fills must be reconciled from exchange truth before residual exposure is acted on.",
      },

      {
        scenario:
          "BUY_TIMEOUT",

        actions: [
          "CANCEL_OPEN_LEG",
          "POLL_REMOTE_STATUS",
          "FREEZE_NEW_ROUTE_EXECUTION",
          "RECONCILE_BOTH_LEGS",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "Timeout is not proof of no fill. Remote status and reconciliation are mandatory.",
      },

      {
        scenario:
          "SELL_TIMEOUT",

        actions: [
          "CANCEL_OPEN_LEG",
          "POLL_REMOTE_STATUS",
          "FREEZE_NEW_ROUTE_EXECUTION",
          "RECONCILE_BOTH_LEGS",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "Timeout is not proof of no fill. Remote status and reconciliation are mandatory.",
      },

      {
        scenario:
          "EXCHANGE_DISCONNECT",

        actions: [
          "FREEZE_NEW_ROUTE_EXECUTION",
          "POLL_REMOTE_STATUS",
          "RECONCILE_BOTH_LEGS",
          "ESCALATE_MANUAL_REVIEW",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "Exchange disconnect immediately freezes new route execution until remote order truth is recovered.",
      },

      {
        scenario:
          "CANCEL_FAILURE",

        actions: [
          "FREEZE_NEW_ROUTE_EXECUTION",
          "POLL_REMOTE_STATUS",
          "RECONCILE_BOTH_LEGS",
          "ESCALATE_MANUAL_REVIEW",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "Cancel failure leaves order state uncertain and must never be treated as cancelled locally.",
      },

      {
        scenario:
          "RECONCILIATION_MISMATCH",

        actions: [
          "FREEZE_NEW_ROUTE_EXECUTION",
          "RECONCILE_BOTH_LEGS",
          "ESCALATE_MANUAL_REVIEW",
        ],

        automaticLiveActionAllowed:
          false,

        message:
          "Any local-versus-exchange mismatch blocks settlement and future route execution until resolved.",
      },
    ];
  }

  private result(
    input: {
      generatedAt: number;

      candidateKey: string;

      capital: number;

      status:
        | "BLOCKED"
        | "PREPARED";

      strategy:
        ControlledTwoLegStrategy;

      strategyReasons:
        string[];

      candidateEligibilityPassed:
        boolean;

      finalLastLookPassed:
        boolean;

      orderValidationPassed:
        boolean;

      buy:
        ControlledTwoLegLegPlan | null;

      sell:
        ControlledTwoLegLegPlan | null;

      blockers:
        string[];

      warnings:
        string[];
    },
  ): ControlledTwoLegPreparationResult {
    return {
      generatedAt:
        input.generatedAt,

      version:
        "17.2",

      mode:
        "CONTROLLED_LIVE",

      status:
        input.status,

      candidateKey:
        input.candidateKey,

      capital:
        input.capital,

      /*
       * These remain literal false in the type,
       * preventing accidental promotion of this
       * preparation object to an execution permit.
       */
      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      coordinatorSessionCreated:
        false,

      capitalReserved:
        false,

      routeLockAcquired:
        false,

      strategy:
        input.strategy,

      strategyReasons:
        structuredClone(
          input.strategyReasons,
        ),

      prerequisites: {
        candidateEligibilityPassed:
          input.candidateEligibilityPassed,

        finalLastLookPassed:
          input.finalLastLookPassed,

        orderValidationPassed:
          input.orderValidationPassed,
      },

      buy:
        input.buy
          ? structuredClone(
              input.buy,
            )
          : null,

      sell:
        input.sell
          ? structuredClone(
              input.sell,
            )
          : null,

      recoveryPolicies:
        this.recoveryPolicies(),

      blockers:
        structuredClone(
          input.blockers,
        ),

      warnings:
        structuredClone(
          input.warnings,
        ),
    };
  }

  private unique(
    values:
      string[],
  ): string[] {
    return Array.from(
      new Set(
        values,
      ),
    );
  }
}

export const controlledTwoLegExecutionService =
  new ControlledTwoLegExecutionService();