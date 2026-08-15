import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import type {
  ExecutionResult,
} from "../../execution/models/ExecutionResult";

import {
  opportunityCandidateBoardService,
} from "./OpportunityCandidateBoardService";

import {
  opportunityCandidateVerificationService,
  type CandidateVerificationResult,
} from "./OpportunityCandidateVerificationService";

export type CandidateSimulationStatus =
  | "CANDIDATE_NOT_FOUND"
  | "VERIFICATION_FAILED"
  | "INVALID_TARGET"
  | "SIMULATION_FAILED"
  | "SIMULATION_REJECTED"
  | "SIMULATION_PASSED";

export interface CandidateExecutionSimulationResult {
  status:
    CandidateSimulationStatus;

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

  simulatedCapital:
    number | null;

  verification:
    CandidateVerificationResult | null;

  execution:
    ExecutionResult | null;

  simulationPassed:
    boolean;

  reasons:
    string[];

  simulatedAt:
    number;
}

export class CandidateExecutionSimulationService {
  simulate(
    candidateId:
      string,
  ): CandidateExecutionSimulationResult {
    const normalizedCandidateId =
      candidateId.trim();

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

        simulatedCapital:
          null,

        verification:
          null,

        execution:
          null,

        simulationPassed:
          false,

        reasons: [
          "Candidate was not found in the current candidate board.",
        ],

        simulatedAt:
          Date.now(),
      };
    }

    /*
     * Independent live verification is repeated
     * immediately before simulation.
     *
     * We deliberately do not trust a verification
     * result generated several seconds earlier.
     */
    const verification =
      opportunityCandidateVerificationService
        .verify(
          candidate,
        );

    if (!verification.verified) {
      return {
        status:
          "VERIFICATION_FAILED",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity:
          candidate.executableQuantity,

        simulatedCapital:
          null,

        verification,

        execution:
          null,

        simulationPassed:
          false,

        reasons:
          verification.reasons.length >
            0
            ? verification.reasons
            : [
                "Candidate failed independent verification.",
              ],

        simulatedAt:
          Date.now(),
      };
    }

    /*
     * Simulate only the quantity that the original
     * accepted candidate intended to execute.
     *
     * Do NOT use verifiedExecutableQuantity here:
     * that value represents available profitable
     * depth and may be much larger than our target.
     */
    const targetQuantity =
      candidate.executableQuantity;

    const currentBuyBestAsk =
      verification
        .snapshot
        .buyBestAsk;

    if (
      targetQuantity ===
        null ||
      !Number.isFinite(
        targetQuantity,
      ) ||
      targetQuantity <= 0 ||
      currentBuyBestAsk ===
        null ||
      !Number.isFinite(
        currentBuyBestAsk,
      ) ||
      currentBuyBestAsk <= 0
    ) {
      return {
        status:
          "INVALID_TARGET",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        simulatedCapital:
          null,

        verification,

        execution:
          null,

        simulationPassed:
          false,

        reasons: [
          "Candidate does not contain a valid executable quantity or current buy price.",
        ],

        simulatedAt:
          Date.now(),
      };
    }

    /*
     * ExecutionSimulator accepts capital rather
     * than explicit quantity.
     *
     * Using CURRENT verified best ask converts the
     * candidate target quantity back into the exact
     * capital request required by the existing
     * execution pipeline.
     */
    const simulatedCapital =
      targetQuantity *
      currentBuyBestAsk;

    if (
      !Number.isFinite(
        simulatedCapital,
      ) ||
      simulatedCapital <= 0
    ) {
      return {
        status:
          "INVALID_TARGET",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        simulatedCapital:
          null,

        verification,

        execution:
          null,

        simulationPassed:
          false,

        reasons: [
          "Unable to calculate valid simulation capital.",
        ],

        simulatedAt:
          Date.now(),
      };
    }

    const execution =
      executionSimulator
        .simulate({
          market:
            candidate.market,

          buyExchange:
            candidate.buyExchange,

          sellExchange:
            candidate.sellExchange,

          capital:
            simulatedCapital,
        });

    if (
      !execution.success ||
      !execution.simulation
    ) {
      return {
        status:
          "SIMULATION_FAILED",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        simulatedCapital,

        verification,

        execution,

        simulationPassed:
          false,

        reasons: [
          execution.failureReason ??
            "Execution simulator failed to produce a valid simulation.",
        ],

        simulatedAt:
          Date.now(),
      };
    }

    /*
     * ExecutionSimulator owns the final simulation
     * recommendation.
     *
     * It already incorporates:
     *
     * depth
     * VWAP
     * slippage
     * fees / profit waterfall
     * confidence
     * execution decision
     */
    const recommendation =
      execution
        .simulation
        .decision
        .recommendation;

    const simulationPassed =
      recommendation ===
      "EXECUTE";

    if (!simulationPassed) {
      return {
        status:
          "SIMULATION_REJECTED",

        candidateId:
          candidate.id,

        market:
          candidate.market,

        buyExchange:
          candidate.buyExchange,

        sellExchange:
          candidate.sellExchange,

        targetQuantity,

        simulatedCapital,

        verification,

        execution,

        simulationPassed:
          false,

        reasons: [
          `Execution simulator recommendation is ${recommendation}.`,
          ...execution
            .simulation
            .confidence
            .reasons,
        ],

        simulatedAt:
          Date.now(),
      };
    }

    return {
      status:
        "SIMULATION_PASSED",

      candidateId:
        candidate.id,

      market:
        candidate.market,

      buyExchange:
        candidate.buyExchange,

      sellExchange:
        candidate.sellExchange,

      targetQuantity,

      simulatedCapital,

      verification,

      execution,

      simulationPassed:
        true,

      reasons: [
        "Candidate passed independent verification.",
        "Depth execution simulation recommends EXECUTE.",
        ...execution
          .simulation
          .confidence
          .reasons,
      ],

      simulatedAt:
        Date.now(),
    };
  }
}

export const candidateExecutionSimulationService =
  new CandidateExecutionSimulationService();