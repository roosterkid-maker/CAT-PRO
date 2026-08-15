import {
  createHash,
} from "node:crypto";

import {
  cloneStrategyAttribution,
  strategyAttributionFromIntent,
} from "../models/StrategyAttribution";

import type {
  StrategyAttribution,
} from "../models/StrategyAttribution";

import {
  immutableStrategyIntent,
} from "../models/StrategyIntent";

import type {
  HedgeInventoryManagementStrategyIntent,
  StrategyIntent,
} from "../models/StrategyIntent";

import type {
  HedgeInventoryBoundedIntentProposal,
} from "../hedge-inventory-management/HedgeInventoryIntentProposalPlanner";

export interface PaperStrategyIntentProposal {
  readonly strategyAttribution:
    StrategyAttribution;

  readonly sourceOpportunityId:
    string;

  readonly candidateGeneration:
    string;

  readonly market:
    string;

  readonly buyExchange:
    string;

  readonly sellExchange:
    string;

  readonly proposedCapital:
    number;

  readonly createdAt:
    number;

  readonly expiresAt:
    number;
}

export interface PaperStrategyIntentProposalResult {
  readonly intent:
    StrategyIntent | null;

  readonly strategyAttribution:
    StrategyAttribution;
}

export interface HedgeInventoryStrategyIntentProposalResult {
  readonly intent:
    HedgeInventoryManagementStrategyIntent;
}

export interface StrategyIntentServiceConfig {
  maximumIntents:
    number;
}

const DEFAULT_CONFIG:
  StrategyIntentServiceConfig = {
  maximumIntents:
    1_000,
};

/**
 * Creates immutable proposal evidence only.
 *
 * This service intentionally has no execution, exchange, PAPER,
 * LIVE, account, risk, reservation, settlement, or recovery
 * dependency and exposes no execute/submit/authorize method.
 */
export class StrategyIntentService {
  private readonly config:
    StrategyIntentServiceConfig;

  private readonly intents =
    new Map<
      string,
      StrategyIntent
    >();

  constructor(
    config:
      Partial<StrategyIntentServiceConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    if (
      !Number.isSafeInteger(
        this.config.maximumIntents,
      ) ||
      this.config.maximumIntents <=
        0
    ) {
      throw new Error(
        "maximumIntents must be a positive safe integer.",
      );
    }
  }

  proposePaper(
    proposal:
      PaperStrategyIntentProposal,
  ): PaperStrategyIntentProposalResult {
    const attribution =
      cloneStrategyAttribution(
        proposal
          .strategyAttribution,
      );

    if (
      attribution.attributionStatus ===
      "UNATTRIBUTED_LEGACY"
    ) {
      return {
        intent:
          null,
        strategyAttribution:
          attribution,
      };
    }

    if (
      attribution.intentId !==
      null
    ) {
      throw new Error(
        "A StrategyIntent has already been attached to this proposal evidence.",
      );
    }

    this.validateProposal(
      proposal,
    );

    const intent =
      immutableStrategyIntent({
        id:
          this.createIntentId(
            proposal,
            attribution.strategyId,
            attribution.signalId,
          ),
        strategyId:
          attribution.strategyId,
        signalId:
          attribution.signalId,
        kind:
          "PROPOSED_STRATEGY_ACTION",
        proposedMode:
          "PAPER",
        proposalType:
          "CROSS_EXCHANGE_ARBITRAGE_PAPER_EXECUTION",
        proposedCapital:
          proposal.proposedCapital,
        createdAt:
          proposal.createdAt,
        expiresAt:
          proposal.expiresAt,
        status:
          "PROPOSED",
        executionAuthorized:
          false,
        automaticExecutionAllowed:
          false,
        evidence: {
          type:
            "CROSS_EXCHANGE_ARBITRAGE_PAPER_EXECUTION",

          sourceOpportunityId:
            proposal.sourceOpportunityId,
          candidateGeneration:
            proposal.candidateGeneration,
          market:
            proposal.market,
          buyExchange:
            proposal.buyExchange,
          sellExchange:
            proposal.sellExchange,
        },
      });

    this.storeIntent(
      intent,
    );

    return {
      intent:
        immutableStrategyIntent(
          intent,
        ),
      strategyAttribution:
        strategyAttributionFromIntent(
          attribution,
          intent,
        ),
    };
  }

  proposeHedgeInventoryShadow(
    proposal:
      HedgeInventoryBoundedIntentProposal,

    now =
      Date.now(),
  ): HedgeInventoryStrategyIntentProposalResult {
    this.validateHedgeInventoryProposal(
      proposal,
      now,
    );

    const existingForReservation =
      [...this.intents.values()]
        .find(
          (intent) =>
            intent.proposalType === "HEDGE_INVENTORY_REDUCTION" &&
            intent.evidence.capitalReservationId ===
              proposal.capitalReservationId,
        ) as HedgeInventoryManagementStrategyIntent | undefined;

    if (
      existingForReservation !== undefined &&
      existingForReservation.evidence.sourceProposalId !==
        proposal.id
    ) {
      throw new Error(
        "The capital reservation is already bound to a different hedge StrategyIntent.",
      );
    }

    const intent =
      immutableStrategyIntent({
        id:
          this.createHedgeInventoryIntentId(
            proposal,
          ),
        strategyId:
          "hedge-inventory-management",
        signalId:
          proposal.id,
        kind:
          "PROPOSED_STRATEGY_ACTION",
        proposedMode:
          "SHADOW",
        proposalType:
          "HEDGE_INVENTORY_REDUCTION",
        proposedCapital:
          proposal.proposedCapital,
        createdAt:
          proposal.createdAt,
        expiresAt:
          proposal.expiresAt,
        status:
          "PROPOSED",
        executionAuthorized:
          false,
        automaticExecutionAllowed:
          false,
        evidence: {
          type:
            "HEDGE_INVENTORY_REDUCTION",
          sourceProposalId:
            proposal.id,
          sourceType:
            proposal.sourceType,
          sourceCapitalReservationAssessmentId:
            proposal.sourceCapitalReservationAssessmentId,
          sourceRiskApprovalAssessmentId:
            proposal.sourceRiskApprovalAssessmentId,
          routeId:
            proposal.routeId,
          asset:
            proposal.asset,
          quoteAsset:
            proposal.quoteAsset,
          side:
            proposal.side,
          venue:
            proposal.venue,
          market:
            proposal.market,
          proposedQuantity:
            proposal.proposedQuantity,
          referenceVwapPrice:
            proposal.referenceVwapPrice,
          capitalReservationId:
            proposal.capitalReservationId,
          capitalReservationExpiresAt:
            proposal.capitalReservationExpiresAt,
          recursionDepth:
            0,
          reservationMutationAuthorized:
            false,
        },
      }) as HedgeInventoryManagementStrategyIntent;

    this.storeIntent(
      intent,
    );

    return {
      intent:
        immutableStrategyIntent(
          intent,
        ) as HedgeInventoryManagementStrategyIntent,
    };
  }

  getIntents(
    strategyId:
      string,
    limit =
      100,
  ): readonly StrategyIntent[] {
    const normalizedLimit =
      Math.max(
        1,
        Math.min(
          this.config.maximumIntents,
          Math.floor(
            limit,
          ),
        ),
      );

    return [
      ...this.intents
        .values(),
    ]
      .filter(
        (intent) =>
          intent.strategyId ===
          strategyId,
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.createdAt -
          first.createdAt ||
          first.id.localeCompare(
            second.id,
          ),
      )
      .slice(
        0,
        normalizedLimit,
      )
      .map(
        (intent) =>
          immutableStrategyIntent(
            intent,
          ),
      );
  }

  private createIntentId(
    proposal:
      PaperStrategyIntentProposal,
    strategyId:
      string,
    signalId:
      string,
  ): string {
    const fingerprint =
      createHash(
        "sha256",
      )
        .update(
          JSON.stringify([
            strategyId,
            signalId,
            proposal.sourceOpportunityId,
            proposal.candidateGeneration,
            proposal.market,
            proposal.buyExchange,
            proposal.sellExchange,
            proposal.proposedCapital,
            proposal.createdAt,
            proposal.expiresAt,
          ]),
          "utf8",
        )
        .digest(
          "hex",
        );

    return `strategy-intent-${fingerprint}`;
  }

  private createHedgeInventoryIntentId(
    proposal:
      HedgeInventoryBoundedIntentProposal,
  ): string {
    const fingerprint =
      createHash(
        "sha256",
      )
        .update(
          JSON.stringify([
            "hedge-inventory-management",
            proposal.id,
            proposal.sourceCapitalReservationAssessmentId,
            proposal.sourceRiskApprovalAssessmentId,
            proposal.routeId,
            proposal.asset,
            proposal.quoteAsset,
            proposal.side,
            proposal.venue,
            proposal.market,
            proposal.proposedQuantity,
            proposal.referenceVwapPrice,
            proposal.proposedCapital,
            proposal.capitalReservationId,
            proposal.capitalReservationExpiresAt,
            proposal.createdAt,
            proposal.expiresAt,
          ]),
          "utf8",
        )
        .digest(
          "hex",
        );

    return `strategy-intent-${fingerprint}`;
  }

  private validateHedgeInventoryProposal(
    proposal:
      HedgeInventoryBoundedIntentProposal,
    now:
      number,
  ): void {
    if (
      !Number.isFinite(now) ||
      now <= 0
    ) {
      throw new Error(
        "Hedge StrategyIntent persistence timestamp must be positive and finite.",
      );
    }

    const requiredText = [
      proposal.id,
      proposal.sourceCapitalReservationAssessmentId,
      proposal.sourceRiskApprovalAssessmentId,
      proposal.routeId,
      proposal.asset,
      proposal.quoteAsset,
      proposal.venue,
      proposal.market,
      proposal.capitalReservationId,
    ];

    if (
      requiredText.some(
        (value) => !value.trim(),
      ) ||
      proposal.strategyId !== "hedge-inventory-management" ||
      proposal.kind !== "PROPOSED_STRATEGY_ACTION" ||
      proposal.proposalType !== "HEDGE_INVENTORY_REDUCTION" ||
      proposal.proposedMode !== "SHADOW" ||
      proposal.status !== "PROPOSED" ||
      proposal.sourceType !== "PORTFOLIO_EXPOSURE" ||
      (
        proposal.side !== "BUY" &&
        proposal.side !== "SELL"
      ) ||
      proposal.recursionDepth !== 0 ||
      proposal.persistedAsStrategyIntent !== false ||
      proposal.executionAuthorized !== false ||
      proposal.automaticExecutionAllowed !== false
    ) {
      throw new Error(
        "Hedge StrategyIntent requires a complete non-executable V22.9 proposal contract.",
      );
    }

    if (
      !Number.isFinite(proposal.proposedQuantity) ||
      proposal.proposedQuantity <= 0 ||
      !Number.isFinite(proposal.referenceVwapPrice) ||
      proposal.referenceVwapPrice <= 0 ||
      !Number.isFinite(proposal.proposedCapital) ||
      proposal.proposedCapital <= 0
    ) {
      throw new Error(
        "Hedge StrategyIntent quantity, VWAP and proposed capital must be positive.",
      );
    }

    if (
      !Number.isFinite(proposal.createdAt) ||
      !Number.isFinite(proposal.expiresAt) ||
      !Number.isFinite(proposal.capitalReservationExpiresAt) ||
      proposal.createdAt <= 0 ||
      proposal.expiresAt <= proposal.createdAt ||
      proposal.expiresAt > proposal.capitalReservationExpiresAt ||
      proposal.expiresAt <= now ||
      proposal.capitalReservationExpiresAt <= now
    ) {
      throw new Error(
        "Hedge StrategyIntent requires an unexpired proposal bounded by its active capital reservation.",
      );
    }
  }

  private storeIntent(
    intent:
      StrategyIntent,
  ): void {
    this.intents.set(
      intent.id,
      intent,
    );

    while (
      this.intents.size >
      this.config.maximumIntents
    ) {
      const oldest =
        this.intents
          .keys()
          .next()
          .value;

      if (
        typeof oldest !==
        "string"
      ) {
        break;
      }

      this.intents.delete(
        oldest,
      );
    }
  }

  private validateProposal(
    proposal:
      PaperStrategyIntentProposal,
  ): void {
    const requiredText = [
      proposal.sourceOpportunityId,
      proposal.candidateGeneration,
      proposal.market,
      proposal.buyExchange,
      proposal.sellExchange,
    ];

    if (
      requiredText.some(
        (value) =>
          !value.trim(),
      )
    ) {
      throw new Error(
        "StrategyIntent proposal evidence fields must be non-empty.",
      );
    }

    if (
      !Number.isFinite(
        proposal.proposedCapital,
      ) ||
      proposal.proposedCapital <=
        0
    ) {
      throw new Error(
        "StrategyIntent proposed capital must be positive.",
      );
    }

    if (
      !Number.isFinite(
        proposal.createdAt,
      ) ||
      !Number.isFinite(
        proposal.expiresAt,
      ) ||
      proposal.expiresAt <=
        proposal.createdAt
    ) {
      throw new Error(
        "StrategyIntent expiry must be later than creation time.",
      );
    }
  }
}
