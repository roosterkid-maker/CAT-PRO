export function formatPrice(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "--";
  }

  if (value >= 1000) {
    return value.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (value >= 1) {
    return value.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  if (value > 0) {
    return value.toLocaleString("en-IN", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 8,
    });
  }

  return "0.00";
}