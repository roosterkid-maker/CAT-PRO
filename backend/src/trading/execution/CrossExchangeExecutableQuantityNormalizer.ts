import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

export type CrossExchangeQuantityNormalizationState =
  | "UNCHANGED"
  | "NORMALIZED"
  | "BLOCKED";

export interface CrossExchangeQuantityNormalizationLegEvidence {
  exchange: string;

  price: number;

  quantityStep: number | null;

  quantityPrecision: number | null;

  minimumQuantity: number | null;

  maximumQuantity: number | null;

  minimumNotional: number | null;

  maximumNotional: number | null;

  normalizedNotional: number | null;
}

export interface CrossExchangeQuantityNormalizationReport {
  version: "81.0";

  state:
    CrossExchangeQuantityNormalizationState;

  rawQuantity: number;

  normalizedQuantity: number | null;

  commonQuantityIncrement: number | null;

  reductionQuantity: number | null;

  reductionPercent: number | null;

  roundDownOnly: true;

  quantityNeverIncreased: boolean;

  incrementEvidenceComplete: boolean;

  paperOnlyFallbackUsed: boolean;

  liveOrderSafe: boolean;

  legs:
    readonly CrossExchangeQuantityNormalizationLegEvidence[];

  blockers: readonly string[];
}

export interface CrossExchangeQuantityNormalizationRequest {
  rawQuantity: number;

  buyPrice: number;

  sellPrice: number;

  buyCapability:
    ExchangeMarketCapability | null;

  sellCapability:
    ExchangeMarketCapability | null;

  /**
   * PAPER may model a route with the verified increment from the other leg
   * when a venue does not publish quantity precision. This never certifies
   * the quantity for an exchange order and must stay disabled for LIVE
   * readiness checks.
   */
  allowIncompleteIncrementEvidenceForPaper?: boolean;
}

export class CrossExchangeExecutableQuantityNormalizer {
  normalize(
    request:
      CrossExchangeQuantityNormalizationRequest,
  ): CrossExchangeQuantityNormalizationReport {
    const blockers:
      string[] = [];

    if (
      !Number.isFinite(
        request.rawQuantity,
      ) ||
      request.rawQuantity <=
        0
    ) {
      blockers.push(
        "Allocated PAPER quantity must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        request.buyPrice,
      ) ||
      request.buyPrice <=
        0
    ) {
      blockers.push(
        "BUY limit price must be a positive finite number before quantity normalization.",
      );
    }

    if (
      !Number.isFinite(
        request.sellPrice,
      ) ||
      request.sellPrice <=
        0
    ) {
      blockers.push(
        "SELL limit price must be a positive finite number before quantity normalization.",
      );
    }

    const capabilityLegs = [
      {
        capability:
          request.buyCapability,
        price:
          request.buyPrice,
      },
      {
        capability:
          request.sellCapability,
        price:
          request.sellPrice,
      },
    ];

    if (
      request.buyCapability ===
        null
    ) {
      blockers.push(
        "BUY exchange capability evidence is unavailable for the selected market.",
      );
    }

    if (
      request.sellCapability ===
        null
    ) {
      blockers.push(
        "SELL exchange capability evidence is unavailable for the selected market.",
      );
    }

    const completeCapabilityLegs =
      capabilityLegs.filter(
        (
          leg,
        ): leg is {
          capability:
            ExchangeMarketCapability;
          price: number;
        } =>
          leg.capability !==
          null,
      );

    const legs =
      completeCapabilityLegs.map(
        (
          leg,
        ) =>
          this.createLegEvidence(
            leg.capability,
            leg.price,
            null,
          ),
      );

    if (
      completeCapabilityLegs.length !==
        2
    ) {
      return this.blockedReport(
        request.rawQuantity,
        null,
        legs,
        blockers,
      );
    }

    const completeCapabilities =
      completeCapabilityLegs.map(
        (
          leg,
        ) =>
          leg.capability,
      );

    const incompleteIncrementCapabilities =
      completeCapabilities.filter(
        (capability) =>
          !this.hasValidIncrementEvidence(
            capability,
          ),
      );

    const incrementEvidenceComplete =
      incompleteIncrementCapabilities.length ===
        0;

    const paperOnlyFallbackUsed =
      !incrementEvidenceComplete &&
      request.allowIncompleteIncrementEvidenceForPaper ===
        true;

    for (
      const capability of
        completeCapabilities
    ) {
      if (
        !this.hasValidIncrementEvidence(
          capability,
        ) &&
        !paperOnlyFallbackUsed
      ) {
        blockers.push(
          `${capability.exchange} quantity increment/precision evidence is unavailable or invalid.`,
        );
      }

      if (
        capability.notional
          .minimumNotional ===
          null ||
        !Number.isFinite(
          capability.notional
            .minimumNotional,
        ) ||
        capability.notional
          .minimumNotional <
          0
      ) {
        blockers.push(
          `${capability.exchange} minimum-notional evidence is unavailable or invalid.`,
        );
      }
    }

    const commonIncrement =
      blockers.length ===
        0
        ? this.commonQuantityIncrement(
            completeCapabilities,
          )
        : null;

    if (
      commonIncrement ===
        null
    ) {
      if (
        blockers.length ===
          0
      ) {
        blockers.push(
          "A safe shared quantity increment could not be represented for both exchanges.",
        );
      }

      return this.blockedReport(
        request.rawQuantity,
        null,
        legs,
        blockers,
        incrementEvidenceComplete,
        paperOnlyFallbackUsed,
      );
    }

    const maximumQuantity =
      Math.min(
        request.rawQuantity,
        ...completeCapabilities.map(
          (
            capability,
          ) =>
            capability.quantity
              .maximumQuantity ??
            Number.POSITIVE_INFINITY,
        ),
      );

    const normalizedQuantity =
      this.roundDownToIncrement(
        maximumQuantity,
        commonIncrement,
      );

    if (
      !Number.isFinite(
        normalizedQuantity,
      ) ||
      normalizedQuantity <=
        0
    ) {
      blockers.push(
        "Allocated PAPER capital is below the shared exchange quantity increment.",
      );
    }

    const evaluatedLegs =
      completeCapabilityLegs.map(
        (
          leg,
        ) =>
          this.createLegEvidence(
            leg.capability,
            leg.price,
            normalizedQuantity > 0
              ? normalizedQuantity
              : null,
          ),
      );

    if (
      normalizedQuantity >
        0
    ) {
      for (
        const leg of
          evaluatedLegs
      ) {
        this.validateNormalizedLeg(
          normalizedQuantity,
          leg,
          blockers,
        );
      }
    }

    const quantityTolerance =
      Math.max(
        1e-12,
        Math.abs(
          request.rawQuantity,
        ) *
          1e-12,
      );

    const quantityNeverIncreased =
      normalizedQuantity <=
      request.rawQuantity +
        quantityTolerance;

    if (
      !quantityNeverIncreased
    ) {
      blockers.push(
        "Quantity normalization attempted to increase allocated exposure.",
      );
    }

    if (
      blockers.length >
        0
    ) {
      return this.blockedReport(
        request.rawQuantity,
        commonIncrement,
        evaluatedLegs,
        blockers,
        incrementEvidenceComplete,
        paperOnlyFallbackUsed,
      );
    }

    const reductionQuantity =
      Math.max(
        0,
        request.rawQuantity -
          normalizedQuantity,
      );

    const reductionPercent =
      request.rawQuantity >
        0
        ? (
            reductionQuantity /
            request.rawQuantity
          ) *
          100
        : null;

    return {
      version:
        "81.0",

      state:
        reductionQuantity <=
        quantityTolerance
          ? "UNCHANGED"
          : "NORMALIZED",

      rawQuantity:
        request.rawQuantity,

      normalizedQuantity,

      commonQuantityIncrement:
        commonIncrement,

      reductionQuantity,

      reductionPercent,

      roundDownOnly:
        true,

      quantityNeverIncreased,

      incrementEvidenceComplete,

      paperOnlyFallbackUsed,

      liveOrderSafe:
        incrementEvidenceComplete,

      legs:
        evaluatedLegs,

      blockers:
        [],
    };
  }

  private blockedReport(
    rawQuantity:
      number,

    commonQuantityIncrement:
      number | null,

    legs:
      readonly CrossExchangeQuantityNormalizationLegEvidence[],

    blockers:
      readonly string[],

    incrementEvidenceComplete =
      false,

    paperOnlyFallbackUsed =
      false,
  ): CrossExchangeQuantityNormalizationReport {
    return {
      version:
        "81.0",

      state:
        "BLOCKED",

      rawQuantity,

      normalizedQuantity:
        null,

      commonQuantityIncrement,

      reductionQuantity:
        null,

      reductionPercent:
        null,

      roundDownOnly:
        true,

      quantityNeverIncreased:
        true,

      incrementEvidenceComplete,

      paperOnlyFallbackUsed,

      liveOrderSafe:
        false,

      legs,

      blockers: [
        ...blockers,
      ],
    };
  }

  private createLegEvidence(
    capability:
      ExchangeMarketCapability,

    price:
      number,

    normalizedQuantity:
      number | null,
  ): CrossExchangeQuantityNormalizationLegEvidence {
    return {
      exchange:
        capability.exchange,

      price,

      quantityStep:
        capability.quantity
          .quantityStep,

      quantityPrecision:
        capability.quantity
          .quantityPrecision,

      minimumQuantity:
        capability.quantity
          .minimumQuantity,

      maximumQuantity:
        capability.quantity
          .maximumQuantity,

      minimumNotional:
        capability.notional
          .minimumNotional,

      maximumNotional:
        capability.notional
          .maximumNotional,

      normalizedNotional:
        normalizedQuantity !==
          null &&
        Number.isFinite(
          price,
        )
          ? normalizedQuantity *
            price
          : null,
    };
  }

  private validateNormalizedLeg(
    quantity:
      number,

    leg:
      CrossExchangeQuantityNormalizationLegEvidence,

    blockers:
      string[],
  ): void {
    if (
      leg.minimumQuantity !==
        null &&
      quantity <
        leg.minimumQuantity
    ) {
      blockers.push(
        `${leg.exchange} normalized quantity ${quantity} is below minimum ${leg.minimumQuantity}.`,
      );
    }

    if (
      leg.maximumQuantity !==
        null &&
      quantity >
        leg.maximumQuantity
    ) {
      blockers.push(
        `${leg.exchange} normalized quantity ${quantity} exceeds maximum ${leg.maximumQuantity}.`,
      );
    }

    if (
      leg.minimumNotional !==
        null &&
      (
        leg.normalizedNotional ===
          null ||
        isMateriallyBelowMinimumNotional(
          leg.normalizedNotional,
          leg.minimumNotional,
        )
      )
    ) {
      blockers.push(
        `${leg.exchange} normalized order notional is below minimum ${leg.minimumNotional}.`,
      );
    }

    if (
      leg.maximumNotional !==
        null &&
      leg.normalizedNotional !==
        null &&
      leg.normalizedNotional >
        leg.maximumNotional
    ) {
      blockers.push(
        `${leg.exchange} normalized order notional exceeds maximum ${leg.maximumNotional}.`,
      );
    }
  }

  private hasValidIncrementEvidence(
    capability:
      ExchangeMarketCapability,
  ): boolean {
    const step =
      capability.quantity
        .quantityStep;

    const precision =
      capability.quantity
        .quantityPrecision;

    return (
      (
        step ===
          null ||
        (
          Number.isFinite(
            step,
          ) &&
          step >
            0
        )
      ) &&
      (
        precision ===
          null ||
        (
          Number.isSafeInteger(
            precision,
          ) &&
          precision >=
            0 &&
          precision <=
            12
        )
      ) &&
      (
        (
          step !==
            null &&
          Number.isFinite(
            step,
          ) &&
          step >
            0
        ) ||
        (
          precision !==
            null &&
          Number.isSafeInteger(
            precision,
          ) &&
          precision >=
            0 &&
          precision <=
            12
        )
      )
    );
  }

  private commonQuantityIncrement(
    capabilities:
      readonly ExchangeMarketCapability[],
  ): number | null {
    const increments:
      number[] = [];

    for (
      const capability of
        capabilities
    ) {
      const step =
        capability.quantity
          .quantityStep;

      const precision =
        capability.quantity
          .quantityPrecision;

      if (
        step !==
          null &&
        Number.isFinite(
          step,
        ) &&
        step >
          0
      ) {
        increments.push(
          step,
        );
      }

      if (
        precision !==
          null &&
        Number.isSafeInteger(
          precision,
        ) &&
        precision >=
          0 &&
        precision <=
          12
      ) {
        increments.push(
          10 **
            -precision,
        );
      }
    }

    if (
      increments.length ===
        0
    ) {
      return null;
    }

    const decimalPlaces =
      Math.min(
        12,
        Math.max(
          ...increments.map(
            (
              increment,
            ) =>
              this.decimalPlaces(
                increment,
              ),
          ),
        ),
      );

    const scale =
      10 **
      decimalPlaces;

    const integerSteps =
      increments.map(
        (
          increment,
        ) =>
          Math.round(
            increment *
              scale,
          ),
      );

    if (
      integerSteps.some(
        (
          integerStep,
        ) =>
          !Number.isSafeInteger(
            integerStep,
          ) ||
          integerStep <=
            0,
      )
    ) {
      return null;
    }

    let common =
      integerSteps[0];

    for (
      const integerStep of
        integerSteps.slice(
          1,
        )
    ) {
      common =
        this.leastCommonMultiple(
          common,
          integerStep,
        );

      if (
        !Number.isSafeInteger(
          common,
        ) ||
        common <=
          0
      ) {
        return null;
      }
    }

    const result =
      common /
      scale;

    return Number.isFinite(
      result,
    ) &&
      result >
        0
      ? result
      : null;
  }

  private roundDownToIncrement(
    quantity:
      number,

    increment:
      number,
  ): number {
    const decimalPlaces =
      Math.min(
        12,
        this.decimalPlaces(
          increment,
        ),
      );

    const ratio =
      quantity /
      increment;

    const nearestInteger =
      Math.round(
        ratio,
      );

    const units =
      Math.abs(
        ratio -
          nearestInteger,
      ) <=
        1e-10
        ? nearestInteger
        : Math.floor(
            ratio,
          );

    return Number(
      (
        units *
        increment
      ).toFixed(
        decimalPlaces,
      ),
    );
  }

  private leastCommonMultiple(
    left:
      number,

    right:
      number,
  ): number {
    return Math.abs(
      left /
        this.greatestCommonDivisor(
          left,
          right,
        ) *
        right,
    );
  }

  private greatestCommonDivisor(
    left:
      number,

    right:
      number,
  ): number {
    let first =
      Math.abs(
        Math.trunc(
          left,
        ),
      );

    let second =
      Math.abs(
        Math.trunc(
          right,
        ),
      );

    while (
      second !==
        0
    ) {
      const remainder =
        first %
        second;

      first =
        second;

      second =
        remainder;
    }

    return first ||
      1;
  }

  private decimalPlaces(
    value:
      number,
  ): number {
    const normalized =
      value.toString()
        .toLowerCase();

    const [
      coefficient,
      exponentText,
    ] =
      normalized.split(
        "e",
      );

    const coefficientDecimals =
      coefficient.split(
        ".",
      )[1]?.length ??
      0;

    const exponent =
      exponentText
        ? Number(
            exponentText,
          )
        : 0;

    return Math.max(
      0,
      coefficientDecimals -
        exponent,
    );
  }
}

function isMateriallyBelowMinimumNotional(
  normalizedNotional: number,
  minimumNotional: number,
): boolean {
  const floatingPointTolerance = Math.max(
    1e-12,
    Math.abs(minimumNotional) * 1e-12,
  );

  return normalizedNotional + floatingPointTolerance < minimumNotional;
}

export const crossExchangeExecutableQuantityNormalizer =
  new CrossExchangeExecutableQuantityNormalizer();
