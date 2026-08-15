import {
  opportunityCandidateBoardService,
} from "../../candidates/services/OpportunityCandidateBoardService";

import {
  defaultCandidateLastLookConfig,
} from "../../candidates/services/CandidateLastLookService";

import {
  opportunityCandidateVerificationService,
} from "../../candidates/services/OpportunityCandidateVerificationService";

import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import type {
  LiveFinalLastLookPriceDrift,
  LiveFinalLastLookProfitRetention,
  LiveFinalLastLookRequest,
  LiveFinalLastLookResult,
} from "../models/LiveFinalLastLook";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

const MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL =
  100;

export class LiveFinalLastLookService {
  evaluate(
    request:
      LiveFinalLastLookRequest,
  ): LiveFinalLastLookResult {
    const startedAt =
      Date.now();

    const candidateKey =
      request.candidateKey
        .trim();

    const capital =
      request.capital;

    const reasons:
      string[] =
      [];

    if (
      candidateKey.length ===
      0
    ) {
      reasons.push(
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
      reasons.push(
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
      reasons.push(
        `Version 17.0 final last-look capital must not exceed ₹${MAXIMUM_INITIAL_LIVE_VALIDATION_CAPITAL}.`,
      );
    }

    if (
      reasons.length >
      0
    ) {
      return this.blocked({
        candidateKey,

        capital,

        reasons,

        startedAt,
      });
    }

    const qualification =
      candidateQualificationService
        .getQualification(
          candidateKey,
        );

    if (
      !qualification
    ) {
      return this.blocked({
        candidateKey,

        capital,

        reasons: [
          "Automation candidate was not found.",
        ],

        startedAt,
      });
    }

    if (
      !qualification.qualified
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId:
          qualification
            .candidate
            .latestOpportunityId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          false,

        reasons: [
          `Candidate qualification status is ${qualification.status} with score ${qualification.score}.`,

          ...qualification.reasons,
        ],

        startedAt,
      });
    }

    const candidateId =
      qualification
        .candidate
        .latestOpportunityId;

    const boardCandidate =
      opportunityCandidateBoardService
        .getCandidateById(
          candidateId,
        );

    if (
      !boardCandidate
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        reasons: [
          "The candidate's latest opportunity is no longer present in the current candidate board.",
        ],

        startedAt,
      });
    }

    const routeIdentityPassed =
      this.routeIdentityMatches(
        qualification.market,

        qualification.buyExchange,

        qualification.sellExchange,

        boardCandidate.market,

        boardCandidate.buyExchange,

        boardCandidate.sellExchange,
      );

    if (
      !routeIdentityPassed
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          false,

        reasons: [
          "Current candidate-board route does not match the qualified automation route.",
        ],

        startedAt,
      });
    }

    /*
     * -------------------------------------------------
     * BASELINE INDEPENDENT VERIFICATION
     * -------------------------------------------------
     *
     * Reuses the existing candidate verification
     * infrastructure from the authoritative codebase.
     *
     * This checks:
     *
     * candidate state
     * market identity
     * exchange direction
     * order-book presence
     * freshness
     * structure
     * spread
     * executable depth
     * quote integrity
     */
    const baselineVerification =
      opportunityCandidateVerificationService
        .verify(
          boardCandidate,
        );

    if (
      !baselineVerification
        .verified
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          true,

        baselineVerification,

        reasons:
          baselineVerification
            .reasons.length >
          0
            ? baselineVerification
                .reasons
            : [
                "Baseline live last-look verification failed.",
              ],

        startedAt,
      });
    }

    /*
     * -------------------------------------------------
     * BASELINE EXACT-CAPITAL SIMULATION
     * -------------------------------------------------
     *
     * Important:
     *
     * We do NOT use the old candidate last-look
     * target quantity here.
     *
     * LIVE validation must preserve the exact
     * intended tiny capital request.
     */
    const baselineExecution =
      executionSimulator
        .simulate({
          market:
            qualification.market,

          buyExchange:
            qualification.buyExchange,

          sellExchange:
            qualification.sellExchange,

          capital,
        });

    const baselineSimulation =
      baselineExecution
        .success
        ? baselineExecution
            .simulation
        : null;

    if (
      !baselineSimulation
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          true,

        baselineVerification,

        baselineExecution,

        reasons: [
          baselineExecution
            .failureReason ??
            "Baseline exact-capital execution simulation failed.",
        ],

        startedAt,
      });
    }

    if (
      !this.simulationPasses(
        baselineExecution,
      )
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          true,

        baselineVerification,

        baselineExecution,

        reasons: [
          `Baseline recommendation is ${baselineSimulation.decision.recommendation}.`,

          `Baseline net profit is ${baselineSimulation.profit.breakdown.netProfit}.`,

          `Baseline profit percent is ${baselineSimulation.profit.profitPercent}.`,

          `Baseline fill percent is ${baselineSimulation.depth.fillPercent}.`,
        ],

        startedAt,
      });
    }

    /*
     * -------------------------------------------------
     * FINAL INDEPENDENT VERIFICATION
     * -------------------------------------------------
     *
     * This is a SECOND verification.
     *
     * The first snapshot is deliberately not trusted
     * for the final verdict.
     */
    const finalVerification =
      opportunityCandidateVerificationService
        .verify(
          boardCandidate,
        );

    if (
      !finalVerification
        .verified
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          true,

        baselineVerification,

        baselineExecution,

        finalVerification,

        reasons:
          finalVerification
            .reasons.length >
          0
            ? finalVerification
                .reasons
            : [
                "Final independent market verification failed.",
              ],

        startedAt,
      });
    }

    /*
     * -------------------------------------------------
     * PRICE DRIFT GUARD
     * -------------------------------------------------
     *
     * BUY adverse:
     * ask rises.
     *
     * SELL adverse:
     * bid falls.
     *
     * Uses the existing CandidateLastLookService
     * configured adverse-drift limit.
     */
    const priceDrift =
      this.calculatePriceDrift(
        baselineVerification
          .snapshot
          .buyBestAsk,

        finalVerification
          .snapshot
          .buyBestAsk,

        baselineVerification
          .snapshot
          .sellBestBid,

        finalVerification
          .snapshot
          .sellBestBid,
      );

    if (
      !priceDrift
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          true,

        baselineVerification,

        baselineExecution,

        finalVerification,

        reasons: [
          "Unable to calculate final live price drift from verified order books.",
        ],

        startedAt,
      });
    }

    if (
      !priceDrift.acceptable
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          true,

        baselineVerification,

        baselineExecution,

        finalVerification,

        priceDrift,

        reasons: [
          `Maximum adverse price drift ${priceDrift.maximumObservedAdverseDriftPercent.toFixed(
            6,
          )}% exceeds allowed ${priceDrift.maximumAllowedAdverseDriftPercent.toFixed(
            6,
          )}%.`,
        ],

        startedAt,
      });
    }

    /*
     * -------------------------------------------------
     * FINAL EXACT-CAPITAL SIMULATION
     * -------------------------------------------------
     *
     * Even if extra liquidity appeared, capital
     * remains exactly the requested validation
     * capital.
     *
     * No automatic sizing increase.
     */
    const finalExecution =
      executionSimulator
        .simulate({
          market:
            qualification.market,

          buyExchange:
            qualification.buyExchange,

          sellExchange:
            qualification.sellExchange,

          capital,
        });

    const finalSimulation =
      finalExecution
        .success
        ? finalExecution
            .simulation
        : null;

    if (
      !finalSimulation
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          true,

        baselineVerification,

        baselineExecution,

        finalVerification,

        priceDrift,

        finalExecution,

        reasons: [
          finalExecution
            .failureReason ??
            "Final exact-capital execution simulation failed.",
        ],

        startedAt,
      });
    }

    const profitRetention =
      this.calculateProfitRetention(
        baselineSimulation
          .profit
          .breakdown
          .netProfit,

        baselineSimulation
          .profit
          .profitPercent,

        finalSimulation
          .profit
          .breakdown
          .netProfit,

        finalSimulation
          .profit
          .profitPercent,
      );

    if (
      !this.simulationPasses(
        finalExecution,
      )
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          true,

        baselineVerification,

        baselineExecution,

        finalVerification,

        priceDrift,

        finalExecution,

        profitRetention,

        reasons: [
          `Final recommendation is ${finalSimulation.decision.recommendation}.`,

          `Final net profit is ${finalSimulation.profit.breakdown.netProfit}.`,

          `Final profit percent is ${finalSimulation.profit.profitPercent}.`,

          `Final fill percent is ${finalSimulation.depth.fillPercent}.`,

          ...finalSimulation
            .confidence
            .reasons,
        ],

        startedAt,
      });
    }

    if (
      !profitRetention
        .profitable
    ) {
      return this.blocked({
        candidateKey,

        capital,

        candidateId,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        qualificationPassed:
          true,

        routeIdentityPassed:
          true,

        baselineVerification,

        baselineExecution,

        finalVerification,

        priceDrift,

        finalExecution,

        profitRetention,

        reasons: [
          "Final last-look profit is not positive after modeled costs.",
        ],

        startedAt,
      });
    }

    const completedAt =
      Date.now();

    /*
     * -------------------------------------------------
     * PASSED
     * -------------------------------------------------
     *
     * This means only:
     *
     * final read-only validation passed.
     *
     * It does NOT mean a LIVE order may be placed.
     */
    return {
      generatedAt:
        completedAt,

      version:
        "17.0",

      mode:
        "CONTROLLED_LIVE",

      status:
        "PASSED",

      passed:
        true,

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      candidateKey,

      candidateId,

      capital,

      market:
        qualification.market,

      buyExchange:
        qualification.buyExchange,

      sellExchange:
        qualification.sellExchange,

      qualificationPassed:
        true,

      routeIdentityPassed:
        true,

      baselineVerification,

      baselineExecution,

      finalVerification,

      priceDrift,

      finalExecution,

      profitRetention,

      reasons: [
        "Qualified automation candidate is still present in the current candidate board.",

        "Candidate route identity remained unchanged.",

        "Baseline independent market verification passed.",

        "Baseline exact-capital execution simulation passed.",

        `Maximum adverse price drift ${priceDrift.maximumObservedAdverseDriftPercent.toFixed(
          6,
        )}% is within allowed ${priceDrift.maximumAllowedAdverseDriftPercent.toFixed(
          6,
        )}%.`,

        "Final independent market verification passed.",

        "Final exact-capital execution simulation passed.",

        `Final net profit is ${finalSimulation.profit.breakdown.netProfit}.`,

        `Final profit percent is ${finalSimulation.profit.profitPercent.toFixed(
          6,
        )}%.`,

        "No LIVE order was submitted.",
      ],

      startedAt,

      completedAt,
    };
  }

  private simulationPasses(
    execution:
      ReturnType<
        typeof executionSimulator.simulate
      >,
  ): boolean {
    if (
      !execution.success ||
      !execution.simulation
    ) {
      return false;
    }

    const simulation =
      execution.simulation;

    return (
      simulation
        .decision
        .recommendation ===
        "EXECUTE" &&
      simulation
        .profit
        .profitable &&
      Number.isFinite(
        simulation
          .profit
          .breakdown
          .netProfit,
      ) &&
      simulation
        .profit
        .breakdown
        .netProfit >
        0 &&
      Number.isFinite(
        simulation
          .profit
          .profitPercent,
      ) &&
      simulation
        .profit
        .profitPercent >
        0 &&
      simulation
        .depth
        .fullyExecutable &&
      simulation
        .depth
        .fillPercent >=
        100
    );
  }

  private calculatePriceDrift(
    baselineBuyPrice:
      number | null,

    finalBuyPrice:
      number | null,

    baselineSellPrice:
      number | null,

    finalSellPrice:
      number | null,
  ): LiveFinalLastLookPriceDrift | null {
    if (
      !this.validPositiveNumber(
        baselineBuyPrice,
      ) ||
      !this.validPositiveNumber(
        finalBuyPrice,
      ) ||
      !this.validPositiveNumber(
        baselineSellPrice,
      ) ||
      !this.validPositiveNumber(
        finalSellPrice,
      )
    ) {
      return null;
    }

    const buyAdverseDriftPercent =
      Math.max(
        0,

        (
          (
            finalBuyPrice -
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
            finalSellPrice
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

    /*
     * Reuse the current authoritative last-look
     * drift configuration rather than introducing
     * another independent threshold.
     */
    const maximumAllowedAdverseDriftPercent =
      defaultCandidateLastLookConfig
        .maximumAdversePriceDriftPercent;

    return {
      baselineBuyPrice,

      finalBuyPrice,

      buyAdverseDriftPercent,

      baselineSellPrice,

      finalSellPrice,

      sellAdverseDriftPercent,

      maximumObservedAdverseDriftPercent,

      maximumAllowedAdverseDriftPercent,

      acceptable:
        maximumObservedAdverseDriftPercent <=
        maximumAllowedAdverseDriftPercent,
    };
  }

  private calculateProfitRetention(
    baselineNetProfit:
      number,

    baselineNetProfitPercent:
      number,

    finalNetProfit:
      number,

    finalNetProfitPercent:
      number,
  ): LiveFinalLastLookProfitRetention {
    const retentionPercent =
      Number.isFinite(
        baselineNetProfit,
      ) &&
      baselineNetProfit >
        0 &&
      Number.isFinite(
        finalNetProfit,
      )
        ? Math.max(
            0,

            (
              finalNetProfit /
              baselineNetProfit
            ) *
              100,
          )
        : 0;

    return {
      baselineNetProfit,

      finalNetProfit,

      baselineNetProfitPercent,

      finalNetProfitPercent,

      retentionPercent,

      profitable:
        Number.isFinite(
          finalNetProfit,
        ) &&
        finalNetProfit >
          0 &&
        Number.isFinite(
          finalNetProfitPercent,
        ) &&
        finalNetProfitPercent >
          0,
    };
  }

  private routeIdentityMatches(
    expectedMarket:
      string,

    expectedBuyExchange:
      string,

    expectedSellExchange:
      string,

    actualMarket:
      string,

    actualBuyExchange:
      string,

    actualSellExchange:
      string,
  ): boolean {
    return (
      expectedMarket
        .trim()
        .toUpperCase() ===
        actualMarket
          .trim()
          .toUpperCase() &&
      expectedBuyExchange
        .trim()
        .toLowerCase() ===
        actualBuyExchange
          .trim()
          .toLowerCase() &&
      expectedSellExchange
        .trim()
        .toLowerCase() ===
        actualSellExchange
          .trim()
          .toLowerCase()
    );
  }

  private validPositiveNumber(
    value:
      number | null,
  ): value is number {
    return (
      value !==
        null &&
      Number.isFinite(
        value,
      ) &&
      value >
        0
    );
  }

  private blocked(
    input: {
      candidateKey: string;

      capital: number;

      candidateId?: string | null;

      market?: string | null;

      buyExchange?: string | null;

      sellExchange?: string | null;

      qualificationPassed?: boolean;

      routeIdentityPassed?: boolean;

      baselineVerification?:
        LiveFinalLastLookResult[
          "baselineVerification"
        ];

      baselineExecution?:
        LiveFinalLastLookResult[
          "baselineExecution"
        ];

      finalVerification?:
        LiveFinalLastLookResult[
          "finalVerification"
        ];

      priceDrift?:
        LiveFinalLastLookResult[
          "priceDrift"
        ];

      finalExecution?:
        LiveFinalLastLookResult[
          "finalExecution"
        ];

      profitRetention?:
        LiveFinalLastLookResult[
          "profitRetention"
        ];

      reasons: string[];

      startedAt: number;
    },
  ): LiveFinalLastLookResult {
    const completedAt =
      Date.now();

    return {
      generatedAt:
        completedAt,

      version:
        "17.0",

      mode:
        "CONTROLLED_LIVE",

      status:
        "BLOCKED",

      passed:
        false,

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      candidateKey:
        input.candidateKey,

      candidateId:
        input.candidateId ??
        null,

      capital:
        input.capital,

      market:
        input.market ??
        null,

      buyExchange:
        input.buyExchange ??
        null,

      sellExchange:
        input.sellExchange ??
        null,

      qualificationPassed:
        input.qualificationPassed ??
        false,

      routeIdentityPassed:
        input.routeIdentityPassed ??
        false,

      baselineVerification:
        input.baselineVerification ??
        null,

      baselineExecution:
        input.baselineExecution ??
        null,

      finalVerification:
        input.finalVerification ??
        null,

      priceDrift:
        input.priceDrift ??
        null,

      finalExecution:
        input.finalExecution ??
        null,

      profitRetention:
        input.profitRetention ??
        null,

      reasons:
        structuredClone(
          input.reasons,
        ),

      startedAt:
        input.startedAt,

      completedAt,
    };
  }
}

export const liveFinalLastLookService =
  new LiveFinalLastLookService();