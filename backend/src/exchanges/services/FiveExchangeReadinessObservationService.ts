import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
  type JsonlSnapshotStoreDiagnostics,
} from "../../core/persistence/JsonlSnapshotStore";

import {
  CAT_PRO_TARGET_EXCHANGES,
  type CatProTargetExchange,
} from "../core/ExchangeFleetRegistry";

import {
  fiveExchangePaperShadowReadinessService,
  type FiveExchangePaperShadowReadinessReport,
} from "./FiveExchangePaperShadowReadinessService";

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),
    "logs",
    "readiness",
    "five-exchange-observations.jsonl",
  );

const DEFAULT_CAPTURE_INTERVAL_MS =
  30_000;

const DEFAULT_ROLLING_WINDOW_MS =
  24 * 60 * 60 * 1_000;

const DEFAULT_MINIMUM_OBSERVATIONS =
  120;

const DEFAULT_MINIMUM_DURATION_MS =
  60 * 60 * 1_000;

const DEFAULT_MINIMUM_AVAILABILITY_RATIO =
  0.99;

const MAXIMUM_RESTORED_OBSERVATIONS =
  10_000;

export interface FiveExchangeReadinessObservationExchange {
  exchange: CatProTargetExchange;

  marketDataConnected: boolean;

  executableMarkets: number;

  feeEvidenceMarkets: number;

  completeOrderRuleMarkets: number;

  shadowEligibleMarkets: number;

  paperEligibleMarkets: number;

  shadowAvailable: boolean;

  paperAvailable: boolean;

  blockers: string[];
}

export interface FiveExchangeReadinessObservation {
  schemaVersion: 1;

  milestone: "19.34";

  observedAt: number;

  sourceGeneratedAt: number;

  allFiveShadowAvailable: boolean;

  allFivePaperAvailable: boolean;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  exchanges:
    FiveExchangeReadinessObservationExchange[];
}

export interface ExchangeRollingReadiness {
  exchange: CatProTargetExchange;

  observations: number;

  connectedObservations: number;

  shadowAvailableObservations: number;

  paperAvailableObservations: number;

  shadowAvailabilityRatio: number;

  paperAvailabilityRatio: number;

  latestShadowEligibleMarkets: number;

  latestPaperEligibleMarkets: number;

  rollingShadowStable: boolean;

  rollingPaperStable: boolean;

  blockers: string[];
}

export interface FiveExchangeReadinessObservationReport {
  generatedAt: number;

  version: "19.34";

  mode:
    "PERSISTENT_ROLLING_READINESS_EVIDENCE";

  status:
    | "INSUFFICIENT_EVIDENCE"
    | "UNSTABLE"
    | "STABLE";

  targetExchangeCount: 5;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  allFiveRollingShadowStable: boolean;

  allFiveRollingPaperStable: boolean;

  policy: {
    rollingWindowMs: number;

    minimumObservations: number;

    minimumDurationMs: number;

    minimumAvailabilityRatio: number;

    captureIntervalMs: number;
  };

  evidence: {
    observationsInWindow: number;

    firstObservedAt: number | null;

    lastObservedAt: number | null;

    observedDurationMs: number;

    observationRequirementMet: boolean;

    durationRequirementMet: boolean;

    persistenceHealthy: boolean;
  };

  exchanges:
    ExchangeRollingReadiness[];

  blockers: string[];

  persistence:
    JsonlSnapshotStoreDiagnostics;

  notes: string[];
}

interface ReadinessSource {
  getReport():
    Promise<FiveExchangePaperShadowReadinessReport>;
}

export interface FiveExchangeReadinessObservationOptions {
  readinessSource?:
    ReadinessSource;

  persistenceFilePath?:
    string;

  now?: () => number;

  scheduleTimers?: boolean;

  captureIntervalMs?: number;

  rollingWindowMs?: number;

  minimumObservations?: number;

  minimumDurationMs?: number;

  minimumAvailabilityRatio?: number;
}

export class FiveExchangeReadinessObservationService {
  private readonly readinessSource:
    ReadinessSource;

  private readonly store:
    JsonlSnapshotStore<
      FiveExchangeReadinessObservation
    >;

  private readonly now:
    () => number;

  private readonly scheduleTimers:
    boolean;

  private readonly captureIntervalMs:
    number;

  private readonly rollingWindowMs:
    number;

  private readonly minimumObservations:
    number;

  private readonly minimumDurationMs:
    number;

  private readonly minimumAvailabilityRatio:
    number;

  private observations:
    FiveExchangeReadinessObservation[];

  private captureTimer:
    NodeJS.Timeout | null =
    null;

  private capturePromise:
    Promise<void> | null =
    null;

  constructor(
    options:
      FiveExchangeReadinessObservationOptions = {},
  ) {
    this.readinessSource =
      options.readinessSource ??
      fiveExchangePaperShadowReadinessService;

    this.now =
      options.now ??
      Date.now;

    this.scheduleTimers =
      options.scheduleTimers ??
      true;

    this.captureIntervalMs =
      this.positiveInteger(
        options.captureIntervalMs ??
          DEFAULT_CAPTURE_INTERVAL_MS,
        "Readiness capture interval",
      );

    this.rollingWindowMs =
      this.positiveInteger(
        options.rollingWindowMs ??
          DEFAULT_ROLLING_WINDOW_MS,
        "Readiness rolling window",
      );

    this.minimumObservations =
      this.positiveInteger(
        options.minimumObservations ??
          DEFAULT_MINIMUM_OBSERVATIONS,
        "Minimum readiness observations",
      );

    this.minimumDurationMs =
      this.positiveInteger(
        options.minimumDurationMs ??
          DEFAULT_MINIMUM_DURATION_MS,
        "Minimum readiness duration",
      );

    this.minimumAvailabilityRatio =
      this.ratio(
        options.minimumAvailabilityRatio ??
          DEFAULT_MINIMUM_AVAILABILITY_RATIO,
      );

    this.store =
      new JsonlSnapshotStore<
        FiveExchangeReadinessObservation
      >({
        filePath:
          options.persistenceFilePath ??
          DEFAULT_PERSISTENCE_FILE,
        isPayload:
          (value): value is FiveExchangeReadinessObservation =>
            this.isObservation(
              value,
            ),
      });

    this.observations =
      this.store
        .readAll()
        .sort(
          (first, second) =>
            first.observedAt -
            second.observedAt,
        )
        .slice(
          -MAXIMUM_RESTORED_OBSERVATIONS,
        );
  }

  start(): void {
    if (
      !this.scheduleTimers ||
      this.captureTimer !==
        null
    ) {
      return;
    }

    void this.capture()
      .catch(
        (error: unknown) => {
          console.error(
            "[Five-Exchange Readiness] Initial evidence capture failed; rolling readiness remains fail-closed:",
            this.errorMessage(
              error,
            ),
          );
        },
      );

    this.captureTimer =
      setInterval(
        () => {
          void this.capture()
            .catch(
              (error: unknown) => {
                console.error(
                  "[Five-Exchange Readiness] Evidence capture failed; rolling readiness remains fail-closed:",
                  this.errorMessage(
                    error,
                  ),
                );
              },
            );
        },
        this.captureIntervalMs,
      );

    this.captureTimer.unref();
  }

  stop(): void {
    if (
      this.captureTimer ===
        null
    ) {
      return;
    }

    clearInterval(
      this.captureTimer,
    );

    this.captureTimer =
      null;
  }

  async capture():
    Promise<void> {
    if (this.capturePromise) {
      await this.capturePromise;

      return;
    }

    const promise =
      this.captureNow();

    this.capturePromise =
      promise;

    try {
      await promise;
    } finally {
      if (
        this.capturePromise ===
          promise
      ) {
        this.capturePromise =
          null;
      }
    }
  }

  getReport():
    FiveExchangeReadinessObservationReport {
    const now =
      this.now();

    const windowStart =
      now -
      this.rollingWindowMs;

    const observations =
      this.observations
        .filter(
          (observation) =>
            observation.observedAt >=
              windowStart &&
            observation.observedAt <=
              now,
        );

    const firstObservedAt =
      observations[0]
        ?.observedAt ??
      null;

    const lastObservedAt =
      observations[
        observations.length -
          1
      ]?.observedAt ??
      null;

    const observedDurationMs =
      firstObservedAt !==
        null &&
      lastObservedAt !==
        null
        ? Math.max(
            0,
            lastObservedAt -
              firstObservedAt,
          )
        : 0;

    const observationRequirementMet =
      observations.length >=
      this.minimumObservations;

    const durationRequirementMet =
      observedDurationMs >=
      this.minimumDurationMs;

    const persistence =
      this.store
        .getDiagnostics();

    const persistenceHealthy =
      persistence.writeFailures ===
        0 &&
      persistence.lastError ===
        null;

    const exchanges =
      CAT_PRO_TARGET_EXCHANGES
        .map(
          (exchange) =>
            this.analyzeExchange(
              exchange,
              observations,
              observationRequirementMet,
              durationRequirementMet,
              persistenceHealthy,
            ),
        );

    const allFiveRollingShadowStable =
      exchanges.every(
        (exchange) =>
          exchange.rollingShadowStable,
      );

    const allFiveRollingPaperStable =
      exchanges.every(
        (exchange) =>
          exchange.rollingPaperStable,
      );

    const blockers:
      string[] = [];

    if (!observationRequirementMet) {
      blockers.push(
        `Rolling readiness requires ${this.minimumObservations} real observations; ${observations.length} are currently available.`,
      );
    }

    if (!durationRequirementMet) {
      blockers.push(
        `Rolling readiness requires ${this.minimumDurationMs} ms of elapsed evidence; ${observedDurationMs} ms are currently available.`,
      );
    }

    if (!persistenceHealthy) {
      blockers.push(
        `Readiness evidence persistence is unhealthy: ${persistence.lastError ?? `${persistence.writeFailures} write failure(s).`}`,
      );
    }

    blockers.push(
      ...exchanges.flatMap(
        (exchange) =>
          exchange.blockers.map(
            (blocker) =>
              `${exchange.exchange}: ${blocker}`,
          ),
      ),
    );

    const sufficientEvidence =
      observationRequirementMet &&
      durationRequirementMet &&
      persistenceHealthy;

    return {
      generatedAt:
        now,
      version:
        "19.34",
      mode:
        "PERSISTENT_ROLLING_READINESS_EVIDENCE",
      status:
        !sufficientEvidence
          ? "INSUFFICIENT_EVIDENCE"
          : allFiveRollingShadowStable &&
              allFiveRollingPaperStable
            ? "STABLE"
            : "UNSTABLE",
      targetExchangeCount:
        5,
      liveTradingEnabled:
        false,
      liveSubmissionAllowed:
        false,
      allFiveRollingShadowStable,
      allFiveRollingPaperStable,
      policy: {
        rollingWindowMs:
          this.rollingWindowMs,
        minimumObservations:
          this.minimumObservations,
        minimumDurationMs:
          this.minimumDurationMs,
        minimumAvailabilityRatio:
          this.minimumAvailabilityRatio,
        captureIntervalMs:
          this.captureIntervalMs,
      },
      evidence: {
        observationsInWindow:
          observations.length,
        firstObservedAt,
        lastObservedAt,
        observedDurationMs,
        observationRequirementMet,
        durationRequirementMet,
        persistenceHealthy,
      },
      exchanges,
      blockers: [
        ...new Set(
          blockers,
        ),
      ],
      persistence,
      notes: [
        "Only snapshots captured from the real V19.33 readiness service are counted; no historical observation is synthesized.",
        "Restart-safe JSONL observations are evaluated inside a bounded rolling time window.",
        "A single point-in-time available state cannot satisfy sustained-readiness policy.",
        "Observation stability is not evidence of balances, fills, profit, exchange health, or future availability.",
        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }

  private async captureNow():
    Promise<void> {
    const source =
      await this.readinessSource
        .getReport();

    const observedAt =
      this.now();

    const observation:
      FiveExchangeReadinessObservation = {
      schemaVersion:
        1,
      milestone:
        "19.34",
      observedAt,
      sourceGeneratedAt:
        source.generatedAt,
      allFiveShadowAvailable:
        source.allFiveShadowAvailable,
      allFivePaperAvailable:
        source.allFivePaperAvailable,
      liveTradingEnabled:
        false,
      liveSubmissionAllowed:
        false,
      exchanges:
        source.exchanges.map(
          (exchange) => ({
            exchange:
              exchange.exchange,
            marketDataConnected:
              exchange.marketDataConnected,
            executableMarkets:
              exchange.executableMarkets,
            feeEvidenceMarkets:
              exchange.feeEvidenceMarkets,
            completeOrderRuleMarkets:
              exchange.completeOrderRuleMarkets,
            shadowEligibleMarkets:
              exchange.shadowEligibleMarkets,
            paperEligibleMarkets:
              exchange.paperEligibleMarkets,
            shadowAvailable:
              exchange.shadowAvailability ===
              "AVAILABLE",
            paperAvailable:
              exchange.paperAvailability ===
              "AVAILABLE",
            blockers: [
              ...exchange.blockers,
            ],
          }),
        ),
    };

    this.store.append(
      observation,
    );

    this.observations.push(
      observation,
    );

    this.prune(
      observedAt,
    );
  }

  private analyzeExchange(
    exchange:
      CatProTargetExchange,
    observations:
      readonly FiveExchangeReadinessObservation[],
    observationRequirementMet:
      boolean,
    durationRequirementMet:
      boolean,
    persistenceHealthy:
      boolean,
  ): ExchangeRollingReadiness {
    const evidence =
      observations
        .map(
          (observation) =>
            observation.exchanges.find(
              (item) =>
                item.exchange ===
                exchange,
            ) ??
            null,
        )
        .filter(
          (
            item,
          ): item is FiveExchangeReadinessObservationExchange =>
            item !==
            null,
        );

    const connectedObservations =
      evidence.filter(
        (item) =>
          item.marketDataConnected,
      ).length;

    const shadowAvailableObservations =
      evidence.filter(
        (item) =>
          item.shadowAvailable,
      ).length;

    const paperAvailableObservations =
      evidence.filter(
        (item) =>
          item.paperAvailable,
      ).length;

    const shadowAvailabilityRatio =
      evidence.length >
        0
        ? shadowAvailableObservations /
          evidence.length
        : 0;

    const paperAvailabilityRatio =
      evidence.length >
        0
        ? paperAvailableObservations /
          evidence.length
        : 0;

    const latest =
      evidence[
        evidence.length -
          1
      ];

    const commonEvidenceHealthy =
      observationRequirementMet &&
      durationRequirementMet &&
      persistenceHealthy &&
      evidence.length ===
        observations.length;

    const rollingShadowStable =
      commonEvidenceHealthy &&
      shadowAvailabilityRatio >=
        this.minimumAvailabilityRatio &&
      latest?.shadowAvailable ===
        true;

    const rollingPaperStable =
      commonEvidenceHealthy &&
      paperAvailabilityRatio >=
        this.minimumAvailabilityRatio &&
      latest?.paperAvailable ===
        true;

    const blockers:
      string[] = [];

    if (
      evidence.length !==
      observations.length
    ) {
      blockers.push(
        `Only ${evidence.length}/${observations.length} rolling observations contain this exchange.`,
      );
    }

    if (
      shadowAvailabilityRatio <
      this.minimumAvailabilityRatio
    ) {
      blockers.push(
        `Shadow availability ratio ${(shadowAvailabilityRatio * 100).toFixed(2)}% is below ${(this.minimumAvailabilityRatio * 100).toFixed(2)}%.`,
      );
    }

    if (
      paperAvailabilityRatio <
      this.minimumAvailabilityRatio
    ) {
      blockers.push(
        `Paper availability ratio ${(paperAvailabilityRatio * 100).toFixed(2)}% is below ${(this.minimumAvailabilityRatio * 100).toFixed(2)}%.`,
      );
    }

    if (latest) {
      blockers.push(
        ...latest.blockers.map(
          (blocker) =>
            `Latest observation: ${blocker}`,
        ),
      );
    }

    return {
      exchange,
      observations:
        evidence.length,
      connectedObservations,
      shadowAvailableObservations,
      paperAvailableObservations,
      shadowAvailabilityRatio,
      paperAvailabilityRatio,
      latestShadowEligibleMarkets:
        latest?.shadowEligibleMarkets ??
        0,
      latestPaperEligibleMarkets:
        latest?.paperEligibleMarkets ??
        0,
      rollingShadowStable,
      rollingPaperStable,
      blockers: [
        ...new Set(
          blockers,
        ),
      ],
    };
  }

  private prune(
    now: number,
  ): void {
    const oldestUseful =
      now -
      this.rollingWindowMs;

    this.observations =
      this.observations
        .filter(
          (observation) =>
            observation.observedAt >=
            oldestUseful,
        )
        .slice(
          -MAXIMUM_RESTORED_OBSERVATIONS,
        );
  }

  private isObservation(
    value: unknown,
  ): value is FiveExchangeReadinessObservation {
    if (
      typeof value !==
        "object" ||
      value ===
        null ||
      Array.isArray(
        value,
      )
    ) {
      return false;
    }

    const record =
      value as Record<
        string,
        unknown
      >;

    if (
      record.schemaVersion !==
        1 ||
      record.milestone !==
        "19.34" ||
      !Number.isSafeInteger(
        record.observedAt,
      ) ||
      !Number.isSafeInteger(
        record.sourceGeneratedAt,
      ) ||
      record.liveTradingEnabled !==
        false ||
      record.liveSubmissionAllowed !==
        false ||
      !Array.isArray(
        record.exchanges,
      ) ||
      record.exchanges.length !==
        5
    ) {
      return false;
    }

    const exchangeNames =
      record.exchanges
        .map(
          (exchange) =>
            typeof exchange ===
              "object" &&
            exchange !==
              null &&
            !Array.isArray(
              exchange,
            )
              ? (
                  exchange as Record<
                    string,
                    unknown
                  >
                ).exchange
              : null,
        );

    return CAT_PRO_TARGET_EXCHANGES
      .every(
        (exchange) =>
          exchangeNames.includes(
            exchange,
          ),
      );
  }

  private positiveInteger(
    value: number,
    label: string,
  ): number {
    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value <=
        0
    ) {
      throw new Error(
        `${label} must be a positive integer.`,
      );
    }

    return value;
  }

  private ratio(
    value: number,
  ): number {
    if (
      !Number.isFinite(
        value,
      ) ||
      value <=
        0 ||
      value >
        1
    ) {
      throw new Error(
        "Minimum readiness availability ratio must be greater than zero and at most one.",
      );
    }

    return value;
  }

  private errorMessage(
    error: unknown,
  ): string {
    return error instanceof Error &&
      error.message.trim()
      ? error.message
      : "Unknown readiness evidence capture error.";
  }
}

export const fiveExchangeReadinessObservationService =
  new FiveExchangeReadinessObservationService();
