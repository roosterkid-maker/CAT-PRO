import type {
  UnoCoinBaseCoinSetting,
} from "./types";

export interface UnoCoinFeeRules {
  makerPercent: number;

  takerPercent: number;

  makerFeeRate: number;

  takerFeeRate: number;

  taxPercent: number;

  minimumNotional:
    number | null;

  maximumNotional:
    number | null;

  minimumVolume:
    number | null;
}

export function normalizeUnoCoinFeeRules(
  setting:
    UnoCoinBaseCoinSetting,
): UnoCoinFeeRules | null {
  const makerPercent =
    parseNonNegativeFinite(
      setting.maker_fee,
    );

  const takerPercent =
    parseNonNegativeFinite(
      setting.taker_fee,
    );

  const taxPercent =
    parseNonNegativeFinite(
      setting.tax,
    );

  if (
    makerPercent === null ||
    takerPercent === null ||
    taxPercent === null
  ) {
    return null;
  }

  const taxMultiplier =
    1 +
    taxPercent / 100;

  const minimumNotional =
    maximumPositive(
      setting.min_bid_amount,
      setting.min_ask_amount,
    );

  const maximumNotional =
    minimumPositive(
      setting.max_bid_amount,
      setting.max_ask_amount,
    );

  return {
    makerPercent:
      roundEvidenceNumber(
        makerPercent *
          taxMultiplier,
      ),

    takerPercent:
      roundEvidenceNumber(
        takerPercent *
          taxMultiplier,
      ),

    makerFeeRate:
      roundEvidenceNumber(
        (
          makerPercent *
          taxMultiplier
        ) / 100,
      ),

    takerFeeRate:
      roundEvidenceNumber(
        (
          takerPercent *
          taxMultiplier
        ) / 100,
      ),

    taxPercent,

    minimumNotional,

    maximumNotional,

    minimumVolume:
      parsePositiveFinite(
        setting.min_volume,
      ),
  };
}

function maximumPositive(
  ...values:
    readonly unknown[]
): number | null {
  const parsed =
    values
      .map(
        parsePositiveFinite,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  return parsed.length > 0
    ? Math.max(
        ...parsed,
      )
    : null;
}

function minimumPositive(
  ...values:
    readonly unknown[]
): number | null {
  const parsed =
    values
      .map(
        parsePositiveFinite,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  return parsed.length > 0
    ? Math.min(
        ...parsed,
      )
    : null;
}

function parsePositiveFinite(
  value: unknown,
): number | null {
  const parsed =
    parseNonNegativeFinite(
      value,
    );

  return parsed !== null &&
    parsed > 0
    ? parsed
    : null;
}

function parseNonNegativeFinite(
  value: unknown,
): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          value.trim().length > 0
        ? Number(
            value,
          )
        : Number.NaN;

  return Number.isFinite(
    parsed,
  ) &&
    parsed >= 0
    ? parsed
    : null;
}

function roundEvidenceNumber(
  value: number,
): number {
  return Number(
    value.toFixed(
      12,
    ),
  );
}
