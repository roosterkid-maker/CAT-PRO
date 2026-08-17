import {
  randomUUID,
} from "node:crypto";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import type {
  LiveExecutionSession,
} from "../../execution/live/coordinator/LiveExecutionSession";

import {
  orderLifecycleManager,
} from "../../execution/live/lifecycle/OrderLifecycleManager";

import type {
  OrderLifecycleRecord,
} from "../../execution/live/lifecycle/OrderLifecycleRecord";

import type {
  ExecutionPlan,
  ExecutionStrategy,
  ExecutionTimeInForce,
} from "../../trading/models/ExecutionPlan";

import type {
  ControlledCoordinatorDryBridgeResult,
} from "../models/ControlledCoordinatorDryBridge";

import {
  controlledTwoLegExecutionService,
} from "./ControlledTwoLegExecutionService";

import {
  liveFinalLastLookService,
} from "./LiveFinalLastLookService";

const MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL =
  100;

const PLAN_TTL_MS =
  5_000;

export class ControlledCoordinatorDryBridgeService {
  async validate(
    candidateKey:
      string,

    capital:
      number,
  ): Promise<
    ControlledCoordinatorDryBridgeResult
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

    const reasons:
      string[] =
      [];

    if (
      !normalizedCandidateKey
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
        `Version 17.2 Build 2 validation capital must not exceed ₹${MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL}.`,
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

        preparationPlan:
          null,

        dryRunPreparationAttempted:
          false,

        dryRunPreparationApproved:
          false,

        finalSession:
          null,

        buy:
          null,

        sell:
          null,

        cleanupCompleted:
          true,

        blockers,

        warnings,

        reasons,
      });
    }

    /*
     * -------------------------------------------------
     * VERSION 17.2 BUILD 1
     * -------------------------------------------------
     *
     * First require the controlled two-leg planner.
     *
     * No coordinator mutation happens unless the
     * complete upstream evidence reaches PREPARED.
     */
    const twoLegPlan =
      await controlledTwoLegExecutionService
        .prepare(
          normalizedCandidateKey,

          capital,
        );

    warnings.push(
      ...twoLegPlan
        .warnings,
    );

    if (
      twoLegPlan.status !==
        "PREPARED" ||
      twoLegPlan.strategy ===
        "NONE" ||
      !twoLegPlan.buy ||
      !twoLegPlan.sell
    ) {
      blockers.push(
        ...twoLegPlan
          .blockers
          .map(
            (
              reason,
            ) =>
              `TWO_LEG_PLAN: ${reason}`,
          ),
      );

      if (
        blockers.length ===
        0
      ) {
        blockers.push(
          "Two-leg preparation did not produce an executable dry validation plan.",
        );
      }

      return this.result({
        generatedAt,

        candidateKey:
          normalizedCandidateKey,

        capital,

        preparationPlan:
          null,

        dryRunPreparationAttempted:
          false,

        dryRunPreparationApproved:
          false,

        finalSession:
          null,

        buy:
          null,

        sell:
          null,

        cleanupCompleted:
          true,

        blockers:
          this.unique(
            blockers,
          ),

        warnings:
          this.unique(
            warnings,
          ),

        reasons,
      });
    }

    /*
     * -------------------------------------------------
     * FRESH FINAL LAST LOOK
     * -------------------------------------------------
     *
     * Build 1 already performed one, but this bridge
     * deliberately obtains a new final simulation.
     *
     * We do not build the coordinator plan from stale
     * candidate quantity/price information.
     */
    const lastLook =
      liveFinalLastLookService
        .evaluate({
          candidateKey:
            normalizedCandidateKey,

          capital,
        });

    if (
      !lastLook.passed ||
      !lastLook
        .finalExecution
        ?.simulation
    ) {
      blockers.push(
        ...lastLook
          .reasons
          .map(
            (
              reason,
            ) =>
              `FINAL_LAST_LOOK: ${reason}`,
          ),
      );

      return this.result({
        generatedAt,

        candidateKey:
          normalizedCandidateKey,

        capital,

        preparationPlan:
          null,

        dryRunPreparationAttempted:
          false,

        dryRunPreparationApproved:
          false,

        finalSession:
          null,

        buy:
          null,

        sell:
          null,

        cleanupCompleted:
          true,

        blockers:
          this.unique(
            blockers,
          ),

        warnings:
          this.unique(
            warnings,
          ),

        reasons,
      });
    }

    const simulation =
      lastLook
        .finalExecution
        .simulation;

    const now =
      Date.now();

    /*
     * -------------------------------------------------
     * AUTHORITATIVE ExecutionPlan
     * -------------------------------------------------
     *
     * This now converts Version 17 evidence into the
     * existing Version 14 ExecutionPlan contract.
     *
     * We are integrating instead of creating another
     * execution architecture.
     */
    const preparationPlan:
      ExecutionPlan = {
      id:
        `v17.2-dry-${randomUUID()}`,

      version:
        17.2,

      market:
        twoLegPlan.buy.market,

      mode:
        "LIVE",

      strategy:
        twoLegPlan.strategy as
          ExecutionStrategy,

      status:
        "READY",

      capital,

      expectedProfit:
        simulation
          .profit
          .breakdown
          .netProfit,

      expectedProfitPercent:
        simulation
          .profit
          .profitPercent,

      expectedNetProfit:
        simulation
          .profit
          .breakdown
          .netProfit,

      expectedNetProfitPercent:
        simulation
          .profit
          .profitPercent,

      maximumSlippagePercent:
        Math.max(
          simulation
            .buySlippage
            .slippagePercent,

          simulation
            .sellSlippage
            .slippagePercent,
        ),

      expectedSlippagePercent:
        Math.max(
          simulation
            .buySlippage
            .slippagePercent,

          simulation
            .sellSlippage
            .slippagePercent,
        ),

      executionScore:
        simulation
          .confidence
          .score,

      timeoutMs:
        Math.min(
          twoLegPlan
            .buy
            .timeoutMs,

          twoLegPlan
            .sell
            .timeoutMs,
        ),

      buy: {
        exchange:
          twoLegPlan
            .buy
            .exchange,

        market:
          twoLegPlan
            .buy
            .market,

        side:
          "BUY",

        quantity:
          twoLegPlan
            .buy
            .quantity,

        limitPrice:
          twoLegPlan
            .buy
            .limitPrice,

        orderType:
          "limit",

        timeInForce:
          this.resolveTimeInForce(
            twoLegPlan
              .buy
              .exchange,
          ),
      },

      sell: {
        exchange:
          twoLegPlan
            .sell
            .exchange,

        market:
          twoLegPlan
            .sell
            .market,

        side:
          "SELL",

        quantity:
          twoLegPlan
            .sell
            .quantity,

        limitPrice:
          twoLegPlan
            .sell
            .limitPrice,

        orderType:
          "limit",

        timeInForce:
          this.resolveTimeInForce(
            twoLegPlan
              .sell
              .exchange,
          ),
      },

      createdAt:
        now,

      expiresAt:
        now +
        PLAN_TTL_MS,

      opportunityTimestamp:
        simulation
          .simulatedAt,
    };

    let session:
      LiveExecutionSession | null =
      null;

    let buy:
      OrderLifecycleRecord | null =
      null;

    let sell:
      OrderLifecycleRecord | null =
      null;

    let cleanupCompleted =
      false;

    let dryRunPreparationApproved =
      false;

    try {
      /*
       * -------------------------------------------------
       * EXISTING LiveExecutionCoordinator
       * -------------------------------------------------
       *
       * prepareDryRun():
       *
       * YES:
       * - uses real coordinator state machine
       * - creates session
       * - acquires route lock
       * - reserves capital
       *
       * NO:
       * - LIVE_TRADING_CONFIRMATION not required
       * - adapter execute() not called
       * - exchange API not called
       */
      const preparation =
        liveExecutionCoordinator
          .prepareDryRun(
            preparationPlan,
          );

      dryRunPreparationApproved =
        preparation.approved;

      session =
        preparation.session;

      reasons.push(
        ...preparation
          .reasons,
      );

      if (
        !preparation.approved ||
        !preparation.session
      ) {
        blockers.push(
          ...preparation
            .reasons
            .map(
              (
                reason,
              ) =>
                `COORDINATOR: ${reason}`,
            ),
        );

        return this.result({
          generatedAt,

          candidateKey:
            normalizedCandidateKey,

          capital,

          preparationPlan,

          dryRunPreparationAttempted:
            true,

          dryRunPreparationApproved,

          finalSession:
            session,

          buy,

          sell,

          cleanupCompleted:
            true,

          blockers:
            this.unique(
              blockers,
            ),

          warnings:
            this.unique(
              warnings,
            ),

          reasons:
            this.unique(
              reasons,
            ),
        });
      }

      /*
       * -------------------------------------------------
       * EXISTING OrderLifecycleManager
       * -------------------------------------------------
       *
       * Only PREPARE is called.
       *
       * markSubmissionRequested() is NEVER called.
       */
      const buyPreparation =
        orderLifecycleManager
          .prepare(
            preparation
              .session
              .id,

            "BUY",
          );

      buy =
        buyPreparation.order;

      reasons.push(
        ...buyPreparation
          .reasons,
      );

      if (
        !buyPreparation.approved ||
        !buyPreparation.order
      ) {
        blockers.push(
          ...buyPreparation
            .reasons
            .map(
              (
                reason,
              ) =>
                `BUY_LIFECYCLE: ${reason}`,
            ),
        );
      }

      const sellPreparation =
        orderLifecycleManager
          .prepare(
            preparation
              .session
              .id,

            "SELL",
          );

      sell =
        sellPreparation.order;

      reasons.push(
        ...sellPreparation
          .reasons,
      );

      if (
        !sellPreparation.approved ||
        !sellPreparation.order
      ) {
        blockers.push(
          ...sellPreparation
            .reasons
            .map(
              (
                reason,
              ) =>
                `SELL_LIFECYCLE: ${reason}`,
            ),
        );
      }

      if (
        buyPreparation.approved &&
        buyPreparation.order &&
        sellPreparation.approved &&
        sellPreparation.order
      ) {
        reasons.push(
          "Existing LiveExecutionCoordinator accepted the synthetic LIVE plan.",

          "Existing OrderLifecycleManager prepared both BUY and SELL lifecycle records.",

          "No markSubmissionRequested() call was made.",

          "No adapter execute() call was made.",

          "No exchange order was submitted.",
        );
      }
    } catch (
      error:
        unknown
    ) {
      blockers.push(
        error instanceof Error
          ? `DRY_BRIDGE: ${error.message}`
          : "DRY_BRIDGE: Unknown coordinator/lifecycle validation error.",
      );
    } finally {
      /*
       * -------------------------------------------------
       * FAIL-SAFE CLEANUP
       * -------------------------------------------------
       *
       * Anything PREPARED is aborted.
       *
       * Coordinator session is cancelled.
       *
       * This releases:
       *
       * - temporary capital reservation
       * - temporary route lock
       */
      if (
        buy?.status ===
        "PREPARED"
      ) {
        try {
          buy =
            orderLifecycleManager
              .abortPrepared(
                buy.id,

                "Version 17.2 Build 2 dry bridge cleanup. No exchange order was submitted.",
              );
        } catch (
          error:
            unknown
        ) {
          blockers.push(
            error instanceof Error
              ? `BUY_CLEANUP: ${error.message}`
              : "BUY_CLEANUP: Unable to abort prepared BUY lifecycle.",
          );
        }
      }

      if (
        sell?.status ===
        "PREPARED"
      ) {
        try {
          sell =
            orderLifecycleManager
              .abortPrepared(
                sell.id,

                "Version 17.2 Build 2 dry bridge cleanup. No exchange order was submitted.",
              );
        } catch (
          error:
            unknown
        ) {
          blockers.push(
            error instanceof Error
              ? `SELL_CLEANUP: ${error.message}`
              : "SELL_CLEANUP: Unable to abort prepared SELL lifecycle.",
          );
        }
      }

      if (
        session
      ) {
        const latestSession =
          liveExecutionCoordinator
            .getSession(
              session.id,
            );

        if (
          latestSession &&
          (
            latestSession.status ===
              "VALIDATING" ||
            latestSession.status ===
              "RESERVED" ||
            latestSession.status ===
              "READY_FOR_SUBMISSION"
          )
        ) {
          try {
            session =
              liveExecutionCoordinator
                .cancel(
                  latestSession.id,

                  "Version 17.2 Build 2 dry bridge cleanup. No exchange order was submitted.",
                );
          } catch (
            error:
              unknown
          ) {
            blockers.push(
              error instanceof Error
                ? `SESSION_CLEANUP: ${error.message}`
                : "SESSION_CLEANUP: Unable to cancel synthetic coordinator session.",
            );
          }
        } else {
          session =
            latestSession;
        }
      }

      cleanupCompleted =
        (
          !buy ||
          buy.status ===
            "ABORTED"
        ) &&
        (
          !sell ||
          sell.status ===
            "ABORTED"
        ) &&
        (
          !session ||
          session.status ===
            "CANCELLED" ||
          session.status ===
            "FAILED" ||
          session.status ===
            "EXPIRED"
        );

      if (
        !cleanupCompleted
      ) {
        blockers.push(
          "Dry bridge cleanup did not reach terminal lifecycle/session states.",
        );
      }
    }

    return this.result({
      generatedAt,

      candidateKey:
        normalizedCandidateKey,

      capital,

      preparationPlan,

      dryRunPreparationAttempted:
        true,

      dryRunPreparationApproved,

      finalSession:
        session,

      buy,

      sell,

      cleanupCompleted,

      blockers:
        this.unique(
          blockers,
        ),

      warnings:
        this.unique(
          warnings,
        ),

      reasons:
        this.unique(
          reasons,
        ),
    });
  }

  /*
   * Current authoritative adapter semantics:
   *
   * Binance LIMIT -> GTC.
   *
   * CoinDCX does not currently expose an
   * explicit normalized TIF value, therefore
   * undefined is intentional and safer than
   * pretending IOC/FOK support.
   */
  private resolveTimeInForce(
    exchange:
      string,
  ): ExecutionTimeInForce | undefined {
    const normalizedExchange =
      exchange
        .trim()
        .toLowerCase();

    if (
      normalizedExchange ===
      "binance"
    ) {
      return "GTC";
    }

    return undefined;
  }

  private result(
    input: {
      generatedAt: number;

      candidateKey: string;

      capital: number;

      preparationPlan:
        ExecutionPlan | null;

      dryRunPreparationAttempted:
        boolean;

      dryRunPreparationApproved:
        boolean;

      finalSession:
        LiveExecutionSession | null;

      buy:
        OrderLifecycleRecord | null;

      sell:
        OrderLifecycleRecord | null;

      cleanupCompleted:
        boolean;

      blockers:
        string[];

      warnings:
        string[];

      reasons:
        string[];
    },
  ): ControlledCoordinatorDryBridgeResult {
    const buyPrepared =
      input.buy !==
      null;

    const sellPrepared =
      input.sell !==
      null;

    return {
      generatedAt:
        input.generatedAt,

      version:
        "17.2",

      build:
        "2",

      mode:
        "CONTROLLED_LIVE",

      status:
        input.blockers.length ===
          0 &&
        input
          .dryRunPreparationApproved &&
        buyPrepared &&
        sellPrepared &&
        input.cleanupCompleted
          ? "VALIDATED"
          : "BLOCKED",

      candidateKey:
        input.candidateKey,

      capital:
        input.capital,

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      exchangeOrderSubmitted:
        false,

      preparationPlan:
        input.preparationPlan
          ? structuredClone(
              input.preparationPlan,
            )
          : null,

      coordinator: {
        dryRunPreparationAttempted:
          input
            .dryRunPreparationAttempted,

        dryRunPreparationApproved:
          input
            .dryRunPreparationApproved,

        sessionCreated:
          input.finalSession !==
          null,

        routeLockTemporarilyAcquired:
          input
            .dryRunPreparationApproved,

        capitalTemporarilyReserved:
          input
            .dryRunPreparationApproved,

        cleanupCompleted:
          input.cleanupCompleted,

        finalSession:
          input.finalSession
            ? structuredClone(
                input.finalSession,
              )
            : null,
      },

      lifecycle: {
        buyPrepared,

        sellPrepared,

        buyAborted:
          input.buy
            ?.status ===
          "ABORTED",

        sellAborted:
          input.sell
            ?.status ===
          "ABORTED",

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
      },

      blockers:
        structuredClone(
          input.blockers,
        ),

      warnings:
        structuredClone(
          input.warnings,
        ),

      reasons:
        structuredClone(
          input.reasons,
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

export const controlledCoordinatorDryBridgeService =
  new ControlledCoordinatorDryBridgeService();