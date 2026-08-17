import {
  SocketWorker,
  type SocketWorkerConfig,
} from "./SocketWorker";

export interface ConnectionPoolConfig<T> {
  name: string;

  items: T[];

  batchSize: number;

  createWorkerConfig: (
    batch: T[],
    workerIndex: number,
  ) => SocketWorkerConfig;
}

export class ConnectionPool<T> {
  private readonly workers: SocketWorker[] = [];

  private started = false;

  constructor(
    private readonly config: ConnectionPoolConfig<T>,
  ) {
    if (
      !Number.isInteger(config.batchSize) ||
      config.batchSize <= 0
    ) {
      throw new Error(
        "ConnectionPool batchSize must be a positive integer.",
      );
    }
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    const batches = this.createBatches(
      this.config.items,
      this.config.batchSize,
    );

    console.log(
      `[${this.config.name}] Starting ${batches.length} socket workers for ${this.config.items.length} items...`,
    );

    batches.forEach((batch, index) => {
      const workerConfig =
        this.config.createWorkerConfig(
          batch,
          index,
        );

      const worker =
        new SocketWorker(workerConfig);

      this.workers.push(worker);
      worker.connect();
    });
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    console.log(
      `[${this.config.name}] Stopping ${this.workers.length} socket workers...`,
    );

    for (const worker of this.workers) {
      worker.disconnect();
    }

    this.workers.length = 0;
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  getConnectedWorkerCount(): number {
    return this.workers.filter(
      (worker) => worker.isConnected(),
    ).length;
  }

  isFullyConnected(): boolean {
    return (
      this.workers.length > 0 &&
      this.getConnectedWorkerCount() ===
        this.workers.length
    );
  }

  isPartiallyConnected(): boolean {
    const connectedWorkers =
      this.getConnectedWorkerCount();

    return (
      connectedWorkers > 0 &&
      connectedWorkers < this.workers.length
    );
  }

  getWorkers(): readonly SocketWorker[] {
    return this.workers;
  }

  private createBatches(
    items: T[],
    batchSize: number,
  ): T[][] {
    const batches: T[][] = [];

    for (
      let index = 0;
      index < items.length;
      index += batchSize
    ) {
      batches.push(
        items.slice(
          index,
          index + batchSize,
        ),
      );
    }

    return batches;
  }
}