import type {
  Opportunity,
} from "@/modules/arbitrage/types/Opportunity";

export interface LiveCandidateStatus {
  state:
    | "CHECKING"
    | "WAITING"
    | "READY";

  label: string;

  reason: string;
}

const LIVE_ONLY_VENUES =
  new Set([
    "binance",
    "bybit",
    "coindcx",
  ]);

export function resolveLiveCandidateStatus(
  opportunity:
    Pick<
      Opportunity,
      | "market"
      | "buyExchange"
      | "sellExchange"
    >,
): LiveCandidateStatus {
  const market =
    opportunity.market
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/gu,
        "",
      );
  const buyExchange =
    opportunity.buyExchange
      .trim()
      .toLowerCase();
  const sellExchange =
    opportunity.sellExchange
      .trim()
      .toLowerCase();
  const routeEligible =
    market.endsWith(
      "USDT",
    ) &&
    market.length >= 6 &&
    market.length <= 24 &&
    buyExchange !==
      sellExchange &&
    LIVE_ONLY_VENUES.has(
      buyExchange,
    ) &&
    LIVE_ONLY_VENUES.has(
      sellExchange,
    );

  if (!routeEligible) {
    return {
      state:
        "WAITING",
      label:
        "ANALYTICAL ONLY · ROUTE EXCLUDED",
      reason:
        "The LIVE-only Strategy #1 pool accepts current USDT routes between Binance, Bybit and CoinDCX. This analytical route cannot reach order submission.",
    };
  }

  return {
    state:
      "CHECKING",
    label:
      "ENGINE PASS · LIVE PREFLIGHT",
    reason:
      "The analytical engine accepted this route. The LIVE-only runner independently checks authenticated inventory, rules, fees, full depth, stress economics, fresh books, durable authority and final last-look before any order I/O.",
  };
}
