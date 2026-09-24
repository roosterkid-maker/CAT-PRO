import {
  createHash,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import type {
  CentralLiveOrderGatewayResponse,
} from "../central/CentralLiveOrderExecutionGateway";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  OrderBookLevel,
} from "../../../orderbook/models/OrderBookLevel";

import {
  floorToStep,
  worstPrice,
  type InrRoutePlan,
} from "./InrRoutePlanner";

/*
 * Executes one planned INR route as PRIMARY then HEDGE:
 *
 *   1. The session is journaled before any exchange I/O.
 *   2. PRIMARY: the INR-venue leg (the thin, slow book) is sent first as a
 *      priced limit with a bounded wait and cancel.
 *   3. HEDGE: exactly the quantity the primary filled is offset on the
 *      liquid USDT venue with IOC limits priced from a fresh book plus a
 *      widening buffer. Each hedge attempt follows a KNOWN outcome of the
 *      previous one, so a retry can never double an order; an unknown
 *      outcome stops immediately as POSSIBLE_EXPOSURE.
 *
 * States: NO_FILL (primary filled nothing: clean), COMPLETED (fully
 * hedged), DUST_RESIDUAL (unhedgeable remainder below the dust tolerance),
 * RECOVERY_REQUIRED (known unhedged remainder), POSSIBLE_EXPOSURE (an order
 * outcome is unknown). The last two halt the runner.
 */
export type InrRouteSessionState =
  | "PREPARED"
  | "PRIMARY_DISPATCHED"
  | "HEDGING"
  | "NO_FILL"
  | "COMPLETED"
  | "DUST_RESIDUAL"
  | "RECOVERY_REQUIRED"
  | "POSSIBLE_EXPOSURE";

export interface InrRouteLegFill {
  readonly idempotencyKey: string;
  readonly venue: string;
  readonly market: string;
  readonly side: "buy" | "sell";
  readonly requestedQuantity: number;
  readonly limitPrice: number;
  readonly filledQuantity: number | null;
  readonly averagePrice: number | null;
  readonly orderId: string | null;
  readonly status: string;
  readonly bufferPercent: number | null;
  readonly reasons: readonly string[];
}

export interface InrRouteSessionRoute {
  readonly routeKey: string;
  readonly kind: string;
  readonly coin: string;
  readonly buyVenue: string;
  readonly buyMarket: string;
  readonly sellVenue: string;
  readonly sellMarket: string;
  /** Venue spellings used on the wire (CoinSwitch: FLR_INR). */
  readonly buyVenueMarket: string;
  readonly sellVenueMarket: string;
  readonly buyToInr: number;
  readonly sellToInr: number;
  readonly feesPercent: number;
}

export interface InrRouteSession {
  readonly schemaVersion: "1.0";
  readonly sessionId: string;
  readonly route: InrRouteSessionRoute;
  readonly plan: InrRoutePlan;
  readonly primarySide: "buy" | "sell";
  readonly state: InrRouteSessionState;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly primary: InrRouteLegFill | null;
  readonly hedges: readonly InrRouteLegFill[];
  readonly hedgedQuantity: number;
  readonly residualQuantity: number;
  readonly residualInr: number;
  /** Matched quantity's edge minus estimated fees, INR; null until known. */
  readonly realizedNetInr: number | null;
  readonly reasons: readonly string[];
}

export interface InrRouteGatewayPort {
  validateNewSubmission(request: LiveExecutionRequest): void;
  executeOrReconcile(input: {
    readonly request: LiveExecutionRequest;
    readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean;
    readonly now?: number;
  }): Promise<CentralLiveOrderGatewayResponse>;
  cancelOrReconcile(idempotencyKey: string, now?: number): Promise<CentralLiveOrderGatewayResponse>;
}

export interface InrRouteHedgeVenueRules {
  readonly quantityStep: number;
  readonly minimumQuantity: number | null;
  readonly minimumNotional: number | null;
  readonly priceStep: number | null;
}

export interface InrRouteExecuteInput {
  readonly route: InrRouteSessionRoute;
  readonly plan: InrRoutePlan;
  readonly primaryTimeoutMs: number;
  readonly hedgeBufferPercents: readonly number[];
  readonly dustToleranceInr: number;
  readonly hedgeRules: InrRouteHedgeVenueRules;
  /** Fresh hedge-side levels (bids to sell into, asks to buy from). */
  readonly getHedgeLevels: () => readonly OrderBookLevel[] | null;
}

interface Snapshot {
  readonly schemaVersion: "1.0";
  readonly savedAt: number;
  readonly sessions: readonly InrRouteSession[];
}

/*
 * Per-venue order contract, matching each audited adapter:
 *   coindcx     GTC limit, bounded wait then cancel (adapter: <=10 s, <=1 s polls)
 *   coinswitch  plain limit (the adapter rejects any time-in-force), bounded
 *               wait then cancel, UUID client ID; slower polls for its rate limit
 *   unocoin     plain limit, NO client ID (the venue has none; the adapter
 *               reconciles a lost create against an order-history baseline),
 *               longer wait and 1 s polls (each status read pages history)
 *   binance/bybit  IOC limit
 */
interface VenueOrderContract {
  readonly timeInForce: "GTC" | "IOC" | undefined;
  readonly boundedWait: boolean;
  readonly boundedWaitMs?: number;
  readonly pollingMs: number;
  readonly clientIdFormat: "compact" | "uuid" | "none";
}

const VENUE_ORDER_CONTRACTS: Readonly<Record<string, VenueOrderContract>> = {
  coindcx: {timeInForce: "GTC", boundedWait: true, pollingMs: 250, clientIdFormat: "compact"},
  coinswitch: {timeInForce: undefined, boundedWait: true, pollingMs: 500, clientIdFormat: "uuid"},
  unocoin: {timeInForce: undefined, boundedWait: true, boundedWaitMs: 4_000, pollingMs: 1_000, clientIdFormat: "none"},
  binance: {timeInForce: "IOC", boundedWait: false, pollingMs: 250, clientIdFormat: "compact"},
  bybit: {timeInForce: "IOC", boundedWait: false, pollingMs: 250, clientIdFormat: "compact"},
};

function orderRequest(
  venue: string,
  market: string,
  side: "buy" | "sell",
  quantity: number,
  price: number,
  idempotencyKey: string,
  boundedWaitMs: number,
): LiveExecutionRequest {
  const contract = VENUE_ORDER_CONTRACTS[venue];
  if (!contract) throw new Error(`No INR-route order contract for ${venue}.`);
  return {
    exchange: venue,
    product: "SPOT",
    market,
    side,
    orderType: "limit",
    ...(contract.timeInForce !== undefined ? {timeInForce: contract.timeInForce} : {}),
    quantity,
    price,
    ...(contract.clientIdFormat === "none"
      ? {}
      : {clientOrderId: contract.clientIdFormat === "uuid" ? uuidClientOrderId(idempotencyKey) : clientOrderId(idempotencyKey)}),
    timeoutMs: contract.boundedWait ? contract.boundedWaitMs ?? boundedWaitMs : 5_000,
    pollingIntervalMs: contract.pollingMs,
    cancelOnTimeout: true,
  };
}

const DEFAULT_FILE = resolve(process.cwd(), "logs", "live", "inr-route-sessions.jsonl");
const MAXIMUM_SESSIONS = 300;
const TERMINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "FAILED"]);

export class InrRouteSessionExecutor {
  private readonly store: JsonlSnapshotStore<Snapshot>;
  private sessions: InrRouteSession[] = [];

  constructor(
    private readonly gateway: InrRouteGatewayPort,
    filePath = DEFAULT_FILE,
    private readonly now: () => number = Date.now,
  ) {
    this.store = new JsonlSnapshotStore({filePath, isPayload: isSnapshot});
    this.sessions = [...(this.store.readLatest()?.sessions ?? [])];
  }

  listSessions(): readonly InrRouteSession[] {
    return this.sessions;
  }

  /** Sessions left in a non-final state by a crash mid-attempt. */
  unfinishedSessions(): readonly InrRouteSession[] {
    return this.sessions.filter((session) =>
      session.state === "PREPARED" || session.state === "PRIMARY_DISPATCHED" || session.state === "HEDGING");
  }

  async execute(input: InrRouteExecuteInput): Promise<InrRouteSession> {
    const startedAt = this.now();
    const sessionId = `inr-${createHash("sha256").update(`${input.route.routeKey}|${startedAt}|${Math.random()}`).digest("hex").slice(0, 16)}`;
    const primarySide: "buy" | "sell" = input.route.buyMarket.endsWith("INR") ? "buy" : "sell";
    const primaryVenue = primarySide === "buy" ? input.route.buyVenue : input.route.sellVenue;
    const primaryMarket = primarySide === "buy" ? input.route.buyVenueMarket : input.route.sellVenueMarket;
    const primaryLimit = primarySide === "buy" ? input.plan.buyLimitPrice : input.plan.sellLimitPrice;

    const primaryKey = `${sessionId}:primary`;
    let primaryRequest: LiveExecutionRequest | null = null;

    let session: InrRouteSession = {
      schemaVersion: "1.0",
      sessionId,
      route: input.route,
      plan: input.plan,
      primarySide,
      state: "PREPARED",
      startedAt,
      updatedAt: startedAt,
      primary: null,
      hedges: [],
      hedgedQuantity: 0,
      residualQuantity: 0,
      residualInr: 0,
      realizedNetInr: null,
      reasons: [],
    };

    const hedgeSide: "buy" | "sell" = primarySide === "buy" ? "sell" : "buy";
    const hedgeVenue = hedgeSide === "buy" ? input.route.buyVenue : input.route.sellVenue;
    const hedgeMarket = hedgeSide === "buy" ? input.route.buyVenueMarket : input.route.sellVenueMarket;
    const hedgeToInr = hedgeSide === "buy" ? input.route.buyToInr : input.route.sellToInr;
    const hedgeRequest = (key: string, quantity: number, price: number): LiveExecutionRequest =>
      orderRequest(hedgeVenue, hedgeMarket, hedgeSide, quantity, price, key, input.primaryTimeoutMs);
    const plannedHedgePrice = roundPrice(
      hedgeSide === "sell" ? input.plan.sellLimitPrice : input.plan.buyLimitPrice,
      input.hedgeRules.priceStep,
      hedgeSide,
    );

    // Both legs' order shapes must pass venue validation before anything is sent.
    try {
      if (!VENUE_ORDER_CONTRACTS[primaryVenue] || !VENUE_ORDER_CONTRACTS[hedgeVenue]) {
        throw new Error(`No INR-route order contract for ${VENUE_ORDER_CONTRACTS[primaryVenue] ? hedgeVenue : primaryVenue}.`);
      }
      primaryRequest = orderRequest(primaryVenue, primaryMarket, primarySide, input.plan.quantity, primaryLimit, primaryKey, input.primaryTimeoutMs);
      this.gateway.validateNewSubmission(primaryRequest);
      this.gateway.validateNewSubmission(hedgeRequest(`${sessionId}:hedge-check`, input.plan.quantity, plannedHedgePrice));
    } catch (error: unknown) {
      return this.save({...session, state: "NO_FILL", updatedAt: this.now(), reasons: [`PRE_DISPATCH_REJECTED: ${message(error)}`]});
    }

    if (primaryRequest === null) {
      return this.save({...session, state: "NO_FILL", updatedAt: this.now(), reasons: ["PRE_DISPATCH_REJECTED: primary order could not be built."]});
    }
    session = this.save({...session, state: "PRIMARY_DISPATCHED", updatedAt: this.now()});
    const primary = await this.settle(primaryRequest, primaryKey, null);
    session = this.save({...session, primary: primary.fill, updatedAt: this.now()});

    if (primary.known === false) {
      return this.save({...session, state: "POSSIBLE_EXPOSURE", reasons: [...session.reasons, "PRIMARY outcome is unknown; no hedge can be sized safely."]});
    }
    const filled = primary.fill.filledQuantity ?? 0;
    if (filled <= 0) {
      return this.save({...session, state: "NO_FILL", realizedNetInr: 0, reasons: [...session.reasons, "PRIMARY filled nothing; no exposure."]});
    }

    /* ---- hedge ---- */
    session = this.save({...session, state: "HEDGING", updatedAt: this.now()});

    let hedged = 0;
    for (const [attempt, bufferPercent] of input.hedgeBufferPercents.entries()) {
      const remaining = floorToStep(filled - hedged, input.hedgeRules.quantityStep);
      if (remaining <= 0) break;
      const levels = input.getHedgeLevels();
      const touch = levels ? worstPrice(levels, remaining) : null;
      if (touch === null) {
        session = this.save({...session, reasons: [...session.reasons, `HEDGE ${attempt + 1}: fresh ${hedgeVenue} book does not cover ${remaining}.`]});
        continue;
      }
      const price = roundPrice(
        hedgeSide === "sell" ? touch * (1 - bufferPercent / 100) : touch * (1 + bufferPercent / 100),
        input.hedgeRules.priceStep,
        hedgeSide,
      );
      if (input.hedgeRules.minimumNotional !== null && remaining * price < input.hedgeRules.minimumNotional) break;
      if (input.hedgeRules.minimumQuantity !== null && remaining < input.hedgeRules.minimumQuantity) break;

      const key = `${sessionId}:hedge${attempt + 1}`;
      const request = hedgeRequest(key, remaining, price);
      try {
        this.gateway.validateNewSubmission(request);
      } catch (error: unknown) {
        // A local rejection sends nothing: a known zero fill.
        session = this.save({...session, reasons: [...session.reasons, `HEDGE ${attempt + 1} not sent: ${message(error)}`]});
        continue;
      }
      const result = await this.settle(request, key, bufferPercent);
      session = this.save({...session, hedges: [...session.hedges, result.fill], updatedAt: this.now()});
      if (result.known === false) {
        return this.save({
          ...session,
          state: "POSSIBLE_EXPOSURE",
          hedgedQuantity: hedged,
          reasons: [...session.reasons, `HEDGE ${attempt + 1} outcome is unknown; stopping without further orders.`],
        });
      }
      hedged += result.fill.filledQuantity ?? 0;
    }

    const residual = Math.max(0, filled - hedged);
    const referencePrice = primary.fill.averagePrice ?? primaryLimit;
    const primaryToInr = primarySide === "buy" ? input.route.buyToInr : input.route.sellToInr;
    const residualInr = residual * referencePrice * primaryToInr;
    const realizedNetInr = realizedNet(session, primarySide, input.route, Math.min(filled, hedged), hedgeToInr);
    const state: InrRouteSessionState =
      residual <= 1e-12
        ? "COMPLETED"
        : residualInr <= input.dustToleranceInr
          ? "DUST_RESIDUAL"
          : "RECOVERY_REQUIRED";

    return this.save({
      ...session,
      state,
      hedgedQuantity: hedged,
      residualQuantity: residual,
      residualInr,
      realizedNetInr,
      updatedAt: this.now(),
      reasons: state === "RECOVERY_REQUIRED"
        ? [...session.reasons, `Unhedged ${residual} ${input.route.coin} (≈₹${residualInr.toFixed(0)}) after ${session.hedges.length} hedge attempt(s).`]
        : session.reasons,
    });
  }

  /** Sends (or reconciles) one order and reduces it to a known or unknown fill. */
  private async settle(
    request: LiveExecutionRequest,
    idempotencyKey: string,
    bufferPercent: number | null,
  ): Promise<{known: boolean; fill: InrRouteLegFill}> {
    let response: CentralLiveOrderGatewayResponse | null = null;
    let failure: string | null = null;
    try {
      response = await this.gateway.executeOrReconcile({request, idempotencyKey, allowNewSubmission: true, now: this.now()});
      const status = response.record?.result?.status;
      if (response.record?.result && (status === undefined || !TERMINAL.has(status))) {
        // Still open (a cancel may not have landed): cancel, then read back.
        response = await this.gateway.cancelOrReconcile(idempotencyKey, this.now());
      }
    } catch (error: unknown) {
      failure = message(error);
    }

    const result = response?.record?.result ?? null;
    const neverSubmitted = response?.state === "BLOCKED" && response.record === null;
    const known =
      failure === null &&
      (neverSubmitted || (result !== null && TERMINAL.has(result.status) && response?.state !== "UNCERTAIN_SUBMISSION"));

    return {
      known,
      fill: {
        idempotencyKey,
        venue: request.exchange,
        market: request.market,
        side: request.side,
        requestedQuantity: request.quantity,
        limitPrice: request.price ?? 0,
        filledQuantity: neverSubmitted ? 0 : result?.filledQuantity ?? null,
        averagePrice: result && result.filledQuantity > 0 ? result.averageFillPrice : null,
        orderId: result?.orderId ?? null,
        status: failure !== null ? "GATEWAY_FAILURE" : neverSubmitted ? "NOT_SUBMITTED" : result?.status ?? response?.state ?? "UNKNOWN",
        bufferPercent,
        reasons: [...(failure !== null ? [failure] : []), ...(response?.reasons ?? [])],
      },
    };
  }

  private save(session: InrRouteSession): InrRouteSession {
    const index = this.sessions.findIndex((existing) => existing.sessionId === session.sessionId);
    if (index >= 0) this.sessions[index] = session;
    else this.sessions.push(session);
    if (this.sessions.length > MAXIMUM_SESSIONS) {
      this.sessions = this.sessions.slice(-MAXIMUM_SESSIONS);
    }
    this.store.replaceAllAtomically([{schemaVersion: "1.0", savedAt: this.now(), sessions: this.sessions}]);
    return session;
  }
}

/** Edge on the matched quantity (primary vs volume-weighted hedges) minus the route's fee rate. */
function realizedNet(
  session: InrRouteSession,
  primarySide: "buy" | "sell",
  route: InrRouteSessionRoute,
  matched: number,
  hedgeToInr: number,
): number {
  if (matched <= 0 || !session.primary?.averagePrice) return 0;
  let hedgeQuantity = 0;
  let hedgeNotional = 0;
  for (const hedge of session.hedges) {
    if ((hedge.filledQuantity ?? 0) > 0 && hedge.averagePrice) {
      hedgeQuantity += hedge.filledQuantity as number;
      hedgeNotional += (hedge.filledQuantity as number) * hedge.averagePrice;
    }
  }
  if (hedgeQuantity <= 0) return 0;
  const hedgeAverage = hedgeNotional / hedgeQuantity;
  const primaryToInr = primarySide === "buy" ? route.buyToInr : route.sellToInr;
  const buyInr = (primarySide === "buy" ? session.primary.averagePrice * primaryToInr : hedgeAverage * hedgeToInr) * matched;
  const sellInr = (primarySide === "sell" ? session.primary.averagePrice * primaryToInr : hedgeAverage * hedgeToInr) * matched;
  return sellInr - buyInr - buyInr * (route.feesPercent / 100);
}

function roundPrice(price: number, step: number | null, side: "buy" | "sell"): number {
  if (!(step !== null && step > 0)) return price;
  const units = side === "sell" ? Math.floor(price / step + 1e-9) : Math.ceil(price / step - 1e-9);
  const decimals = Math.max(0, Math.min(12, Math.ceil(-Math.log10(step)) + 2));
  return Number((units * step).toFixed(decimals));
}

/** ≤ 36 chars, [a-z0-9-] only: valid on Binance, Bybit and CoinDCX. */
function clientOrderId(idempotencyKey: string): string {
  return `ci-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 30)}`;
}

/** Deterministic RFC 4122 v4-shaped UUID from the idempotency key (CoinSwitch requires UUIDs). */
export function uuidClientOrderId(idempotencyKey: string): string {
  const hex = createHash("sha256").update(idempotencyKey).digest("hex");
  const variant = "89ab"[parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isSnapshot(value: unknown): value is Snapshot {
  const snapshot = value as Partial<Snapshot> | null;
  return !!snapshot && snapshot.schemaVersion === "1.0" && Array.isArray(snapshot.sessions);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
