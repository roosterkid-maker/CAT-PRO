/*
 * Process-wide interlock for the live runners (Strategy #1 USDT routes and
 * the INR route executor). They share wallets, so:
 *   - only one live attempt runs at a time across all runners, and
 *   - a runner that halts on possible exposure or unhedged residual blocks
 *     every runner until its own release path clears it.
 */
export class LiveTradingInterlock {
  private owner: string | null = null;
  private readonly exposureHalts = new Map<string, string>();

  /** Takes the single live-attempt slot; false if another runner holds it or an exposure halt is active. */
  tryAcquire(runner: string): boolean {
    if (this.owner !== null || this.exposureHalts.size > 0) {
      return false;
    }
    this.owner = runner;
    return true;
  }

  release(runner: string): void {
    if (this.owner === runner) {
      this.owner = null;
    }
  }

  setExposureHalt(runner: string, reason: string | null): void {
    if (reason === null) {
      this.exposureHalts.delete(runner);
    } else {
      this.exposureHalts.set(runner, reason);
    }
  }

  getDiagnostics() {
    return {
      activeAttemptOwner: this.owner,
      exposureHalts: [...this.exposureHalts.entries()].map(([runner, reason]) => ({runner, reason})),
    };
  }
}

export const liveTradingInterlock = new LiveTradingInterlock();
