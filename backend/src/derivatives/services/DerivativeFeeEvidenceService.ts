import type {
  DerivativeFeeEvidence,
  DerivativeFeeEvidenceSnapshot,
} from "../models/DerivativeFeeEvidence";

export interface DerivativeFeeConfiguration {
  readonly exchange: string;
  readonly makerPercent: number;
  readonly takerPercent: number;
}

const EXPECTED_EXCHANGES = [
  "binance",
  "bybit",
  "coindcx",
  "coinswitch",
  "zebpay",
] as const;

export class DerivativeFeeEvidenceService {
  private readonly evidence = new Map<string, DerivativeFeeEvidence>();

  constructor(
    configurations: readonly DerivativeFeeConfiguration[] = loadEnvironmentConfiguration(),
    configuredAt = Date.now(),
  ) {
    for (const configuration of configurations) {
      const exchange = normalizeExchange(configuration.exchange);

      if (!exchange) {
        throw new Error("Derivative fee evidence requires an exchange.");
      }

      if (
        !validPercent(configuration.makerPercent) ||
        !validPercent(configuration.takerPercent)
      ) {
        throw new Error(`Invalid derivative fee evidence for ${exchange}.`);
      }

      this.evidence.set(exchange, deepFreeze({
        exchange,
        market: null,
        product: "LINEAR_PERPETUAL",
        makerPercent: configuration.makerPercent,
        takerPercent: configuration.takerPercent,
        source: "EXPLICIT_OPERATOR_CONFIG",
        configuredAt,
        executionAuthorized: false,
        liveExecutionAllowed: false,
      }));
    }
  }

  get(exchange: string): DerivativeFeeEvidence | null {
    const normalized = normalizeExchange(exchange);
    const record = this.evidence.get(normalized) ??
      [...this.evidence.values()].find((item) => item.exchange === normalized) ?? null;
    return record ? immutableClone(record) : null;
  }

  getForMarket(exchange: string, market: string): DerivativeFeeEvidence | null {
    const normalizedExchange = normalizeExchange(exchange);
    const normalizedMarket = market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const exact = this.evidence.get(`${normalizedExchange}:${normalizedMarket}`);
    const venue = this.evidence.get(normalizedExchange);
    const record = exact ?? venue ?? null;
    return record ? immutableClone(record) : null;
  }

  observePublicInstrumentRules(input: {
    readonly exchange: string;
    readonly market: string;
    readonly makerPercent: number;
    readonly takerPercent: number;
    readonly observedAt: number;
  }): void {
    const exchange = normalizeExchange(input.exchange);
    const market = input.market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!exchange || !market || !validPercent(input.makerPercent) ||
        !validPercent(input.takerPercent) || !Number.isSafeInteger(input.observedAt) || input.observedAt <= 0) {
      throw new Error("Invalid public derivative fee evidence.");
    }
    if (this.evidence.has(exchange)) return;
    this.evidence.set(`${exchange}:${market}`, deepFreeze({
      exchange,
      market,
      product: "LINEAR_PERPETUAL",
      makerPercent: input.makerPercent,
      takerPercent: input.takerPercent,
      source: "PUBLIC_INSTRUMENT_RULES",
      configuredAt: input.observedAt,
      executionAuthorized: false,
      liveExecutionAllowed: false,
    }));
  }

  getSnapshot(now = Date.now()): DerivativeFeeEvidenceSnapshot {
    const evidence = [...this.evidence.values()]
      .sort((first, second) => first.exchange.localeCompare(second.exchange));
    const configuredVenueCount = new Set(evidence.map((item) => item.exchange)).size;
    const missingExchanges = EXPECTED_EXCHANGES
      .filter((exchange) => !evidence.some((item) => item.exchange === exchange));

    return immutableClone({
      generatedAt: now,
      version: "27.0",
      evidenceStatus: evidence.length === 0
        ? "NO_DATA"
        : missingExchanges.length > 0
          ? "PARTIAL"
          : "AVAILABLE",
      expectedExchanges: [...EXPECTED_EXCHANGES],
      configuredExchanges: configuredVenueCount,
      evidence,
      missingExchanges,
      safety: {
        undocumentedDefaultAllowed: false,
        feeInferenceAllowed: false,
        orderSubmissionAllowed: false,
        liveExecutionAllowed: false,
      },
    });
  }
}

function loadEnvironmentConfiguration(): DerivativeFeeConfiguration[] {
  const definitions = [
    {
      exchange: "binance",
      maker: "BINANCE_USDM_MAKER_FEE_PERCENT",
      taker: "BINANCE_USDM_TAKER_FEE_PERCENT",
    },
    {
      exchange: "bybit",
      maker: "BYBIT_LINEAR_MAKER_FEE_PERCENT",
      taker: "BYBIT_LINEAR_TAKER_FEE_PERCENT",
    },
    {
      exchange: "coindcx",
      maker: "COINDCX_FUTURES_MAKER_FEE_PERCENT",
      taker: "COINDCX_FUTURES_TAKER_FEE_PERCENT",
    },
    {
      exchange: "coinswitch",
      maker: "COINSWITCH_FUTURES_MAKER_FEE_PERCENT",
      taker: "COINSWITCH_FUTURES_TAKER_FEE_PERCENT",
    },
    {
      exchange: "zebpay",
      maker: "ZEBPAY_FUTURES_MAKER_FEE_PERCENT",
      taker: "ZEBPAY_FUTURES_TAKER_FEE_PERCENT",
    },
  ] as const;
  const configurations: DerivativeFeeConfiguration[] = [];

  for (const definition of definitions) {
    const makerRaw = process.env[definition.maker]?.trim();
    const takerRaw = process.env[definition.taker]?.trim();

    if (!makerRaw && !takerRaw) {
      continue;
    }

    if (!makerRaw || !takerRaw) {
      console.warn(
        `[DerivativeFees] ${definition.exchange} ignored because both ${definition.maker} and ${definition.taker} are required.`,
      );
      continue;
    }

    const makerPercent = Number(makerRaw);
    const takerPercent = Number(takerRaw);

    if (!validPercent(makerPercent) || !validPercent(takerPercent)) {
      console.warn(
        `[DerivativeFees] ${definition.exchange} ignored because configured fee percentages are invalid.`,
      );
      continue;
    }

    configurations.push({
      exchange: definition.exchange,
      makerPercent,
      takerPercent,
    });
  }

  return configurations;
}

function validPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 10;
}

function normalizeExchange(value: string): string {
  return value.trim().toLowerCase();
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

export const derivativeFeeEvidenceService = new DerivativeFeeEvidenceService();
