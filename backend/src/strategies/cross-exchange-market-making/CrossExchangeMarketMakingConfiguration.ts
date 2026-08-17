/*
 * ============================================================
 * CAT PRO V21.5
 * STRATEGY #2 — CROSS-EXCHANGE MARKET MAKING (XEMM)
 * CONFIGURATION FOUNDATION
 * ============================================================
 *
 * SHADOW only.
 *
 * This configuration authorizes read-only SHADOW maker-price
 * calculation, explicitly configured maker lifecycle simulation,
 * conservative queue-aware partial-fill simulation and SHADOW hedge evidence.
 * It does not authorize PAPER, LIVE, capital reservation or orders.
 */

import {
  CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,
} from "../models/StrategyMetadata";

export type CrossExchangeMarketMakingMode =
  "SHADOW";

export type CrossExchangeMarketMakingConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "FOUNDATION_READY";

export type CrossExchangeMarketMakingConfigurationBlocker =
  | "STRATEGY_DISABLED"
  | "MAKER_EXCHANGE_REQUIRED"
  | "HEDGE_EXCHANGE_REQUIRED"
  | "MARKET_ALLOWLIST_REQUIRED"
  | "MINIMUM_RETAINED_EDGE_REQUIRED";

export type CrossExchangeMarketMakingLifecycleState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type CrossExchangeMarketMakingLifecycleBlocker =
  | "LIFECYCLE_SIMULATION_DISABLED"
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "SHADOW_ORDER_QUANTITY_REQUIRED"
  | "MAXIMUM_ORDER_AGE_REQUIRED"
  | "MINIMUM_REPRICE_TICKS_REQUIRED";

export interface CrossExchangeMarketMakingLifecycleConfigurationInput {
  readonly enabled?:
    boolean;

  readonly quantityByMarket?:
    Readonly<Record<string, number>>;

  readonly maximumOrderAgeMs?:
    number | null;

  readonly minimumRepriceTicks?:
    number | null;
}

export type CrossExchangeMarketMakingFillState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type CrossExchangeMarketMakingFillConfigurationBlocker =
  | "FILL_SIMULATION_DISABLED"
  | "MAKER_LIFECYCLE_NOT_READY"
  | "MINIMUM_RESTING_TIME_REQUIRED"
  | "MINIMUM_TRADE_THROUGH_TICKS_REQUIRED"
  | "HEDGE_INTENT_TTL_REQUIRED"
  | "MAXIMUM_PUBLIC_TRADE_AGE_REQUIRED";

export interface CrossExchangeMarketMakingFillConfigurationInput {
  readonly enabled?:
    boolean;

  readonly minimumRestingTimeMs?:
    number | null;

  readonly minimumTradeThroughTicks?:
    number | null;

  readonly hedgeIntentTtlMs?:
    number | null;

  readonly queueAwarePartialFillsEnabled?:
    boolean;

  readonly maximumPublicTradeAgeMs?:
    number | null;
}

export interface CrossExchangeMarketMakingVenuePairInput {
  readonly makerExchange: string;
  readonly hedgeExchange: string;
}

export interface CrossExchangeMarketMakingVenuePair {
  readonly key: string;
  readonly priority: number;
  readonly makerExchange: string;
  readonly hedgeExchange: string;
}

export interface CrossExchangeMarketMakingRouteStabilityConfigurationInput {
  readonly minimumConsecutivePasses?: number;
  readonly minimumDwellMs?: number;
  readonly failoverCooldownMs?: number;
}

export interface CrossExchangeMarketMakingConfigurationInput {
  readonly enabled?:
    boolean;

  readonly mode?:
    CrossExchangeMarketMakingMode;

  readonly makerExchange?:
    string | null;

  readonly hedgeExchange?:
    string | null;

  readonly venuePairs?:
    readonly CrossExchangeMarketMakingVenuePairInput[];

  readonly routeStability?:
    CrossExchangeMarketMakingRouteStabilityConfigurationInput;

  readonly marketAllowlist?:
    readonly string[];

  readonly minimumRetainedEdgePercent?:
    number | null;

  readonly maximumCapabilityAgeMs?:
    number;

  readonly makerLifecycle?:
    CrossExchangeMarketMakingLifecycleConfigurationInput;

  readonly makerFill?:
    CrossExchangeMarketMakingFillConfigurationInput;
}

export interface CrossExchangeMarketMakingConfiguration {
  readonly version:
    "21.5";

  readonly strategyId:
    "cross-exchange-market-making";

  readonly enabled:
    boolean;

  readonly mode:
    "SHADOW";

  readonly makerExchange:
    string | null;

  readonly hedgeExchange:
    string | null;

  readonly venuePairs:
    readonly CrossExchangeMarketMakingVenuePair[];

  readonly routeStability: {
    readonly minimumConsecutivePasses: number;
    readonly minimumDwellMs: number;
    readonly failoverCooldownMs: number;
  };

  readonly marketAllowlist:
    readonly string[];

  readonly minimumRetainedEdgePercent:
    number | null;

  readonly maximumCapabilityAgeMs:
    number;

  readonly makerLifecycle: {
    readonly enabled:
      boolean;

    readonly quantityByMarket:
      Readonly<Record<string, number>>;

    readonly maximumOrderAgeMs:
      number | null;

    readonly minimumRepriceTicks:
      number | null;

    readonly state:
      CrossExchangeMarketMakingLifecycleState;

    readonly blockers:
      readonly CrossExchangeMarketMakingLifecycleBlocker[];
  };

  readonly makerFill: {
    readonly enabled:
      boolean;

    readonly minimumRestingTimeMs:
      number | null;

    readonly minimumTradeThroughTicks:
      number | null;

    readonly hedgeIntentTtlMs:
      number | null;

    readonly queueAwarePartialFillsEnabled:
      boolean;

    readonly maximumPublicTradeAgeMs:
      number | null;

    readonly state:
      CrossExchangeMarketMakingFillState;

    readonly blockers:
      readonly CrossExchangeMarketMakingFillConfigurationBlocker[];
  };

  readonly state:
    CrossExchangeMarketMakingConfigurationState;

  readonly blockers:
    readonly CrossExchangeMarketMakingConfigurationBlocker[];

  readonly safety: {
    readonly shadowEvidenceOnly:
      true;

    readonly makerPriceCalculationAllowed:
      true;

    readonly makerOrderSimulationAllowed:
      true;

    readonly makerFillSimulationAllowed:
      true;

    readonly queueAwarePartialFillSimulationAllowed:
      true;

    readonly hedgeIntentGenerationAllowed:
      true;

    readonly operatorApprovedVenuePairsOnly:
      true;

    readonly paperExecutionAllowed:
      false;

    readonly liveExecutionAllowed:
      false;

    readonly capitalReservationAllowed:
      false;

    readonly orderSubmissionAllowed:
      false;
  };
}

const MARKET_PATTERN =
  /^[A-Z0-9]+$/;

const EXCHANGE_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createCrossExchangeMarketMakingConfiguration(
  input:
    CrossExchangeMarketMakingConfigurationInput = {},
): CrossExchangeMarketMakingConfiguration {
  const mode =
    input.mode ??
    "SHADOW";

  if (
    mode !==
    "SHADOW"
  ) {
    throw new Error(
      "Cross-exchange market making is SHADOW-only in V21.5.",
    );
  }

  if (
    input.enabled !==
      undefined &&
    typeof input.enabled !==
      "boolean"
  ) {
    throw new Error(
      "XEMM enabled must be a boolean.",
    );
  }

  const legacyMakerExchange =
    normalizeOptionalExchange(
      input.makerExchange,
      "makerExchange",
    );

  const legacyHedgeExchange =
    normalizeOptionalExchange(
      input.hedgeExchange,
      "hedgeExchange",
    );

  if (
    legacyMakerExchange !==
      null &&
    legacyHedgeExchange !==
      null &&
    legacyMakerExchange ===
      legacyHedgeExchange
  ) {
    throw new Error(
      "XEMM makerExchange and hedgeExchange must be different exchanges.",
    );
  }

  const venuePairs =
    normalizeVenuePairs(
      input.venuePairs,
      legacyMakerExchange,
      legacyHedgeExchange,
    );

  const routeStability = {
    minimumConsecutivePasses: normalizeRouteStabilityInteger(
      input.routeStability?.minimumConsecutivePasses ?? 3,
      "minimumConsecutivePasses",
      false,
    ),
    minimumDwellMs: normalizeRouteStabilityInteger(
      input.routeStability?.minimumDwellMs ?? 2_000,
      "minimumDwellMs",
      true,
    ),
    failoverCooldownMs: normalizeRouteStabilityInteger(
      input.routeStability?.failoverCooldownMs ?? 5_000,
      "failoverCooldownMs",
      true,
    ),
  };

  const makerExchange =
    venuePairs[0]
      ?.makerExchange ??
    legacyMakerExchange;

  const hedgeExchange =
    venuePairs[0]
      ?.hedgeExchange ??
    legacyHedgeExchange;

  const marketAllowlist =
    normalizeMarketAllowlist(
      input.marketAllowlist ??
      [],
    );

  const enabled =
    input.enabled ??
    false;

  const minimumRetainedEdgePercent =
    normalizeMinimumRetainedEdgePercent(
      input.minimumRetainedEdgePercent,
    );

  const maximumCapabilityAgeMs =
    input.maximumCapabilityAgeMs ??
    300_000;

  if (
    !Number.isSafeInteger(
      maximumCapabilityAgeMs,
    ) ||
    maximumCapabilityAgeMs <=
      0
  ) {
    throw new Error(
      "XEMM maximumCapabilityAgeMs must be a positive safe integer.",
    );
  }

  const blockers:
    CrossExchangeMarketMakingConfigurationBlocker[] =
    [];

  if (
    !enabled
  ) {
    blockers.push(
      "STRATEGY_DISABLED",
    );
  }

  if (
    makerExchange ===
    null
  ) {
    blockers.push(
      "MAKER_EXCHANGE_REQUIRED",
    );
  }

  if (
    hedgeExchange ===
    null
  ) {
    blockers.push(
      "HEDGE_EXCHANGE_REQUIRED",
    );
  }

  if (
    marketAllowlist.length ===
    0
  ) {
    blockers.push(
      "MARKET_ALLOWLIST_REQUIRED",
    );
  }

  if (
    minimumRetainedEdgePercent ===
    null
  ) {
    blockers.push(
      "MINIMUM_RETAINED_EDGE_REQUIRED",
    );
  }

  const state:
    CrossExchangeMarketMakingConfigurationState =
    !enabled
      ? "DISABLED"
      : blockers.length >
          0
        ? "INCOMPLETE"
        : "FOUNDATION_READY";

  const makerLifecycle =
    createMakerLifecycleConfiguration(
      input.makerLifecycle,
      marketAllowlist,
      state,
    );

  const makerFill =
    createMakerFillConfiguration(
      input.makerFill,
      makerLifecycle.state,
    );

  return deepFreeze({
    version:
      "21.5",

    strategyId:
      CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,

    enabled,

    mode,

    makerExchange,

    hedgeExchange,

    venuePairs,

    routeStability,

    marketAllowlist,

    minimumRetainedEdgePercent,

    maximumCapabilityAgeMs,

    makerLifecycle,

    makerFill,

    state,

    blockers,

    safety: {
      shadowEvidenceOnly:
        true,

      makerPriceCalculationAllowed:
        true,

      makerOrderSimulationAllowed:
        true,

      makerFillSimulationAllowed:
        true,

      queueAwarePartialFillSimulationAllowed:
        true,

      hedgeIntentGenerationAllowed:
        true,

      operatorApprovedVenuePairsOnly:
        true,

      paperExecutionAllowed:
        false,

      liveExecutionAllowed:
        false,

      capitalReservationAllowed:
        false,

      orderSubmissionAllowed:
        false,
    },
  });
}

function normalizeRouteStabilityInteger(
  value: number,
  label: string,
  allowZero: boolean,
): number {
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`XEMM routeStability.${label} must be a ${allowZero ? "non-negative" : "positive"} safe integer.`);
  }
  return value;
}

function createMakerFillConfiguration(
  input:
    CrossExchangeMarketMakingFillConfigurationInput | undefined,

  lifecycleState:
    CrossExchangeMarketMakingLifecycleState,
): CrossExchangeMarketMakingConfiguration["makerFill"] {
  const enabled =
    input?.enabled ??
    false;

  if (
    typeof enabled !==
    "boolean"
  ) {
    throw new Error(
      "XEMM makerFill.enabled must be a boolean.",
    );
  }

  const minimumRestingTimeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.minimumRestingTimeMs,
      "makerFill.minimumRestingTimeMs",
    );

  const minimumTradeThroughTicks =
    normalizeOptionalPositiveSafeInteger(
      input?.minimumTradeThroughTicks,
      "makerFill.minimumTradeThroughTicks",
    );

  const hedgeIntentTtlMs =
    normalizeOptionalPositiveSafeInteger(
      input?.hedgeIntentTtlMs,
      "makerFill.hedgeIntentTtlMs",
    );

  const queueAwarePartialFillsEnabled =
    input?.queueAwarePartialFillsEnabled ??
    false;

  if (
    typeof queueAwarePartialFillsEnabled !==
      "boolean"
  ) {
    throw new Error(
      "XEMM makerFill.queueAwarePartialFillsEnabled must be a boolean.",
    );
  }

  const maximumPublicTradeAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumPublicTradeAgeMs,
      "makerFill.maximumPublicTradeAgeMs",
    );

  const blockers:
    CrossExchangeMarketMakingFillConfigurationBlocker[] =
    [];

  if (
    !enabled
  ) {
    blockers.push(
      "FILL_SIMULATION_DISABLED",
    );
  }

  if (
    lifecycleState !==
    "READY"
  ) {
    blockers.push(
      "MAKER_LIFECYCLE_NOT_READY",
    );
  }

  if (
    minimumRestingTimeMs ===
    null
  ) {
    blockers.push(
      "MINIMUM_RESTING_TIME_REQUIRED",
    );
  }

  if (
    minimumTradeThroughTicks ===
    null
  ) {
    blockers.push(
      "MINIMUM_TRADE_THROUGH_TICKS_REQUIRED",
    );
  }

  if (
    hedgeIntentTtlMs ===
      null
  ) {
    blockers.push(
      "HEDGE_INTENT_TTL_REQUIRED",
    );
  }

  if (
    queueAwarePartialFillsEnabled &&
    maximumPublicTradeAgeMs ===
      null
  ) {
    blockers.push(
      "MAXIMUM_PUBLIC_TRADE_AGE_REQUIRED",
    );
  }

  return {
    enabled,
    minimumRestingTimeMs,
    minimumTradeThroughTicks,
    hedgeIntentTtlMs,
    queueAwarePartialFillsEnabled,
    maximumPublicTradeAgeMs,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length >
            0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function createMakerLifecycleConfiguration(
  input:
    CrossExchangeMarketMakingLifecycleConfigurationInput | undefined,

  marketAllowlist:
    readonly string[],

  configurationState:
    CrossExchangeMarketMakingConfigurationState,
): CrossExchangeMarketMakingConfiguration["makerLifecycle"] {
  const enabled =
    input?.enabled ??
    false;

  if (
    typeof enabled !==
    "boolean"
  ) {
    throw new Error(
      "XEMM makerLifecycle.enabled must be a boolean.",
    );
  }

  const quantityByMarket =
    normalizeLifecycleQuantities(
      input?.quantityByMarket ??
        {},
      marketAllowlist,
    );

  const maximumOrderAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumOrderAgeMs,
      "makerLifecycle.maximumOrderAgeMs",
    );

  const minimumRepriceTicks =
    normalizeOptionalPositiveSafeInteger(
      input?.minimumRepriceTicks,
      "makerLifecycle.minimumRepriceTicks",
    );

  const blockers:
    CrossExchangeMarketMakingLifecycleBlocker[] =
    [];

  if (
    !enabled
  ) {
    blockers.push(
      "LIFECYCLE_SIMULATION_DISABLED",
    );
  }

  if (
    configurationState !==
    "FOUNDATION_READY"
  ) {
    blockers.push(
      "STRATEGY_CONFIGURATION_NOT_READY",
    );
  }

  if (
    marketAllowlist.some(
      (market) =>
        quantityByMarket[market] ===
        undefined,
    )
  ) {
    blockers.push(
      "SHADOW_ORDER_QUANTITY_REQUIRED",
    );
  }

  if (
    maximumOrderAgeMs ===
    null
  ) {
    blockers.push(
      "MAXIMUM_ORDER_AGE_REQUIRED",
    );
  }

  if (
    minimumRepriceTicks ===
    null
  ) {
    blockers.push(
      "MINIMUM_REPRICE_TICKS_REQUIRED",
    );
  }

  return {
    enabled,
    quantityByMarket,
    maximumOrderAgeMs,
    minimumRepriceTicks,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length >
            0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeLifecycleQuantities(
  input:
    Readonly<Record<string, number>>,

  marketAllowlist:
    readonly string[],
): Record<string, number> {
  if (
    !input ||
    typeof input !==
      "object" ||
    Array.isArray(
      input,
    )
  ) {
    throw new Error(
      "XEMM makerLifecycle.quantityByMarket must be an object.",
    );
  }

  const normalized:
    Record<string, number> =
    {};

  for (
    const [
      rawMarket,
      quantity,
    ]
    of Object.entries(
      input,
    )
  ) {
    const market =
      normalizeMarketIdentifier(
        rawMarket,
      );

    if (
      !marketAllowlist.includes(
        market,
      )
    ) {
      throw new Error(
        `XEMM lifecycle quantity market is not allowlisted: ${market}`,
      );
    }

    if (
      !Number.isFinite(
        quantity,
      ) ||
      quantity <=
        0
    ) {
      throw new Error(
        `XEMM lifecycle quantity must be a positive finite number: ${market}`,
      );
    }

    normalized[market] =
      quantity;
  }

  return Object.fromEntries(
    Object.entries(
      normalized,
    ).sort(
      ([first], [second]) =>
        first.localeCompare(
          second,
        ),
    ),
  );
}

function normalizeOptionalPositiveSafeInteger(
  value:
    number | null | undefined,

  field:
    string,
): number | null {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }

  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      `XEMM ${field} must be a positive safe integer.`,
    );
  }

  return value;
}

function normalizeMinimumRetainedEdgePercent(
  value:
    number | null | undefined,
): number | null {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }

  if (
    !Number.isFinite(
      value,
    ) ||
    value <
      0
  ) {
    throw new Error(
      "XEMM minimumRetainedEdgePercent must be a finite non-negative number.",
    );
  }

  return value;
}

function normalizeOptionalExchange(
  value:
    string | null | undefined,

  field:
    string,
): string | null {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !EXCHANGE_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `XEMM ${field} must be a normalized exchange identifier.`,
    );
  }

  return normalized;
}

function normalizeVenuePairs(
  input: readonly CrossExchangeMarketMakingVenuePairInput[] | undefined,
  legacyMakerExchange: string | null,
  legacyHedgeExchange: string | null,
): CrossExchangeMarketMakingVenuePair[] {
  if (input === undefined) {
    return legacyMakerExchange && legacyHedgeExchange
      ? [{
          key: `${legacyMakerExchange}>${legacyHedgeExchange}`,
          priority: 0,
          makerExchange: legacyMakerExchange,
          hedgeExchange: legacyHedgeExchange,
        }]
      : [];
  }

  if (!Array.isArray(input)) {
    throw new Error("XEMM venuePairs must be an array.");
  }

  if (input.length > 20) {
    throw new Error("XEMM venuePairs cannot contain more than 20 routes.");
  }

  const unique = new Map<string, Omit<CrossExchangeMarketMakingVenuePair, "priority">>();
  for (const [index, pair] of input.entries()) {
    if (!pair || typeof pair !== "object") {
      throw new Error(`XEMM venuePairs[${index}] must be an object.`);
    }
    const makerExchange = normalizeOptionalExchange(pair.makerExchange, `venuePairs[${index}].makerExchange`);
    const hedgeExchange = normalizeOptionalExchange(pair.hedgeExchange, `venuePairs[${index}].hedgeExchange`);
    if (!makerExchange || !hedgeExchange) {
      throw new Error(`XEMM venuePairs[${index}] requires maker and hedge exchanges.`);
    }
    if (makerExchange === hedgeExchange) {
      throw new Error(`XEMM venuePairs[${index}] maker and hedge exchanges must differ.`);
    }
    const key = `${makerExchange}>${hedgeExchange}`;
    if (!unique.has(key)) unique.set(key, {key, makerExchange, hedgeExchange});
  }

  return [...unique.values()].map((pair, priority) => ({...pair, priority}));
}

function normalizeMarketAllowlist(
  markets:
    readonly string[],
): string[] {
  if (
    !Array.isArray(
      markets,
    )
  ) {
    throw new Error(
      "XEMM marketAllowlist must be an array.",
    );
  }

  const normalized =
    markets.map(
      (market) => {
        if (
          typeof market !==
          "string"
        ) {
          throw new Error(
            "XEMM marketAllowlist entries must be strings.",
          );
        }

        return normalizeMarketIdentifier(
          market,
        );
      },
    );

  return Array.from(
    new Set(
      normalized,
    ),
  ).sort();
}

function normalizeMarketIdentifier(
  market:
    string,
): string {
  const value =
    market
      .trim()
      .toUpperCase()
      .replace(
        /[\s_\-/]+/g,
        "",
      );

  if (
    !MARKET_PATTERN.test(
      value,
    )
  ) {
    throw new Error(
      `Invalid XEMM market identifier: ${market}`,
    );
  }

  return value;
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}
