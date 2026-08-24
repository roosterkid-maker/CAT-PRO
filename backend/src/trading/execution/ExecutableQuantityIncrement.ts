const MAX_DECIMAL_PLACES = 12;

/**
 * Returns the smallest decimal quantity that is an exact multiple of every
 * venue increment. A null result is deliberately fail-closed: callers must
 * not guess a tradable quantity when exchange rules cannot be reconciled.
 */
export function commonExecutableQuantityIncrement(
  increments: readonly number[],
): number | null {
  if (increments.length === 0 || increments.some((value) => !finitePositive(value))) {
    return null;
  }
  const decimalPlaces = Math.max(...increments.map(decimalPlacesFor));
  if (decimalPlaces > MAX_DECIMAL_PLACES) return null;
  const scale = 10 ** decimalPlaces;
  const integerSteps = increments.map((increment) => Math.round(increment * scale));
  if (integerSteps.some((step, index) =>
    !Number.isSafeInteger(step) || step <= 0 ||
    Math.abs(step / scale - increments[index]!) > Math.max(1e-12, increments[index]! * 1e-10),
  )) return null;

  let common = integerSteps[0]!;
  for (const step of integerSteps.slice(1)) {
    common = leastCommonMultiple(common, step);
    if (!Number.isSafeInteger(common) || common <= 0) return null;
  }
  const result = common / scale;
  return finitePositive(result) ? result : null;
}

export function roundDownToExecutableIncrement(
  quantity: number,
  increment: number,
): number {
  if (!Number.isFinite(quantity) || !finitePositive(increment)) return 0;
  const decimalPlaces = Math.min(MAX_DECIMAL_PLACES, decimalPlacesFor(increment));
  const ratio = quantity / increment;
  const nearestInteger = Math.round(ratio);
  const units = Math.abs(ratio - nearestInteger) <= 1e-10
    ? nearestInteger
    : Math.floor(ratio);
  return Number((units * increment).toFixed(decimalPlaces));
}

function leastCommonMultiple(left: number, right: number): number {
  return Math.abs(left / greatestCommonDivisor(left, right) * right);
}

function greatestCommonDivisor(left: number, right: number): number {
  let first = Math.abs(Math.trunc(left));
  let second = Math.abs(Math.trunc(right));
  while (second !== 0) [first, second] = [second, first % second];
  return first || 1;
}

function decimalPlacesFor(value: number): number {
  const [coefficient, exponentText] = value.toString().toLowerCase().split("e");
  const coefficientDecimals = coefficient!.split(".")[1]?.length ?? 0;
  const exponent = exponentText ? Number(exponentText) : 0;
  return Math.max(0, coefficientDecimals - exponent);
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
