import {GiottusObservationAdapter} from "../GiottusObservationAdapter";
import {GiottusPublicApi} from "../GiottusPublicApi";
import type {GiottusPublicMarketApi} from "../GiottusPublicApi";
import type {NormalizedTicker} from "../../coindcx/types";

function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const observedUrls: URL[] = [];
  const api = new GiottusPublicApi(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    observedUrls.push(url);
    const headers = new Headers(init?.headers);
    assertCondition(init?.method === "GET", "Giottus public integration must be GET-only.");
    assertCondition(headers.get("User-Agent") === "CAT-PRO/20.0", "Giottus public reads require the audited user agent.");
    const payload = url.pathname.endsWith("/symbols")
      ? ["BTC/USDT"]
      : url.pathname.endsWith("/ticker")
        ? [{symbol: "BTC/USDT", lastPrice: "100", time: "1"}]
        : {bids: [["99", "2"]], asks: [["101", "3"]]};
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {"Content-Type": "application/json"},
    });
  });

  assertCondition((await api.getSymbols())[0] === "BTC/USDT", "Giottus symbols must be parsed.");
  assertCondition((await api.getTickers())[0]?.symbol === "BTC/USDT", "Giottus tickers must be parsed.");
  const directBook = await api.getOrderBook("BTC/USDT", 20);
  assertCondition(directBook.bids?.[0]?.[0] === "99", "Giottus order-book levels must be preserved for validation.");
  assertCondition(
    observedUrls[2]?.searchParams.get("symbol") === "BTC/USDT" &&
      observedUrls[2]?.searchParams.get("limit") === "20",
    "Giottus order-book query must retain the documented BASE/QUOTE symbol.",
  );

  let timestamp = Date.now();
  let bookReads = 0;
  const mockApi: GiottusPublicMarketApi = {
    async getSymbols() { return ["BTC/USDT", "ETH/INR", "INVALID"]; },
    async getTickers() {
      return [
        {symbol: "BTC/USDT", lastPrice: "100", time: String(timestamp)},
        {symbol: "ETH/INR", lastPrice: "200000", time: String(timestamp)},
      ];
    },
    async getOrderBook(symbol) {
      bookReads += 1;
      assertCondition(symbol === "BTC/USDT", "Only the selected shared Giottus market may be polled.");
      timestamp += 1;
      return {bids: [["99", "2"]], asks: [["101", "3"]]};
    },
  };

  const published: NormalizedTicker[] = [];
  const adapter = new GiottusObservationAdapter({
    api: mockApi,
    now: () => timestamp,
    scheduleTimers: false,
  });
  adapter.onTicker((ticker) => published.push(ticker));
  await adapter.connect();
  await adapter.subscribe(["BTCUSDT", "UNSUPPORTEDUSDT"]);
  const executable = published.find((ticker) => ticker.market === "BTCUSDT" && ticker.bestBidQty === 2);
  const diagnostics = adapter.getDiagnostics();
  assertCondition(
    adapter.isConnected() &&
      diagnostics.catalogMarkets === 2 &&
      diagnostics.requestedMarkets === 1 &&
      diagnostics.executableMarkets === 1 &&
      diagnostics.executionEligible === false &&
      bookReads === 1 &&
      executable?.bestAskPrice === 101 &&
      executable.bestAskQty === 3,
    "Giottus must publish only validated quantity-bearing selected books and remain execution-blocked.",
  );
  await adapter.disconnect();
  console.log("GIOTTUS OBSERVATION INTEGRATION TEST PASSED.");
}

void main().catch((error: unknown) => {
  console.error("[Giottus Observation Integration Test]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
