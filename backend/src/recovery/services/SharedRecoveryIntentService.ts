import {
  createHash,
} from "node:crypto";

import type {
  SharedRecoveryIntent,
  SharedRecoveryIntentProposal,
  SharedRecoveryIntentView,
  SharedRecoveryReport,
} from "../models/SharedRecoveryIntent";

export interface SharedRecoveryIntentServiceConfig {
  maximumIntentTtlMs: number;

  maximumQuoteValue: number;

  maximumIntents: number;
}

const DEFAULT_CONFIG:
  SharedRecoveryIntentServiceConfig = {
  maximumIntentTtlMs:
    300_000,

  maximumQuoteValue:
    10_000,

  maximumIntents:
    5_000,
};

const SAFETY = {
  immutableEvidenceOnly:
    true,
  capitalMutationAllowed:
    false,
  executionPlanCreationAllowed:
    false,
  automaticExecutionAllowed:
    false,
  paperExecutionAllowed:
    false,
  liveExecutionAllowed:
    false,
  orderSubmissionAllowed:
    false,
} as const;

export class SharedRecoveryIntentService {
  private readonly config:
    SharedRecoveryIntentServiceConfig;

  private readonly intents =
    new Map<
      string,
      SharedRecoveryIntent
    >();

  private readonly sourceIndex =
    new Map<
      string,
      string
    >();

  constructor(
    config:
      Partial<SharedRecoveryIntentServiceConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.validateConfig();
  }

  stage(
    proposal:
      SharedRecoveryIntentProposal,

    now =
      Date.now(),
  ): SharedRecoveryIntent {
    this.validateProposal(
      proposal,
      now,
    );

    const sourceKey =
      this.sourceKey(
        proposal,
      );

    const existingId =
      this.sourceIndex.get(
        sourceKey,
      );

    if (
      existingId
    ) {
      const existing =
        this.intents.get(
          existingId,
        );

      if (
        existing
      ) {
        return structuredClone(
          existing,
        );
      }
    }

    if (
      this.intents.size >=
      this.config.maximumIntents
    ) {
      throw new Error(
        "Shared recovery intent capacity is exhausted; staging failed closed.",
      );
    }

    const id =
      this.intentId(
        proposal,
      );

    const intent:
      SharedRecoveryIntent = {
      id,
      version:
        "39.0",
      kind:
        "SHARED_RECOVERY_INTENT",
      status:
        "STAGED",
      sourceStrategyId:
        proposal.sourceStrategyId
          .trim(),
      sourceEvidenceId:
        proposal.sourceEvidenceId
          .trim(),
      sourceValidationHash:
        proposal.sourceValidationHash
          .trim(),
      sourceType:
        proposal.sourceType,
      mode:
        proposal.mode,
      severity:
        proposal.severity,
      routeId:
        proposal.routeId
          .trim(),
      asset:
        this.normalizeAsset(
          proposal.asset,
        ),
      quoteAsset:
        this.normalizeAsset(
          proposal.quoteAsset,
        ),
      residualDirection:
        proposal.residualDirection,
      leg: {
        venue:
          proposal.venue
            .trim()
            .toLowerCase(),
        market:
          this.normalizeMarket(
            proposal.market,
          ),
        side:
          proposal.side,
        quantity:
          proposal.quantity,
        referencePrice:
          proposal.referencePrice,
        estimatedQuoteValue:
          proposal.estimatedQuoteValue,
        orderTypeSelected:
          false,
        timeInForceSelected:
          false,
      },
      sourceCreatedAt:
        proposal.sourceCreatedAt,
      stagedAt:
        now,
      expiresAt:
        proposal.sourceExpiresAt,
      capitalReservationCreated:
        false,
      executionPlanCreated:
        false,
      executionAuthorized:
        false,
      automaticExecutionAllowed:
        false,
      paperExecutionAllowed:
        false,
      liveExecutionAllowed:
        false,
      orderSubmissionAllowed:
        false,
    };

    const immutable =
      this.freeze(
        structuredClone(
          intent,
        ),
      );

    this.intents.set(
      id,
      immutable,
    );

    this.sourceIndex.set(
      sourceKey,
      id,
    );

    return structuredClone(
      immutable,
    );
  }

  get(
    id: string,
  ): SharedRecoveryIntent | null {
    const intent =
      this.intents.get(
        id.trim(),
      );

    return intent
      ? structuredClone(
          intent,
        )
      : null;
  }

  getReport(
    now =
      Date.now(),
  ): SharedRecoveryReport {
    const intents =
      Array.from(
        this.intents.values(),
      )
        .map(
          (intent) =>
            this.view(
              intent,
              now,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.stagedAt -
            first.stagedAt,
        );

    const staged =
      intents.filter(
        (intent) =>
          intent.effectiveStatus ===
          "STAGED",
      ).length;

    return {
      generatedAt:
        now,
      version:
        "39.0",
      mode:
        "SHARED_RECOVERY_STAGING",
      summary: {
        total:
          intents.length,
        staged,
        expired:
          intents.length -
          staged,
        warning:
          intents.filter(
            (intent) =>
              intent.severity ===
              "WARNING",
          ).length,
        critical:
          intents.filter(
            (intent) =>
              intent.severity ===
              "CRITICAL",
          ).length,
        sourceStrategies:
          new Set(
            intents.map(
              (intent) =>
                intent.sourceStrategyId,
            ),
          ).size,
      },
      intents,
      safety:
        SAFETY,
      notes: [
        "Strategy-specific recovery evidence is normalized into one immutable shared contract.",
        "Staging is idempotent by source strategy, evidence identifier, and validation hash.",
        "Expiry is evaluated without mutating source evidence or silently extending its TTL.",
        "V78 accepts SHADOW, PAPER, and LIVE residual evidence but staging itself exposes no capital, execution-plan, PAPER/LIVE execution, or exchange-order method.",
      ],
    };
  }

  private view(
    intent:
      SharedRecoveryIntent,

    now:
      number,
  ): SharedRecoveryIntentView {
    const remainingTtlMs =
      Math.max(
        0,
        intent.expiresAt -
        now,
      );

    return {
      ...structuredClone(
        intent,
      ),
      effectiveStatus:
        remainingTtlMs > 0
          ? "STAGED"
          : "EXPIRED",
      remainingTtlMs,
    };
  }

  private validateProposal(
    proposal:
      SharedRecoveryIntentProposal,

    now:
      number,
  ): void {
    const requiredStrings = [
      proposal.sourceStrategyId,
      proposal.sourceEvidenceId,
      proposal.sourceValidationHash,
      proposal.routeId,
      proposal.asset,
      proposal.quoteAsset,
      proposal.venue,
      proposal.market,
    ];

    if (
      requiredStrings.some(
        (value) =>
          typeof value !==
            "string" ||
          value.trim().length ===
            0,
      )
    ) {
      throw new Error(
        "Shared recovery proposal contains missing lineage or route identity.",
      );
    }

    if (
      (
        proposal.mode !== "SHADOW" &&
        proposal.mode !== "PAPER" &&
        proposal.mode !== "LIVE"
      ) ||
      proposal.sourceType !==
      "STRATEGY_RESIDUAL_EXPOSURE"
    ) {
      throw new Error(
        "Only SHADOW, PAPER, or LIVE residual-exposure recovery evidence can be staged.",
      );
    }

    if (
      !Number.isFinite(
        now,
      ) ||
      now <= 0 ||
      !Number.isFinite(
        proposal.sourceCreatedAt,
      ) ||
      proposal.sourceCreatedAt <= 0 ||
      proposal.sourceCreatedAt > now ||
      !Number.isFinite(
        proposal.sourceExpiresAt,
      ) ||
      proposal.sourceExpiresAt <= now ||
      proposal.sourceExpiresAt <=
        proposal.sourceCreatedAt ||
      proposal.sourceExpiresAt -
        now >
        this.config.maximumIntentTtlMs
    ) {
      throw new Error(
        "Shared recovery proposal timestamp or TTL is invalid.",
      );
    }

    if (
      !Number.isFinite(
        proposal.quantity,
      ) ||
      proposal.quantity <= 0 ||
      !Number.isFinite(
        proposal.referencePrice,
      ) ||
      proposal.referencePrice <= 0 ||
      !Number.isFinite(
        proposal.estimatedQuoteValue,
      ) ||
      proposal.estimatedQuoteValue <= 0 ||
      proposal.estimatedQuoteValue >
        this.config.maximumQuoteValue
    ) {
      throw new Error(
        "Shared recovery quantity, price, or quote value is outside bounded policy.",
      );
    }

    const calculatedQuoteValue =
      proposal.quantity *
      proposal.referencePrice;

    const tolerance =
      Math.max(
        0.00000001,
        calculatedQuoteValue *
        0.000001,
      );

    if (
      Math.abs(
        calculatedQuoteValue -
        proposal.estimatedQuoteValue,
      ) > tolerance
    ) {
      throw new Error(
        "Shared recovery quote value does not match quantity and reference price.",
      );
    }

    const requiredSide =
      proposal.residualDirection ===
      "LONG"
        ? "SELL"
        : "BUY";

    if (
      proposal.side !==
      requiredSide
    ) {
      throw new Error(
        "Shared recovery side does not reduce the declared residual exposure.",
      );
    }
  }

  private sourceKey(
    proposal:
      SharedRecoveryIntentProposal,
  ): string {
    return [
      proposal.sourceStrategyId
        .trim(),
      proposal.sourceEvidenceId
        .trim(),
      proposal.sourceValidationHash
        .trim(),
    ].join(
      "|",
    );
  }

  private intentId(
    proposal:
      SharedRecoveryIntentProposal,
  ): string {
    return `recovery-${createHash(
      "sha256",
    )
      .update(
        this.sourceKey(
          proposal,
        ),
      )
      .digest(
        "hex",
      )
      .slice(
        0,
        32,
      )}`;
  }

  private normalizeAsset(
    value: string,
  ): string {
    return value
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        "",
      );
  }

  private normalizeMarket(
    value: string,
  ): string {
    return this.normalizeAsset(
      value,
    );
  }

  private freeze<T>(
    value: T,
  ): T {
    if (
      value &&
      typeof value ===
        "object" &&
      !Object.isFrozen(
        value,
      )
    ) {
      Object.freeze(
        value,
      );

      for (
        const child
        of Object.values(
          value,
        )
      ) {
        this.freeze(
          child,
        );
      }
    }

    return value;
  }

  private validateConfig(): void {
    if (
      !Number.isSafeInteger(
        this.config.maximumIntentTtlMs,
      ) ||
      this.config.maximumIntentTtlMs <= 0 ||
      !Number.isFinite(
        this.config.maximumQuoteValue,
      ) ||
      this.config.maximumQuoteValue <= 0 ||
      !Number.isSafeInteger(
        this.config.maximumIntents,
      ) ||
      this.config.maximumIntents <= 0
    ) {
      throw new Error(
        "Shared recovery configuration is invalid.",
      );
    }
  }
}

export const sharedRecoveryIntentService =
  new SharedRecoveryIntentService();
