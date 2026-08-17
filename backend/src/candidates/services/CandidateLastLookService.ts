import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import type {
  ExecutionResult,
} from "../../execution/models/ExecutionResult";

import {
  candidateExecutionSimulationService,
  type CandidateExecutionSimulationResult,
} from "./CandidateExecutionSimulationService";

import {
  opportunityCandidateVerificationService,
  type CandidateVerificationResult,
} from "./OpportunityCandidateVerificationService";

import {
  opportunityCandidateBoardService,
} from "./OpportunityCandidateBoardService";

export type CandidateLastLookStatus =
  | "CANDIDATE_NOT_FOUND"
  | "BASELINE_SIMULATION_FAILED"
  | "LAST_LOOK_VERIFICATION_FAILED"
  | "PRICE_DRIFT_EXCEEDED"
  | "INVALID_REPRICE_TARGET"
  | "FINAL_SIMULATION_FAILED"
  | "FINAL_SIMULATION_REJECTED"
  | "READY_FOR_PAPER_EXECUTION";

export interface CandidateLastLookConfig {
  maximumAdversePriceDriftPercent:
    number;
}

export const defaultCandidateLastLookConfig:
  CandidateLastLookConfig = {
  /*
   * Keep this aligned with the existing
   * execution-plan maximum slippage threshold.
   *
   * This is deliberately conservative.
   */
  maximumAdversePriceDriftPercent:
    0.05,
};

export interface CandidatePriceDrift {
  baselineBuyPrice:
    number;

  currentBuyPrice:
    number;

  buyAdverseDriftPercent:
    number;

  baselineSellPrice:
    number;

  currentSellPrice:
    number;

  sellAdverseDriftPercent:
    number;

  maximumObservedAdverseDriftPercent:
    number;

  maximumAllowedAdverseDriftPercent:
    number;

  acceptable:
    boolean;
}

export interface CandidateLastLookResult {
  status:
    CandidateLastLookStatus;

  candidateId:
    string;

  market:
    string | null;

  buyExchange:
    string | null;

  sellExchange:
    string | null;

  targetQuantity:
    number | null;

  baseline:
    CandidateExecutionSimulationResult | null;

  lastLookVerification:
    CandidateVerificationResult | null;

  priceDrift:
    CandidatePriceDrift | null;

  finalCapital:
    number | null;

  finalExecution:
    ExecutionResult | null;

  readyForPaperExecution:
    boolean;

  reasons:
    string[];

  startedAt:
    number;

  completedAt:
    number;
}

export class CandidateLastLookService {
  evaluate(
    candidateId:
      string,

    config:
      CandidateLastLookConfig =
        defaultCandidateLastLookConfig,
  ): CandidateLastLookResult {
    const startedAt =
      Date.now();

    const normalizedCandidateId =
      candidateId.trim();

    this.validateConfig(
      config,
    );

    /*
     * -------------------------------------------------
     * 1. Candidate must still exist
     * -------------------------------------------------
     */
    const candidate =
      opportunityCandidateBoardService
        .getCandidateById(
          normalizedCandidateId,
        );

    if (!candidate) {
      return {
        status:
          "CANDIDATE_NOT_FOUND",

        candidateId:
          normalizedCandidateId,

        market:
          null,

        buyExchange:
          null,

        sellExchange:
          null,

        targetQuantity:
          null,

        baseline:
          null,

        lastLookVerification:
          null,

        priceDrift:
          null,

        finalCapital:
          null,

        finalExecution:
          null,

        readyForPaperExecution:
          false,

        reasons: [
          "Candidate was not found in the current candidate board.",
        ],

        startedAt,

        completedAt:
          Date.now(),
      };
    }

    /*
     * -------------------------------------------------
     * 2. Baseline simulation
     * -------------------------------------------------
     *
     * CandidateExecutionSimulationService already
     * performs:
     *
     * candidate lookup
     * fresh verification
     * depth
     * VWAP
     * slippage
     * fees
     * profit waterfall
     * confidence
     * execution decision
     */
    const baseline =
      candidateExecutionSimulationService
        .simulate(
          candidate.id,
        );

    if (
      !baseline.simulationPassed ||
      baseline.status !==
        "SIMULATION_PASSED" ||
      !baseline.execution ||
      !baseline.execution.success ||
      !baseline.execution.simulation ||
      !baseline.verification ||
      !baseline.verification.verified
    ) {
      return {
        status:
          "BASELINE_SIMULATION_FAILED",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity:
          baseline.targetQuantity,

        baseline,

        lastLookVerification:
          null,

        priceDrift:
          null,

        finalCapital:
          null,

        finalExecution:
          null,

        readyForPaperExecution:
          false,

        reasons:
          baseline.reasons.length >
            0
            ? baseline.reasons
            : [
                "Baseline execution simulation did not pass.",
              ],

        startedAt,

        completedAt:
          Date.now(),
      };
    }

    const targetQuantity =
      baseline.targetQuantity;

    /*
     * -------------------------------------------------
     * 3. Immediate fresh verification
     * -------------------------------------------------
     *
     * This is the actual "last look".
     *
     * We do not trust the order-book snapshot used
     * at the beginning of baseline simulation.
     */
    const lastLookVerification =
      opportunityCandidateVerificationService
        .verify(
          candidate,
        );

    if (
      !lastLookVerification
        .verified
    ) {
      return {
        status:
          "LAST_LOOK_VERIFICATION_FAILED",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        baseline,

        lastLookVerification,

        priceDrift:
          null,

        finalCapital:
          null,

        finalExecution:
          null,

        readyForPaperExecution:
          false,

        reasons:
          lastLookVerification
            .reasons
            .length >
            0
            ? lastLookVerification
                .reasons
            : [
                "Last-look market verification failed.",
              ],

        startedAt,

        completedAt:
          Date.now(),
      };
    }

    /*
     * -------------------------------------------------
     * 4. Price drift guard
     * -------------------------------------------------
     *
     * BUY adverse movement:
     * current ask moves UP.
     *
     * SELL adverse movement:
     * current bid moves DOWN.
     *
     * Favorable movement is treated as 0% adverse
     * drift rather than a negative risk value.
     */
    const baselineBuyPrice =
      baseline
        .verification
        .snapshot
        .buyBestAsk;

    const baselineSellPrice =
      baseline
        .verification
        .snapshot
        .sellBestBid;

    const currentBuyPrice =
      lastLookVerification
        .snapshot
        .buyBestAsk;

    const currentSellPrice =
      lastLookVerification
        .snapshot
        .sellBestBid;

    if (
      baselineBuyPrice ===
        null ||
      baselineSellPrice ===
        null ||
      currentBuyPrice ===
        null ||
      currentSellPrice ===
        null ||
      !Number.isFinite(
        baselineBuyPrice,
      ) ||
      !Number.isFinite(
        baselineSellPrice,
      ) ||
      !Number.isFinite(
        currentBuyPrice,
      ) ||
      !Number.isFinite(
        currentSellPrice,
      ) ||
      baselineBuyPrice <= 0 ||
      baselineSellPrice <= 0 ||
      currentBuyPrice <= 0 ||
      currentSellPrice <= 0 ||
      targetQuantity ===
        null ||
      !Number.isFinite(
        targetQuantity,
      ) ||
      targetQuantity <= 0
    ) {
      return {
        status:
          "INVALID_REPRICE_TARGET",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        baseline,

        lastLookVerification,

        priceDrift:
          null,

        finalCapital:
          null,

        finalExecution:
          null,

        readyForPaperExecution:
          false,

        reasons: [
          "Last-look repricing requires valid baseline/current prices and target quantity.",
        ],

        startedAt,

        completedAt:
          Date.now(),
      };
    }

    const buyAdverseDriftPercent =
      Math.max(
        0,
        (
          (
            currentBuyPrice -
            baselineBuyPrice
          ) /
          baselineBuyPrice
        ) *
          100,
      );

    const sellAdverseDriftPercent =
      Math.max(
        0,
        (
          (
            baselineSellPrice -
            currentSellPrice
          ) /
          baselineSellPrice
        ) *
          100,
      );

    const maximumObservedAdverseDriftPercent =
      Math.max(
        buyAdverseDriftPercent,
        sellAdverseDriftPercent,
      );

    const priceDrift:
      CandidatePriceDrift = {
      baselineBuyPrice,

      currentBuyPrice,

      buyAdverseDriftPercent,

      baselineSellPrice,

      currentSellPrice,

      sellAdverseDriftPercent,

      maximumObservedAdverseDriftPercent,

      maximumAllowedAdverseDriftPercent:
        config
          .maximumAdversePriceDriftPercent,

      acceptable:
        maximumObservedAdverseDriftPercent <=
        config
          .maximumAdversePriceDriftPercent,
    };

    if (
      !priceDrift.acceptable
    ) {
      return {
        status:
          "PRICE_DRIFT_EXCEEDED",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        baseline,

        lastLookVerification,

        priceDrift,

        finalCapital:
          null,

        finalExecution:
          null,

        readyForPaperExecution:
          false,

        reasons: [
          `Adverse price drift ${maximumObservedAdverseDriftPercent.toFixed(
            6,
          )}% exceeds maximum allowed ${config.maximumAdversePriceDriftPercent.toFixed(
            6,
          )}%.`,
        ],

        startedAt,

        completedAt:
          Date.now(),
      };
    }

    /*
     * -------------------------------------------------
     * 5. Reprice same target quantity
     * -------------------------------------------------
     *
     * Do NOT increase quantity merely because more
     * liquidity became available.
     *
     * We keep the original candidate target fixed.
     */
    const finalCapital =
      targetQuantity *
      currentBuyPrice;

    if (
      !Number.isFinite(
        finalCapital,
      ) ||
      finalCapital <= 0
    ) {
      return {
        status:
          "INVALID_REPRICE_TARGET",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        baseline,

        lastLookVerification,

        priceDrift,

        finalCapital:
          null,

        finalExecution:
          null,

        readyForPaperExecution:
          false,

        reasons: [
          "Unable to calculate valid last-look execution capital.",
        ],

        startedAt,

        completedAt:
          Date.now(),
      };
    }

    /*
     * -------------------------------------------------
     * 6. FINAL simulation
     * -------------------------------------------------
     *
     * This re-runs the real existing execution kernel
     * against the most current order-book state.
     *
     * That means VWAP, slippage, fees and net profit
     * must ALL still pass after the last look.
     */
    const finalExecution =
      executionSimulator
        .simulate({
          market:
            candidate.market,

          buyExchange:
            candidate.buyExchange,

          sellExchange:
            candidate.sellExchange,

          capital:
            finalCapital,
        });

    if (
      !finalExecution.success ||
      !finalExecution.simulation
    ) {
      return {
        status:
          "FINAL_SIMULATION_FAILED",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        baseline,

        lastLookVerification,

        priceDrift,

        finalCapital,

        finalExecution,

        readyForPaperExecution:
          false,

        reasons: [
          finalExecution
            .failureReason ??
            "Final last-look execution simulation failed.",
        ],

        startedAt,

        completedAt:
          Date.now(),
      };
    }

    const finalSimulation =
      finalExecution.simulation;

    const finalRecommendation =
      finalSimulation
        .decision
        .recommendation;

    const finalNetProfit =
      finalSimulation
        .profit
        .breakdown
        .netProfit;

    const finalProfitPercent =
      finalSimulation
        .profit
        .profitPercent;

    /*
     * Fail closed.
     *
     * Final simulation must:
     *
     * - recommend EXECUTE
     * - be profitable
     * - have positive net PnL
     * - have full executable fill
     */
    const finalSimulationPassed =
      finalRecommendation ===
        "EXECUTE" &&
      finalSimulation
        .profit
        .profitable &&
      Number.isFinite(
        finalNetProfit,
      ) &&
      finalNetProfit >
        0 &&
      Number.isFinite(
        finalProfitPercent,
      ) &&
      finalProfitPercent >
        0 &&
      finalSimulation
        .depth
        .fullyExecutable &&
      finalSimulation
        .depth
        .fillPercent >=
        100;

    if (
      !finalSimulationPassed
    ) {
      return {
        status:
          "FINAL_SIMULATION_REJECTED",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        baseline,

        lastLookVerification,

        priceDrift,

        finalCapital,

        finalExecution,

        readyForPaperExecution:
          false,

        reasons: [
          `Final simulation recommendation is ${finalRecommendation}.`,
          `Final net profit is ${finalNetProfit}.`,
          `Final profit percent is ${finalProfitPercent}.`,
          `Final fill percent is ${finalSimulation.depth.fillPercent}.`,
          ...finalSimulation
            .confidence
            .reasons,
        ],

        startedAt,

        completedAt:
          Date.now(),
      };
    }

    /*
     * -------------------------------------------------
     * 7. READY
     * -------------------------------------------------
     *
     * This service STILL DOES NOT PLACE AN ORDER.
     *
     * It only issues the final pre-execution verdict.
     */
    return {
      status:
        "READY_FOR_PAPER_EXECUTION",

      candidateId:
        candidate.id,

      market:
        candidate.market,

      buyExchange:
        candidate.buyExchange,

      sellExchange:
        candidate.sellExchange,

      targetQuantity,

      baseline,

      lastLookVerification,

      priceDrift,

      finalCapital,

      finalExecution,

      readyForPaperExecution:
        true,

      reasons: [
        "Baseline candidate simulation passed.",
        "Last-look market verification passed.",
        `Maximum adverse price drift ${maximumObservedAdverseDriftPercent.toFixed(
          6,
        )}% is within allowed ${config.maximumAdversePriceDriftPercent.toFixed(
          6,
        )}%.`,
        "Final repriced execution simulation recommends EXECUTE.",
        `Final simulated net profit is ${finalNetProfit}.`,
        `Final simulated profit percent is ${finalProfitPercent.toFixed(
          6,
        )}%.`,
      ],

      startedAt,

      completedAt:
        Date.now(),
    };
  }

  private validateConfig(
    config:
      CandidateLastLookConfig,
  ): void {
    if (
      !Number.isFinite(
        config
          .maximumAdversePriceDriftPercent,
      ) ||
      config
        .maximumAdversePriceDriftPercent <
        0
    ) {
      throw new Error(
        "Maximum adverse price drift percent must be a finite non-negative number.",
      );
    }
  }
}

export const candidateLastLookService =
  new CandidateLastLookService();