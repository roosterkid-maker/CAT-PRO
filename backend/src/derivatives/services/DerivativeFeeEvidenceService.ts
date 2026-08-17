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
    const record = this.evidence.get(normalizeExchange(exchange));
    return record ? immutableClone(record) : null;
  }

  getSnapshot(now = Date.now()): DerivativeFeeEvidenceSnapshot {
    const evidence = [...this.evidence.values()]
      .sort((first, second) => first.exchange.localeCompare(second.exchange));
    const missingExchanges = EXPECTED_EXCHANGES
      .filter((exchange) => !this.evidence.has(exchange));

    return immutableClone({
      generatedAt: now,
      version: "27.0",
      evidenceStatus: evidence.length === 0
        ? "NO_DATA"
        : missingExchanges.length > 0
          ? "PARTIAL"
          : "AVAILABLE",
      expectedExchanges: [...EXPECTED_EXCHANGES],
      configuredExchanges: evidence.length,
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
