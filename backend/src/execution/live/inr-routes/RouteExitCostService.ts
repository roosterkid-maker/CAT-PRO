import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

/*
 * ROUTE EXIT COST. A route that buys a coin on exchange A and sells it on B
 * piles the coin up on A; the trade only repeats (and its profit is only
 * real) once that coin can be withdrawn from A to B. This service knows, per
 * coin and exchange, whether that withdrawal is possible and what it costs:
 *
 *   UnoCoin  flat fee and the one network it sends on (wallet API); it has
 *            no "withdraw enabled" flag, so the operator marks closed coins
 *   Binance  per-network withdraw switch and fee (coin config API)
 *   Bybit    per-chain withdraw/deposit switches and fee (coin info API)
 *   CoinDCX, CoinSwitch, UnoCoin  for this account no coin withdrawal and
 *            only a short deposit list (UnoCoin: DASH and SKY refused):
 *            CLOSED unless the operator confirms a coin (operator,
 *            2026-09-25); a confirmed UnoCoin coin uses its API fee
 *
 * A TWO-WAY route (its reverse direction also trades, per the coin study)
 * needs no transfer at all: its stock refills by trading back. It is
 * allowed whatever the transfer status.
 *
 * The operator can also mark a DESTINATION that does not accept a coin at
 * all (e.g. CoinSwitch lists no GRAM deposit), which no API reports.
 *
 * A fee is spread over a batch of trades moved together; a route whose net
 * after that share falls below the live threshold should not trade.
 */
export type ExitStatus = "OK" | "CLOSED" | "UNVERIFIED" | "UNKNOWN" | "TWO_WAY";

export interface ExitCost {
  readonly status: ExitStatus;
  readonly network: string | null;
  /** Withdrawal fee in units of the coin (null when unknown). */
  readonly feeUnits: number | null;
  readonly detail: string;
}

export interface ExitNetwork {
  readonly network: string;
  readonly withdrawEnabled: boolean;
  readonly depositEnabled: boolean | null;
  readonly withdrawFee: number | null;
}

export interface ExitCostSources {
  /** UnoCoin: coin -> fee and the only network it uses. */
  unocoin(): Promise<ReadonlyMap<string, {feeUnits: number; network: string}>>;
  binance(): Promise<ReadonlyMap<string, readonly ExitNetwork[]>>;
  bybit(): Promise<ReadonlyMap<string, readonly ExitNetwork[]>>;
}

/* Trades whose coin is moved in one withdrawal. */
export const EXIT_BATCH_TRADES = 5;
const REFRESH_EVERY_MS = 30 * 60_000;
const SOURCED_VENUES = ["unocoin", "binance", "bybit"] as const;
/* Exchanges with no transfer data: coins move only where the operator confirmed. */
const UNCONFIRMED_VENUES = ["coindcx", "coinswitch", "unocoin"] as const;
/* Unconfirmed venues whose fee/network data is still used once a coin is confirmed. */
const DATA_ONCE_CONFIRMED = ["unocoin"] as const;

/** Share of each trade's notional the exit fee takes, over a batch. */
export function exitCostPercent(feeUnits: number, coinPriceInr: number, tradeNotionalInr: number): number {
  if (!(feeUnits > 0) || !(coinPriceInr > 0) || !(tradeNotionalInr > 0)) return 0;
  return (feeUnits * coinPriceInr * 100) / (EXIT_BATCH_TRADES * tradeNotionalInr);
}

/* ETH / ERC20, BSC / BEP20, TRX / TRC20 name the same chains across venues. */
function canonicalNetwork(value: string): string {
  const upper = value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (upper === "ERC20" || upper === "ETHEREUM") return "ETH";
  if (upper === "BEP20" || upper === "BSC" || upper === "BNBSMARTCHAIN") return "BSC";
  if (upper === "TRC20" || upper === "TRON") return "TRX";
  if (upper === "POLYGON" || upper === "MATICPOLYGON") return "MATIC";
  return upper;
}

interface ClosedMarks {
  readonly schemaVersion: "1.0";
  /** "venue:COIN" whose withdrawals, or "venue:COIN:deposit" whose deposits, the operator saw closed. */
  closed: string[];
}

function isClosedMarks(value: unknown): value is ClosedMarks {
  const marks = value as Partial<ClosedMarks> | null;
  return !!marks && marks.schemaVersion === "1.0" && Array.isArray(marks.closed);
}

export class RouteExitCostService {
  private unocoin: ReadonlyMap<string, {feeUnits: number; network: string}> | null = null;
  private binance: ReadonlyMap<string, readonly ExitNetwork[]> | null = null;
  private bybit: ReadonlyMap<string, readonly ExitNetwork[]> | null = null;
  private refreshedAt = 0;
  private refreshing: Promise<void> | null = null;
  private readonly store: JsonlSnapshotStore<ClosedMarks>;
  private marks: ClosedMarks;

  constructor(
    private readonly sources: ExitCostSources,
    filePath = resolve(process.cwd(), "logs", "live", "exit-closed.jsonl"),
    private readonly now: () => number = Date.now,
    initialClosed: readonly string[] = parseClosedList(process.env.CAT_PRO_EXIT_CLOSED),
  ) {
    this.store = new JsonlSnapshotStore({filePath, isPayload: isClosedMarks});
    this.marks = this.store.readLatest() ?? {schemaVersion: "1.0", closed: [...new Set(initialClosed)]};
  }

  /** Refreshes the sources when older than 30 minutes; one refresh at a time. */
  async ensureFresh(): Promise<void> {
    if (this.refreshedAt > 0 && this.now() - this.refreshedAt < REFRESH_EVERY_MS) return;
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    await this.refreshing;
  }

  async refresh(): Promise<void> {
    const [unocoin, binance, bybit] = await Promise.allSettled([this.sources.unocoin(), this.sources.binance(), this.sources.bybit()]);
    // A failed source keeps its previous data rather than blanking it.
    if (unocoin.status === "fulfilled") this.unocoin = unocoin.value;
    if (binance.status === "fulfilled") this.binance = binance.value;
    if (bybit.status === "fulfilled") this.bybit = bybit.value;
    const failed = [unocoin, binance, bybit].some((result) => result.status === "rejected");
    // A failed source is retried after 2 minutes, not 30.
    this.refreshedAt = failed ? Math.max(1, this.now() - REFRESH_EVERY_MS + 2 * 60_000) : this.now();
  }

  closedMarks(): readonly string[] {
    return [...this.marks.closed];
  }

  /**
   * Operator: mark a coin's withdrawals (or deposits) on a venue closed, or
   * open again. On an exchange without transfer data, opening records an
   * explicit confirmation (the default there is closed).
   */
  setClosed(venue: string, coin: string, closed: boolean, side: "withdraw" | "deposit" = "withdraw"): readonly string[] {
    const base = `${venue.trim().toLowerCase()}:${coin.trim().toUpperCase()}`;
    const key = `${base}${side === "deposit" ? ":deposit" : ""}`;
    const open = `${base}:${side === "deposit" ? "deposit-open" : "open"}`;
    const next = new Set(this.marks.closed);
    if (closed) {
      next.add(key);
      next.delete(open);
    } else {
      next.delete(key);
      if ((UNCONFIRMED_VENUES as readonly string[]).includes(venue.trim().toLowerCase())) next.add(open);
    }
    this.marks = {schemaVersion: "1.0", closed: [...next].sort()};
    this.store.replaceAllAtomically([this.marks]);
    return this.closedMarks();
  }

  /**
   * Can a route that buys `coin` on `from` and sells it on `to` repeat? Yes
   * when the coin can be moved there (with its fee), or when the route is
   * two-way and refills by trading back.
   */
  exit(coinValue: string, fromValue: string, toValue: string, options: {readonly twoWay?: boolean} = {}): ExitCost {
    const transfer = this.transferExit(coinValue.toUpperCase(), fromValue.toLowerCase(), toValue.toLowerCase());
    if (options.twoWay) {
      return {status: "TWO_WAY", network: null, feeUnits: null,
        detail: `Two-way route: the reverse direction trades too, so stock refills without a transfer (${transfer.detail})`};
    }
    return transfer;
  }

  private transferExit(coin: string, from: string, to: string): ExitCost {
    if (this.marks.closed.includes(`${from}:${coin}`)) {
      return {status: "CLOSED", network: null, feeUnits: null, detail: `${coin} withdrawals on ${from} are marked closed.`};
    }
    if (this.marks.closed.includes(`${to}:${coin}:deposit`)) {
      return {status: "CLOSED", network: null, feeUnits: null, detail: `${to} does not accept ${coin} deposits (marked).`};
    }
    if ((UNCONFIRMED_VENUES as readonly string[]).includes(to) && !this.marks.closed.includes(`${to}:${coin}:deposit-open`)) {
      return {status: "CLOSED", network: null, feeUnits: null, detail: `${to} deposits of ${coin} are not confirmed for this account.`};
    }
    if ((UNCONFIRMED_VENUES as readonly string[]).includes(from)) {
      if (!this.marks.closed.includes(`${from}:${coin}:open`)) {
        return {status: "CLOSED", network: null, feeUnits: null, detail: `${from} withdrawals of ${coin} are not confirmed for this account.`};
      }
      if (!(DATA_ONCE_CONFIRMED as readonly string[]).includes(from)) {
        return {status: "UNKNOWN", network: null, feeUnits: null, detail: `${from} ${coin} withdrawals confirmed by the operator; fee unknown.`};
      }
    }
    if (!(SOURCED_VENUES as readonly string[]).includes(from)) {
      return {status: "UNKNOWN", network: null, feeUnits: null, detail: `${from} publishes no withdrawal data.`};
    }

    // The network the destination can receive on, when it is known.
    const destination = this.destinationNetworks(coin, to);

    if (from === "unocoin") {
      const setting = this.unocoin?.get(coin);
      if (!this.unocoin) return {status: "UNVERIFIED", network: null, feeUnits: null, detail: "UnoCoin withdrawal settings are not loaded."};
      if (!setting) return {status: "UNVERIFIED", network: null, feeUnits: null, detail: `UnoCoin lists no withdrawal setting for ${coin}.`};
      const network = canonicalNetwork(setting.network);
      if (destination && !destination.includes(network)) {
        return {status: "CLOSED", network, feeUnits: setting.feeUnits, detail: `UnoCoin sends ${coin} only on ${network}; ${to} does not accept ${coin} on it.`};
      }
      return {status: "OK", network, feeUnits: setting.feeUnits, detail: `UnoCoin ${coin} withdrawal on ${network}: fee ${setting.feeUnits} ${coin}.`};
    }

    const table = from === "binance" ? this.binance : this.bybit;
    if (!table) return {status: "UNVERIFIED", network: null, feeUnits: null, detail: `${from} coin configuration is not loaded.`};
    const networks = (table.get(coin) ?? []).filter((network) => network.withdrawEnabled && network.withdrawFee !== null && Number.isFinite(network.withdrawFee));
    const usable = destination ? networks.filter((network) => destination.includes(canonicalNetwork(network.network))) : networks;
    const cheapest = [...usable].sort((a, b) => (a.withdrawFee ?? Infinity) - (b.withdrawFee ?? Infinity))[0];
    if (!cheapest) {
      const reason = destination && destination.length === 0
        ? `${to} has ${coin} deposits closed on every network.`
        : `${from} has no open ${coin} withdrawal network${destination ? ` that ${to} accepts (${destination.join("/")})` : ""}.`;
      return {status: "CLOSED", network: null, feeUnits: null, detail: reason};
    }
    return {status: "OK", network: canonicalNetwork(cheapest.network), feeUnits: cheapest.withdrawFee,
      detail: `${from} ${coin} withdrawal on ${canonicalNetwork(cheapest.network)}: fee ${cheapest.withdrawFee} ${coin}.`};
  }

  /** Networks `to` accepts `coin` on, or null when that venue publishes none. */
  private destinationNetworks(coin: string, to: string): string[] | null {
    if (to === "unocoin") {
      const setting = this.unocoin?.get(coin);
      return setting ? [canonicalNetwork(setting.network)] : null;
    }
    const table = to === "binance" ? this.binance : to === "bybit" ? this.bybit : null;
    const networks = table?.get(coin);
    if (!networks) return null;
    // Binance does not publish a deposit switch here (null): count it as open.
    return networks.filter((network) => network.depositEnabled !== false).map((network) => canonicalNetwork(network.network));
  }
}

export function parseClosedList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.includes(":"))
    .map((entry) => {
      const [venue, coin, side] = entry.split(":");
      return `${(venue ?? "").toLowerCase()}:${(coin ?? "").toUpperCase()}${side?.toLowerCase() === "deposit" ? ":deposit" : ""}`;
    });
}

let shared: RouteExitCostService | null = null;

export function registerRouteExitCostService(service: RouteExitCostService): void {
  shared = service;
}

export function getRouteExitCostService(): RouteExitCostService | null {
  return shared;
}
