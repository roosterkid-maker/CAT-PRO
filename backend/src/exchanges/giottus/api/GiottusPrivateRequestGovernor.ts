import {
  GIOTTUS,
} from "../constants";

export interface GiottusPrivateRequestGovernorConfig {
  minimumRequestIntervalMs: number;

  minimumRateLimitCooldownMs: number;

  maximumRateLimitCooldownMs: number;
}

export interface GiottusPrivateRequestGovernorDiagnostics {
  requestsAdmitted: number;

  successfulRequests: number;

  rateLimitResponses: number;

  locallySuppressedRequests: number;

  consecutiveRateLimits: number;

  lastRequestStartedAt:
    number | null;

  lastSuccessfulAt:
    number | null;

  cooldownUntil:
    number | null;

  cooldownRemainingMs: number;
}

export class GiottusPrivateRateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
    readonly locallySuppressed = false,
  ) {
    super(
      message,
    );

    this.name =
      "GiottusPrivateRateLimitError";
  }
}

const DEFAULT_CONFIG:
  GiottusPrivateRequestGovernorConfig = {
  minimumRequestIntervalMs:
    GIOTTUS.PRIVATE_MINIMUM_REQUEST_INTERVAL_MS,

  minimumRateLimitCooldownMs:
    GIOTTUS.PRIVATE_RATE_LIMIT_COOLDOWN_MS,

  maximumRateLimitCooldownMs:
    GIOTTUS.PRIVATE_MAXIMUM_RATE_LIMIT_COOLDOWN_MS,
};

export class GiottusPrivateRequestGovernor {
  private readonly config:
    GiottusPrivateRequestGovernorConfig;

  private readonly now:
    () => number;

  private readonly wait:
    (milliseconds: number) => Promise<void>;

  private requestTail:
    Promise<void> =
    Promise.resolve();

  private requestsAdmitted =
    0;

  private successfulRequests =
    0;

  private rateLimitResponses =
    0;

  private locallySuppressedRequests =
    0;

  private consecutiveRateLimits =
    0;

  private lastRequestStartedAt:
    number | null = null;

  private lastSuccessfulAt:
    number | null = null;

  private cooldownUntil:
    number | null = null;

  constructor(
    config:
      Partial<GiottusPrivateRequestGovernorConfig> = {},
    now:
      () => number =
      () => Date.now(),
    wait:
      (milliseconds: number) => Promise<void> =
      (milliseconds) =>
        new Promise(
          (resolve) => {
            setTimeout(
              resolve,
              milliseconds,
            );
          },
        ),
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.now =
      now;

    this.wait =
      wait;

    this.validateConfig(
      this.config,
    );
  }

  async execute<T>(
    operation:
      () => Promise<T>,
  ): Promise<T> {
    const predecessor =
      this.requestTail;

    let release:
      () => void =
      () => undefined;

    this.requestTail =
      new Promise<void>(
        (resolve) => {
          release =
            resolve;
        },
      );

    await predecessor.catch(
      () => undefined,
    );

    try {
      const admissionTime =
        this.now();

      if (
        this.cooldownUntil !==
          null &&
        admissionTime <
          this.cooldownUntil
      ) {
        const remainingMs =
          this.cooldownUntil -
          admissionTime;

        this.locallySuppressedRequests +=
          1;

        throw new GiottusPrivateRateLimitError(
          `Giottus authenticated-read cooldown is active for ${remainingMs} ms; no network request was sent.`,
          remainingMs,
          true,
        );
      }

      const spacingWaitMs =
        this.lastRequestStartedAt ===
          null
          ? 0
          : Math.max(
              0,
              this.config
                .minimumRequestIntervalMs -
                (
                  admissionTime -
                  this.lastRequestStartedAt
                ),
            );

      if (
        spacingWaitMs >
        0
      ) {
        await this.wait(
          spacingWaitMs,
        );
      }

      this.lastRequestStartedAt =
        this.now();

      this.requestsAdmitted +=
        1;

      try {
        const result =
          await operation();

        this.successfulRequests +=
          1;

        this.consecutiveRateLimits =
          0;

        this.cooldownUntil =
          null;

        this.lastSuccessfulAt =
          this.now();

        return result;
      } catch (error: unknown) {
        if (
          error instanceof
            GiottusPrivateRateLimitError &&
          !error.locallySuppressed
        ) {
          this.recordRateLimit(
            error.retryAfterMs,
          );
        }

        throw error;
      }
    } finally {
      release();
    }
  }

  getDiagnostics():
    GiottusPrivateRequestGovernorDiagnostics {
    const now =
      this.now();

    const cooldownRemainingMs =
      this.cooldownUntil !==
        null &&
      now <
        this.cooldownUntil
        ? this.cooldownUntil -
          now
        : 0;

    return {
      requestsAdmitted:
        this.requestsAdmitted,
      successfulRequests:
        this.successfulRequests,
      rateLimitResponses:
        this.rateLimitResponses,
      locallySuppressedRequests:
        this.locallySuppressedRequests,
      consecutiveRateLimits:
        this.consecutiveRateLimits,
      lastRequestStartedAt:
        this.lastRequestStartedAt,
      lastSuccessfulAt:
        this.lastSuccessfulAt,
      cooldownUntil:
        cooldownRemainingMs >
        0
          ? this.cooldownUntil
          : null,
      cooldownRemainingMs,
    };
  }

  private recordRateLimit(
    retryAfterMs: number,
  ): void {
    this.rateLimitResponses +=
      1;

    this.consecutiveRateLimits +=
      1;

    const exponentialCooldownMs =
      this.config
        .minimumRateLimitCooldownMs *
      2 ** Math.min(
        this.consecutiveRateLimits -
          1,
        8,
      );

    const boundedExponentialCooldownMs =
      Math.min(
        this.config
          .maximumRateLimitCooldownMs,
        exponentialCooldownMs,
      );

    // The local exponential backoff is bounded, but an exchange-declared
    // Retry-After is authoritative and must never be shortened locally.
    const cooldownMs =
      Math.max(
        retryAfterMs,
        boundedExponentialCooldownMs,
      );

    this.cooldownUntil =
      Math.max(
        this.cooldownUntil ??
          0,
        this.now() +
          cooldownMs,
      );
  }

  private validateConfig(
    config:
      GiottusPrivateRequestGovernorConfig,
  ): void {
    if (
      !Number.isSafeInteger(
        config.minimumRequestIntervalMs,
      ) ||
      config.minimumRequestIntervalMs <
        0
    ) {
      throw new Error(
        "Giottus private request interval must be a non-negative safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        config.minimumRateLimitCooldownMs,
      ) ||
      config.minimumRateLimitCooldownMs <
        1_000
    ) {
      throw new Error(
        "Giottus private rate-limit cooldown must be an integer of at least 1000 ms.",
      );
    }

    if (
      !Number.isSafeInteger(
        config.maximumRateLimitCooldownMs,
      ) ||
      config.maximumRateLimitCooldownMs <
        config.minimumRateLimitCooldownMs
    ) {
      throw new Error(
        "Giottus maximum private cooldown must be no lower than the minimum cooldown.",
      );
    }
  }
}

export const giottusPrivateRequestGovernor =
  new GiottusPrivateRequestGovernor();
