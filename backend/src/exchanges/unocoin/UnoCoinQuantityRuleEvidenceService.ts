import {
  normalizeUnoCoinMarket,
} from "./normalize";

export type UnoCoinQuantityRuleEvidenceSource =
  | "AUTHENTICATED_READ";

export interface UnoCoinQuantityRuleEvidenceInput {
  market: string;

  quantityStep: number | null;

  quantityPrecision: number | null;

  source:
    UnoCoinQuantityRuleEvidenceSource;

  sourceReference: string;

  observedAt: number;
}

export interface UnoCoinQuantityRuleEvidence {
  exchange: "unocoin";

  market: string;

  quantityStep: number | null;

  quantityPrecision: number | null;

  source:
    UnoCoinQuantityRuleEvidenceSource;

  sourceReference: string;

  observedAt: number;
}

export class UnoCoinQuantityRuleEvidenceService {
  private readonly evidenceByMarket =
    new Map<
      string,
      UnoCoinQuantityRuleEvidence
    >();

  record(
    input:
      UnoCoinQuantityRuleEvidenceInput,
  ): UnoCoinQuantityRuleEvidence {
    const market =
      normalizeUnoCoinMarket(
        input.market,
      );

    if (!market) {
      throw new Error(
        "UnoCoin quantity-rule evidence requires a market.",
      );
    }

    const quantityStep =
      this.normalizeQuantityStep(
        input.quantityStep,
      );

    const quantityPrecision =
      this.normalizeQuantityPrecision(
        input.quantityPrecision,
      );

    if (
      quantityStep === null &&
      quantityPrecision === null
    ) {
      throw new Error(
        "UnoCoin quantity-rule evidence requires an explicit quantity step or quantity precision.",
      );
    }

    const sourceReference =
      input.sourceReference
        .trim();

    if (!sourceReference) {
      throw new Error(
        "UnoCoin quantity-rule evidence requires a source reference.",
      );
    }

    if (
      !Number.isSafeInteger(
        input.observedAt,
      ) ||
      input.observedAt <= 0
    ) {
      throw new Error(
        "UnoCoin quantity-rule evidence observedAt must be a positive integer timestamp.",
      );
    }

    const evidence:
      UnoCoinQuantityRuleEvidence = {
        exchange:
          "unocoin",

        market,

        quantityStep,

        quantityPrecision,

        source:
          input.source,

        sourceReference,

        observedAt:
          input.observedAt,
      };

    const current =
      this.evidenceByMarket
        .get(
          market,
        );

    /*
     * Never allow older evidence to overwrite
     * newer authoritative evidence.
     */
    if (
      current &&
      current.observedAt >
        evidence.observedAt
    ) {
      return structuredClone(
        current,
      );
    }

    this.evidenceByMarket.set(
      market,
      evidence,
    );

    return structuredClone(
      evidence,
    );
  }

  get(
    market: string,
  ): UnoCoinQuantityRuleEvidence | null {
    const normalizedMarket =
      normalizeUnoCoinMarket(
        market,
      );

    if (!normalizedMarket) {
      return null;
    }

    const evidence =
      this.evidenceByMarket
        .get(
          normalizedMarket,
        );

    return evidence
      ? structuredClone(
          evidence,
        )
      : null;
  }

  getAll():
    readonly UnoCoinQuantityRuleEvidence[] {
    return [
      ...this.evidenceByMarket
        .values(),
    ]
      .sort(
        (
          first,
          second,
        ) =>
          first.market.localeCompare(
            second.market,
          ),
      )
      .map(
        (evidence) =>
          structuredClone(
            evidence,
          ),
      );
  }

  has(
    market: string,
  ): boolean {
    return (
      this.get(
        market,
      ) !== null
    );
  }

  clear(): void {
    this.evidenceByMarket
      .clear();
  }

  private normalizeQuantityStep(
    value: number | null,
  ): number | null {
    if (value === null) {
      return null;
    }

    if (
      !Number.isFinite(
        value,
      ) ||
      value <= 0
    ) {
      throw new Error(
        "UnoCoin quantity step evidence must be a positive finite number.",
      );
    }

    return value;
  }

  private normalizeQuantityPrecision(
    value: number | null,
  ): number | null {
    if (value === null) {
      return null;
    }

    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value < 0 ||
      value > 12
    ) {
      throw new Error(
        "UnoCoin quantity precision evidence must be an integer from 0 to 12.",
      );
    }

    return value;
  }
}

export const unoCoinQuantityRuleEvidenceService =
  new UnoCoinQuantityRuleEvidenceService();