import {
  derivativeDepthService,
} from "./DerivativeDepthService";

import {
  derivativeMarketDataService,
} from "./DerivativeMarketDataService";

export interface DerivativeEvidenceRefreshSource {
  refresh(now?: number): Promise<unknown>;
}

export interface DerivativeEvidenceRefreshCoordinatorConfiguration {
  readonly refreshIntervalMs: number;
}

const DEFAULT_CONFIGURATION: DerivativeEvidenceRefreshCoordinatorConfiguration = {
  refreshIntervalMs: 5_000,
};

/**
 * Publishes a derivative market snapshot only after the matching bounded
 * full-depth refresh has completed. Strategy controllers subscribe to the
 * market snapshot, so this ordering prevents a permanent same-period race in
 * which fresh depth arrives just after every strategy evaluation.
 */
export class DerivativeEvidenceRefreshCoordinator {
  private readonly configuration: DerivativeEvidenceRefreshCoordinatorConfiguration;
  private timer: NodeJS.Timeout | null = null;
  private refreshing = false;

  constructor(
    private readonly depthSource: DerivativeEvidenceRefreshSource = derivativeDepthService,
    private readonly marketSource: DerivativeEvidenceRefreshSource = derivativeMarketDataService,
    configuration: Partial<DerivativeEvidenceRefreshCoordinatorConfiguration> = {},
  ) {
    this.configuration = {...DEFAULT_CONFIGURATION, ...configuration};

    if (
      !Number.isSafeInteger(this.configuration.refreshIntervalMs) ||
      this.configuration.refreshIntervalMs <= 0
    ) {
      throw new Error("Derivative evidence refresh interval must be a positive integer.");
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.runSafely();
    this.timer = setInterval(() => this.runSafely(), this.configuration.refreshIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  async refresh(now = Date.now()): Promise<void> {
    if (this.refreshing) {
      return;
    }

    this.refreshing = true;

    try {
      await this.depthSource.refresh(now);
      await this.marketSource.refresh(Date.now());
    } finally {
      this.refreshing = false;
    }
  }

  private runSafely(): void {
    void this.refresh().catch((error: unknown) => {
      console.error(
        "[DerivativeEvidence] Ordered refresh failed:",
        error instanceof Error ? error.message : "Unknown refresh error.",
      );
    });
  }
}

export const derivativeEvidenceRefreshCoordinator =
  new DerivativeEvidenceRefreshCoordinator();
