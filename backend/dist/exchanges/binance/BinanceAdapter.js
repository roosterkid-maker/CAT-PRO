"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceAdapter = void 0;
const cache_service_1 = require("../../services/cache.service");
const ConnectionPool_1 = require("../core/ConnectionPool");
const constants_1 = require("./constants");
class BinanceAdapter {
    name = constants_1.BINANCE.NAME;
    pool = null;
    markets = new Set();
    lastUpdate = 0;
    subscriptionRequestId = 1;
    tickerCallback = null;
    async connect() {
        if (this.pool?.isStarted()) {
            return;
        }
        const symbols = await this.loadTradingSymbols();
        if (symbols.length === 0) {
            throw new Error(`[${this.name}] No active USDT Spot symbols found.`);
        }
        const poolConfig = {
            name: `${this.name} BookTicker Pool`,
            items: symbols,
            batchSize: constants_1.BINANCE.SYMBOLS_PER_WORKER,
            createWorkerConfig: (batch, workerIndex) => ({
                name: `${this.name} Worker ${workerIndex + 1}`,
                url: constants_1.BINANCE.SOCKET.URL,
                reconnectDelay: constants_1.BINANCE.RECONNECT_DELAY,
                onOpen: (worker) => {
                    this.subscribeWorker(worker, batch, workerIndex);
                },
                onMessage: (_worker, message) => {
                    this.handleMessage(message);
                },
                onClose: (_worker, code, reason) => {
                    console.log(`[${this.name}] Worker ${workerIndex + 1} closed: ${code} ${reason}`);
                },
                onError: (_worker, error) => {
                    console.error(`[${this.name}] Worker ${workerIndex + 1} error:`, error.message);
                },
            }),
        };
        this.pool =
            new ConnectionPool_1.ConnectionPool(poolConfig);
        this.pool.start();
        console.log(`[${this.name}] Started ${Math.ceil(symbols.length /
            constants_1.BINANCE.SYMBOLS_PER_WORKER)} workers for ${symbols.length} USDT markets.`);
    }
    async disconnect() {
        this.pool?.stop();
        this.pool = null;
    }
    async subscribe(_markets) {
        /*
         * Subscriptions are assigned automatically
         * when the connection pool starts.
         */
    }
    async unsubscribe(_markets) {
        /*
         * Dynamic symbol removal is not required
         * for the current all-USDT pool.
         */
    }
    isConnected() {
        return (this.pool?.getConnectedWorkerCount() ??
            0) > 0;
    }
    getMarketCount() {
        return this.markets.size;
    }
    getLastUpdate() {
        return this.lastUpdate;
    }
    onTicker(callback) {
        this.tickerCallback = callback;
    }
    async loadTradingSymbols() {
        const response = await fetch(constants_1.BINANCE.REST.EXCHANGE_INFO, {
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            throw new Error(`ExchangeInfo failed with HTTP ${response.status}.`);
        }
        const data = (await response.json());
        if (!Array.isArray(data.symbols)) {
            throw new Error("Invalid Binance ExchangeInfo response.");
        }
        return data.symbols
            .filter((symbol) => symbol.status === "TRADING" &&
            symbol.quoteAsset ===
                constants_1.BINANCE.QUOTE_ASSET &&
            symbol.isSpotTradingAllowed !==
                false)
            .map((symbol) => symbol.symbol.toUpperCase());
    }
    subscribeWorker(worker, symbols, workerIndex) {
        const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@bookTicker`);
        const requestId = this.subscriptionRequestId++;
        worker.send({
            method: "SUBSCRIBE",
            params: streams,
            id: requestId,
        });
        console.log(`[${this.name}] Worker ${workerIndex + 1} subscribing to ${streams.length} markets. Request ID: ${requestId}`);
    }
    handleMessage(rawMessage) {
        try {
            const parsed = JSON.parse(rawMessage);
            if ("result" in parsed &&
                "id" in parsed) {
                console.log(`[${this.name}] Subscription acknowledged. Request ID: ${parsed.id}`);
                return;
            }
            if (!("s" in parsed) ||
                !("b" in parsed) ||
                !("B" in parsed) ||
                !("a" in parsed) ||
                !("A" in parsed)) {
                return;
            }
            this.updateMarket(parsed);
        }
        catch (error) {
            console.error(`[${this.name}] Invalid BookTicker payload:`, error);
        }
    }
    updateMarket(ticker) {
        const bestBidPrice = Number(ticker.b);
        const bestBidQty = Number(ticker.B);
        const bestAskPrice = Number(ticker.a);
        const bestAskQty = Number(ticker.A);
        if (!ticker.s ||
            !Number.isFinite(bestBidPrice) ||
            !Number.isFinite(bestBidQty) ||
            !Number.isFinite(bestAskPrice) ||
            !Number.isFinite(bestAskQty) ||
            bestBidPrice <= 0 ||
            bestAskPrice <= 0 ||
            bestBidQty < 0 ||
            bestAskQty < 0 ||
            bestAskPrice < bestBidPrice) {
            return;
        }
        const market = ticker.s.toUpperCase();
        const timestamp = Date.now();
        const spread = bestAskPrice - bestBidPrice;
        /*
         * BookTicker doesn't include the latest
         * completed trade. Mid-price remains only
         * for display/backward compatibility.
         */
        const lastPrice = (bestBidPrice + bestAskPrice) /
            2;
        const normalizedTicker = {
            exchange: "binance",
            market,
            lastPrice,
            bid: bestBidPrice,
            ask: bestAskPrice,
            bestBidPrice,
            bestBidQty,
            bestAskPrice,
            bestAskQty,
            spread,
            timestamp,
        };
        this.markets.add(market);
        this.lastUpdate = timestamp;
        cache_service_1.marketCache.update(normalizedTicker);
        this.tickerCallback?.(normalizedTicker);
    }
}
exports.BinanceAdapter = BinanceAdapter;
//# sourceMappingURL=BinanceAdapter.js.map