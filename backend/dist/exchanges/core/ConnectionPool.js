"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionPool = void 0;
const SocketWorker_1 = require("./SocketWorker");
class ConnectionPool {
    config;
    workers = [];
    started = false;
    constructor(config) {
        this.config = config;
        if (!Number.isInteger(config.batchSize) ||
            config.batchSize <= 0) {
            throw new Error("ConnectionPool batchSize must be a positive integer.");
        }
    }
    start() {
        if (this.started) {
            return;
        }
        this.started = true;
        const batches = this.createBatches(this.config.items, this.config.batchSize);
        console.log(`[${this.config.name}] Starting ${batches.length} socket workers for ${this.config.items.length} items...`);
        batches.forEach((batch, index) => {
            const workerConfig = this.config.createWorkerConfig(batch, index);
            const worker = new SocketWorker_1.SocketWorker(workerConfig);
            this.workers.push(worker);
            worker.connect();
        });
    }
    stop() {
        if (!this.started) {
            return;
        }
        console.log(`[${this.config.name}] Stopping ${this.workers.length} socket workers...`);
        for (const worker of this.workers) {
            worker.disconnect();
        }
        this.workers.length = 0;
        this.started = false;
    }
    isStarted() {
        return this.started;
    }
    getWorkerCount() {
        return this.workers.length;
    }
    getConnectedWorkerCount() {
        return this.workers.filter((worker) => worker.isConnected()).length;
    }
    isFullyConnected() {
        return (this.workers.length > 0 &&
            this.getConnectedWorkerCount() ===
                this.workers.length);
    }
    isPartiallyConnected() {
        const connectedWorkers = this.getConnectedWorkerCount();
        return (connectedWorkers > 0 &&
            connectedWorkers < this.workers.length);
    }
    getWorkers() {
        return this.workers;
    }
    createBatches(items, batchSize) {
        const batches = [];
        for (let index = 0; index < items.length; index += batchSize) {
            batches.push(items.slice(index, index + batchSize));
        }
        return batches;
    }
}
exports.ConnectionPool = ConnectionPool;
//# sourceMappingURL=ConnectionPool.js.map