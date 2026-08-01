export interface MarketInfo {
    symbol: string;
    base: string;
    quote: string;
}

class MarketRegistry {

    private readonly markets = new Map<string, MarketInfo>();

    register(symbol: string): void {

        const clean = symbol.toUpperCase();

        if (clean.endsWith("USDT")) {

            this.markets.set(clean, {
                symbol: clean,
                base: clean.replace("USDT", ""),
                quote: "USDT"
            });

            return;
        }

        if (clean.endsWith("INR")) {

            this.markets.set(clean, {
                symbol: clean,
                base: clean.replace("INR", ""),
                quote: "INR"
            });

            return;
        }
    }

    get(symbol: string): MarketInfo | undefined {
        return this.markets.get(symbol.toUpperCase());
    }

    getAll(): MarketInfo[] {
        return [...this.markets.values()];
    }

    size(): number {
        return this.markets.size;
    }

    clear(): void {
        this.markets.clear();
    }
}

export const marketRegistry = new MarketRegistry();