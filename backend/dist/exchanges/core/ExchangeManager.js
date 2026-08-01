"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeManager = exports.ExchangeManager = void 0;
class ExchangeManager {
    adapters = new Map();
    register(adapter) {
        if (this.adapters.has(adapter.name)) {
            throw new Error(`Exchange already registered: ${adapter.name}`);
        }
        this.adapters.set(adapter.name, adapter);
    }
    get(name) {
        return this.adapters.get(name);
    }
    getAll() {
        return Array.from(this.adapters.values());
    }
    async connectAll() {
        const adapters = this.getAll();
        await Promise.all(adapters.map(async (adapter) => {
            try {
                await adapter.connect();
                console.log(`[ExchangeManager] Connected: ${adapter.name}`);
            }
            catch (error) {
                console.error(`[ExchangeManager] Failed to connect: ${adapter.name}`, error);
            }
        }));
    }
    async disconnectAll() {
        const adapters = this.getAll();
        await Promise.all(adapters.map(async (adapter) => {
            try {
                await adapter.disconnect();
                console.log(`[ExchangeManager] Disconnected: ${adapter.name}`);
            }
            catch (error) {
                console.error(`[ExchangeManager] Failed to disconnect: ${adapter.name}`, error);
            }
        }));
    }
}
exports.ExchangeManager = ExchangeManager;
exports.exchangeManager = new ExchangeManager();
//# sourceMappingURL=ExchangeManager.js.map