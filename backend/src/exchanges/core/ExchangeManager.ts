import type { ExchangeAdapter } from "./ExchangeAdapter";

const DEFAULT_MAXIMUM_CONNECTION_ATTEMPTS =
  3;

const DEFAULT_CONNECTION_RETRY_DELAY_MS =
  2_000;

export interface ExchangeManagerOptions {
  maximumConnectionAttempts?: number;

  connectionRetryDelayMs?: number;

  sleep?: (
    delayMs: number,
  ) => Promise<void>;
}

export interface ExchangeAdapterRecoveryResult {
  exchange: string;
  status:
    | "NOT_REQUIRED"
    | "RECOVERY_STARTED"
    | "FAILED";
  reason: string;
}

export class ExchangeManager {
  private readonly adapters = new Map<string, ExchangeAdapter>();

  private readonly maximumConnectionAttempts:
    number;

  private readonly connectionRetryDelayMs:
    number;

  private readonly sleep:
    (
      delayMs: number,
    ) => Promise<void>;

  constructor(
    options:
      ExchangeManagerOptions = {},
  ) {
    this.maximumConnectionAttempts =
      options.maximumConnectionAttempts ??
      DEFAULT_MAXIMUM_CONNECTION_ATTEMPTS;

    this.connectionRetryDelayMs =
      options.connectionRetryDelayMs ??
      DEFAULT_CONNECTION_RETRY_DELAY_MS;

    if (
      !Number.isSafeInteger(
        this.maximumConnectionAttempts,
      ) ||
      this.maximumConnectionAttempts <=
        0
    ) {
      throw new Error(
        "Maximum exchange connection attempts must be a positive integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        this.connectionRetryDelayMs,
      ) ||
      this.connectionRetryDelayMs <
        0
    ) {
      throw new Error(
        "Exchange connection retry delay must be a non-negative integer.",
      );
    }

    this.sleep =
      options.sleep ??
      ((
        delayMs,
      ) =>
        new Promise(
          (
            resolve,
          ) => {
            setTimeout(
              resolve,
              delayMs,
            );
          },
        ));
  }

  register(adapter: ExchangeAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(`Exchange already registered: ${adapter.name}`);
    }

    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): ExchangeAdapter | undefined {
    return this.adapters.get(name);
  }

  getAll(): ExchangeAdapter[] {
    return Array.from(this.adapters.values());
  }

  async connectAll(): Promise<void> {
    const adapters = this.getAll();

    await Promise.all(
      adapters.map(
        (
          adapter,
        ) =>
          this.connectWithRetry(
            adapter,
          ),
      ),
    );
  }

  async disconnectAll(): Promise<void> {
    const adapters = this.getAll();

    await Promise.all(
      adapters.map(async (adapter) => {
        try {
          await adapter.disconnect();
          console.log(`[ExchangeManager] Disconnected: ${adapter.name}`);
        } catch (error) {
          console.error(
            `[ExchangeManager] Failed to disconnect: ${adapter.name}`,
            error,
          );
        }
      }),
    );
  }

  async recoverDisconnected(
    name: string,
  ): Promise<ExchangeAdapterRecoveryResult> {
    const adapter = this.adapters.get(name);

    if (!adapter) {
      return {
        exchange: name,
        status: "FAILED",
        reason: `Exchange adapter is not registered: ${name}.`,
      };
    }

    if (adapter.isConnected()) {
      return {
        exchange: adapter.name,
        status: "NOT_REQUIRED",
        reason: "Public market-data adapter is already connected.",
      };
    }

    try {
      await adapter.disconnect();
    } catch (error: unknown) {
      return {
        exchange: adapter.name,
        status: "FAILED",
        reason: error instanceof Error
          ? `Recovery cleanup failed: ${error.message}`
          : "Recovery cleanup failed.",
      };
    }

    const restarted = await this.connectWithRetry(adapter);

    return restarted
      ? {
          exchange: adapter.name,
          status: "RECOVERY_STARTED",
          reason: "Bounded public market-data reconnect was started.",
        }
      : {
          exchange: adapter.name,
          status: "FAILED",
          reason: "Bounded public market-data reconnect exhausted all attempts.",
        };
  }

  private async connectWithRetry(
    adapter:
      ExchangeAdapter,
  ): Promise<boolean> {
    for (
      let attempt =
        1;

      attempt <=
        this.maximumConnectionAttempts;

      attempt +=
        1
    ) {
      try {
        await adapter.connect();

        console.log(
          `[ExchangeManager] Connected: ${adapter.name}`,
        );

        return true;
      } catch (
        error:
          unknown
      ) {
        if (
          attempt >=
          this.maximumConnectionAttempts
        ) {
          console.error(
            `[ExchangeManager] Failed to connect after ${attempt} attempt(s): ${adapter.name}`,
            error,
          );

          return false;
        }

        console.warn(
          `[ExchangeManager] Connection attempt ${attempt}/${this.maximumConnectionAttempts} failed for ${adapter.name}; retrying in ${this.connectionRetryDelayMs} ms.`,
          error,
        );

        try {
          await adapter.disconnect();
        } catch (
          cleanupError:
            unknown
        ) {
          console.warn(
            `[ExchangeManager] Retry cleanup failed for ${adapter.name}.`,
            cleanupError,
          );
        }

        await this.sleep(
          this.connectionRetryDelayMs,
        );
      }
    }

    return false;
  }
}

export const exchangeManager = new ExchangeManager();
