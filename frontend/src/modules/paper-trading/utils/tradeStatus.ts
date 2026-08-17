import type { PaperTrade } from "../types/PaperTrade";

export function isActiveTrade(
  trade: PaperTrade,
): boolean {
  return (
    trade.status === "detected" ||
    trade.status === "validated" ||
    trade.status === "open" ||
    trade.status === "monitoring"
  );
}

export function isClosedTrade(
  trade: PaperTrade,
): boolean {
  return (
    trade.status === "target-hit" ||
    trade.status === "closed" ||
    trade.status === "cancelled" ||
    trade.status === "failed"
  );
}

export function isSuccessfulTrade(
  trade: PaperTrade,
): boolean {
  return (
    trade.status === "target-hit" ||
    trade.status === "closed"
  );
}

export function isFailedTrade(
  trade: PaperTrade,
): boolean {
  return (
    trade.status === "cancelled" ||
    trade.status === "failed"
  );
}