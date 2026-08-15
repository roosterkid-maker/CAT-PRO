import {
  randomUUID,
} from "node:crypto";

import {
  capitalReservationService,
} from "../../../trading/capital/CapitalReservationService";

import {
  executionPlanValidator,
} from "../../../trading/execution/ExecutionPlanValidator";

import type {
  ExecutionPlan,
} from "../../../trading/models/ExecutionPlan";

import {
  liveExecutionService,
} from "../LiveExecutionService";

import type {
  LiveExecutionCoordinatorDiagnostics,
  LiveExecutionCoordinatorEvent,
  LiveExecutionCoordinatorEventType,
  LiveExecutionSession,
  PrepareLiveExecutionResult,
} from "./LiveExecutionSession";

const LIVE_EXECUTION_CONFIRMATION =
  "ENABLE_CONFIRMED_LIVE_EXECUTION";

type ExecutionSessionKind =
  | "LIVE"
  | "DRY_RUN"
  | "PAPER";

export class LiveExecutionCoordinator {
  private static readonly SWEEP_INTERVAL_MS =
    500;

  private static readonly MAXIMUM_HISTORY =
    250;

  private readonly sessions =
    new Map<
      string,
      LiveExecutionSession
    >();

  private readonly executionLocks =
    new Map<
      string,
      string
    >();

  /*
   * Version 14.6
   *
   * Explicitly tracks synthetic sessions.
   * Settlement can therefore avoid mutating
   * real/paper account PnL during dry runs.
   */
  private readonly dryRunSessionIds =
    new Set<string>();

  /*
   * PAPER uses the same coordinator, reservation, route-lock and lifecycle
   * state machine, while remaining explicitly non-LIVE.
   */
  private readonly paperSessionIds =
    new Set<string>();

  private timer:
    ReturnType<typeof setInterval> |
    null =
    null;

  private totalPrepared =
    0;

  private totalCompleted =
    0;

  private totalFailed =
    0;

  private totalCancelled =
    0;

  private totalExpired =
    0;

  private totalRejected =
    0;

  start(): void {
    if (
      this.timer !==
      null
    ) {
      return;
    }

    this.timer =
      setInterval(
        () => {
          this.sweepExpired();
        },
        LiveExecutionCoordinator
          .SWEEP_INTERVAL_MS,
      );

    this.timer.unref?.();

    console.log(
      "[LiveCoordinator] Execution coordinator started.",
    );
  }

  stop(): void {
    if (
      this.timer ===
      null
    ) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer =
      null;

    console.log(
      "[LiveCoordinator] Execution coordinator stopped.",
    );
  }

  async prepare(
    plan:
      ExecutionPlan,
  ): Promise<PrepareLiveExecutionResult> {
    this.start();

    const preliminaryReasons =
      this.validateLivePreconditions(
        plan,
      );

    if (
      preliminaryReasons.length >
      0
    ) {
      this.totalRejected +=
        1;

      return {
        approved:
          false,

        session:
          null,

        reasons:
          preliminaryReasons,
      };
    }

    const availability =
      this.validateSessionAvailability(
        plan,
      );

    if (
      availability.reasons.length >
      0
    ) {
      this.totalRejected +=
        1;

      return {
        approved:
          false,

        session:
          null,

        reasons:
          availability.reasons,
      };
    }

    const session =
      this.createSession(
        plan,
        availability.lockKey,
      );

    this.acquireSession(
      session,
    );

    try {
      const validation =
        await executionPlanValidator
          .validate(
            plan,
          );

      session.validationReasons = [
        ...validation.reasons,
      ];

      if (
        !validation.valid
      ) {
        this.totalRejected +=
          1;

        this.failInternal(
          session,
          validation.reasons.length >
            0
            ? validation.reasons.join(
                " | ",
              )
            : "Execution plan validation failed.",
        );

        return {
          approved:
            false,

          session:
            this.cloneSession(
              session,
            ),

          reasons:
            session.validationReasons,
        };
      }

      this.addEvent(
        session,
        "PLAN_VALIDATED",
        "Execution plan passed exchange capability and order validation.",
      );

      const adapterReasons =
        this.validateExecutionAdapters(
          plan,
        );

      if (
        adapterReasons.length >
        0
      ) {
        this.totalRejected +=
          1;

        this.failInternal(
          session,
          adapterReasons.join(
            " | ",
          ),
        );

        return {
          approved:
            false,

          session:
            this.cloneSession(
              session,
            ),

          reasons:
            adapterReasons,
        };
      }

      return this.reserveAndReady(
        session,
        "LIVE",
      );
    } catch (
      error:
        unknown
    ) {
      this.totalRejected +=
        1;

      const message =
        error instanceof Error
          ? error.message
          : "Unknown live execution preparation error.";

      this.failInternal(
        session,
        message,
      );

      return {
        approved:
          false,

        session:
          this.cloneSession(
            session,
          ),

        reasons: [
          message,
        ],
      };
    }
  }

  /*
   * Version 14.6
   *
   * Dedicated synthetic preparation path.
   *
   * IMPORTANT:
   *
   * - no live-trading confirmation required
   * - no execution adapter required
   * - no exchange API call
   * - no order submission
   *
   * But it DOES use:
   *
   * - real coordinator state machine
   * - real route lock
   * - real capital reservation layer
   */
  prepareDryRun(
    plan:
      ExecutionPlan,
  ): PrepareLiveExecutionResult {
    this.start();

    const reasons =
      this.validateDryRunPreconditions(
        plan,
      );

    if (
      reasons.length >
      0
    ) {
      this.totalRejected +=
        1;

      return {
        approved:
          false,

        session:
          null,

        reasons,
      };
    }

    const availability =
      this.validateSessionAvailability(
        plan,
      );

    if (
      availability.reasons.length >
      0
    ) {
      this.totalRejected +=
        1;

      return {
        approved:
          false,

        session:
          null,

        reasons:
          availability.reasons,
      };
    }

    const session =
      this.createSession(
        plan,
        availability.lockKey,
      );

    this.dryRunSessionIds
      .add(
        session.id,
      );

    this.acquireSession(
      session,
    );

    this.addEvent(
      session,
      "PLAN_VALIDATED",
      "Synthetic execution plan passed Version 14.6 dry-run structural validation.",
      {
        dryRun:
          true,
      },
    );

    return this.reserveAndReady(
      session,
      "DRY_RUN",
    );
  }

  preparePaper(
    plan:
      ExecutionPlan,
  ): PrepareLiveExecutionResult {
    this.start();

    const reasons =
      this.validatePaperPreconditions(
        plan,
      );

    if (
      reasons.length >
      0
    ) {
      this.totalRejected +=
        1;

      return {
        approved:
          false,
        session:
          null,
        reasons,
      };
    }

    const availability =
      this.validateSessionAvailability(
        plan,
      );

    if (
      availability.reasons.length >
      0
    ) {
      this.totalRejected +=
        1;

      return {
        approved:
          false,
        session:
          null,
        reasons:
          availability.reasons,
      };
    }

    const session =
      this.createSession(
        plan,
        availability.lockKey,
      );

    this.paperSessionIds
      .add(
        session.id,
      );

    this.acquireSession(
      session,
    );

    this.addEvent(
      session,
      "PLAN_VALIDATED",
      "PAPER execution plan passed non-LIVE lifecycle structural validation.",
      {
        paper:
          true,
      },
    );

    return this.reserveAndReady(
      session,
      "PAPER",
    );
  }

  isDryRunSession(
    sessionId:
      string,
  ): boolean {
    return this.dryRunSessionIds
      .has(
        sessionId,
      );
  }

  isPaperSession(
    sessionId:
      string,
  ): boolean {
    return this.paperSessionIds
      .has(
        sessionId,
      );
  }

  isNonLiveSession(
    sessionId:
      string,
  ): boolean {
    return this.isDryRunSession(
      sessionId,
    ) ||
    this.isPaperSession(
      sessionId,
    );
  }

  markRunning(
    sessionId:
      string,
  ): LiveExecutionSession {
    const session =
      this.getMutableActiveSession(
        sessionId,
      );

    if (
      session.status !==
      "READY_FOR_SUBMISSION"
    ) {
      throw new Error(
        `Execution session cannot start from status ${session.status}.`,
      );
    }

    if (
      Date.now() >
      session.expiresAt
    ) {
      this.expireInternal(
        session,
      );

      throw new Error(
        "Execution session expired before order submission.",
      );
    }

    this.transition(
      session,
      "RUNNING",
    );

    session.startedAt =
      Date.now();

    this.addEvent(
      session,
      "EXECUTION_STARTED",
      this.isPaperSession(
        session.id,
      )
        ? "PAPER two-leg lifecycle execution started. No exchange order was submitted."
        : this.isDryRunSession(
            session.id,
          )
          ? "Synthetic order lifecycle execution started. No exchange order was submitted."
          : "Order lifecycle execution started.",
      {
        dryRun:
          this.isDryRunSession(
            session.id,
          ),

        paper:
          this.isPaperSession(
            session.id,
          ),
      },
    );

    return this.cloneSession(
      session,
    );
  }

  complete(
    sessionId:
      string,
  ): LiveExecutionSession {
    const session =
      this.getMutableActiveSession(
        sessionId,
      );

    if (
      session.status !==
      "RUNNING"
    ) {
      throw new Error(
        `Execution session cannot complete from status ${session.status}.`,
      );
    }

    if (
      session.reservationId
    ) {
      capitalReservationService
        .commit(
          session.reservationId,
          this.isPaperSession(
            session.id,
          )
            ? "PAPER execution completed and settled."
            : this.isDryRunSession(
                session.id,
              )
              ? "Dry-run execution completed successfully."
              : "Live arbitrage execution completed and settled.",
        );
    }

    session.completedAt =
      Date.now();

    this.transition(
      session,
      "COMPLETED",
    );

    this.addEvent(
      session,
      "EXECUTION_COMPLETED",
      this.isPaperSession(
        session.id,
      )
        ? "PAPER execution session completed."
        : this.isDryRunSession(
            session.id,
          )
          ? "Synthetic execution session completed."
          : "Live execution session completed.",
      {
        dryRun:
          this.isDryRunSession(
            session.id,
          ),

        paper:
          this.isPaperSession(
            session.id,
          ),
      },
    );

    this.releaseLock(
      session,
    );

    this.totalCompleted +=
      1;

    return this.cloneSession(
      session,
    );
  }

  fail(
    sessionId:
      string,

    reason:
      string,
  ): LiveExecutionSession {
    const session =
      this.getMutableActiveSession(
        sessionId,
      );

    this.failInternal(
      session,
      reason,
    );

    return this.cloneSession(
      session,
    );
  }

  cancel(
    sessionId:
      string,

    reason =
      "Live execution session cancelled before order submission.",
  ): LiveExecutionSession {
    const session =
      this.getMutableActiveSession(
        sessionId,
      );

    if (
      session.status ===
      "RUNNING"
    ) {
      throw new Error(
        "A RUNNING live execution cannot be cancelled by Version 14.0 coordinator. Order Lifecycle Manager recovery is required.",
      );
    }

    this.releaseReservation(
      session,
      reason,
    );

    this.transition(
      session,
      "CANCELLED",
    );

    session.completedAt =
      Date.now();

    session.failureReason =
      reason;

    this.addEvent(
      session,
      "EXECUTION_CANCELLED",
      reason,
    );

    this.releaseLock(
      session,
    );

    this.totalCancelled +=
      1;

    return this.cloneSession(
      session,
    );
  }

  getSession(
    sessionId:
      string,
  ): LiveExecutionSession | null {
    this.sweepExpired();

    const session =
      this.sessions.get(
        sessionId,
      );

    return session
      ? this.cloneSession(
          session,
        )
      : null;
  }

  getDiagnostics():
    LiveExecutionCoordinatorDiagnostics {
    this.sweepExpired();

    const sessions =
      Array.from(
        this.sessions.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            second.createdAt -
            first.createdAt,
        )
        .slice(
          0,
          LiveExecutionCoordinator
            .MAXIMUM_HISTORY,
        )
        .map(
          (
            session,
          ) =>
            this.cloneSession(
              session,
            ),
        );

    return {
      generatedAt:
        Date.now(),

      liveExecutionConfirmed:
        this.isLiveExecutionConfirmed(),

      activeSessions:
        sessions.filter(
          (
            session,
          ) =>
            this.isActiveStatus(
              session.status,
            ),
        ).length,

      readySessions:
        sessions.filter(
          (
            session,
          ) =>
            session.status ===
            "READY_FOR_SUBMISSION",
        ).length,

      runningSessions:
        sessions.filter(
          (
            session,
          ) =>
            session.status ===
            "RUNNING",
        ).length,

      totalPrepared:
        this.totalPrepared,

      totalCompleted:
        this.totalCompleted,

      totalFailed:
        this.totalFailed,

      totalCancelled:
        this.totalCancelled,

      totalExpired:
        this.totalExpired,

      totalRejected:
        this.totalRejected,

      activeLocks:
        this.executionLocks.size,

      sessions,
    };
  }

  sweepExpired(
    now =
      Date.now(),
  ): number {
    let expired =
      0;

    for (
      const session
      of this.sessions.values()
    ) {
      if (
        !this.isActiveStatus(
          session.status,
        )
      ) {
        continue;
      }

      if (
        session.status ===
        "RUNNING"
      ) {
        continue;
      }

      if (
        now <=
        session.expiresAt
      ) {
        continue;
      }

      this.expireInternal(
        session,
      );

      expired +=
        1;
    }

    return expired;
  }

  private reserveAndReady(
    session:
      LiveExecutionSession,

    kind:
      ExecutionSessionKind,
  ): PrepareLiveExecutionResult {
    const nonLive =
      kind !==
      "LIVE";

    const remainingLifetimeMs =
      session.expiresAt -
      Date.now();

    if (
      remainingLifetimeMs <=
      0
    ) {
      this.expireInternal(
        session,
      );

      return {
        approved:
          false,

        session:
          this.cloneSession(
            session,
          ),

        reasons: [
          "Execution plan expired before capital reservation.",
        ],
      };
    }

    const reservation =
      capitalReservationService
        .reserve({
          ownerType:
            "EXECUTION_PLAN",

          ownerId:
            session.id,

          amount:
            session.capital,

          ttlMs:
            this.clampReservationTtl(
              remainingLifetimeMs,
            ),
        });

    if (
      !reservation.approved ||
      !reservation.reservation
    ) {
      this.totalRejected +=
        1;

      const reasons =
        reservation.reasons.length >
        0
          ? reservation.reasons
          : [
              "Unable to reserve capital for execution.",
            ];

      this.failInternal(
        session,
        reasons.join(
          " | ",
        ),
      );

      return {
        approved:
          false,

        session:
          this.cloneSession(
            session,
          ),

        reasons,
      };
    }

    session.reservationId =
      reservation
        .reservation
        .id;

    this.transition(
      session,
      "RESERVED",
    );

    this.addEvent(
      session,
      "CAPITAL_RESERVED",
      kind ===
        "PAPER"
        ? "Trading capital reserved for the PAPER execution session."
        : kind ===
            "DRY_RUN"
          ? "Trading capital temporarily reserved for dry-run validation."
          : "Trading capital reserved for the live execution session.",
      {
        reservationId:
          session.reservationId,

        capital:
          session.capital,

        dryRun:
          kind ===
          "DRY_RUN",

        paper:
          kind ===
          "PAPER",
      },
    );

    this.addEvent(
      session,
      "EXECUTION_LOCK_ACQUIRED",
      "Exclusive execution route lock acquired.",
      {
        lockKey:
          session.lockKey,

        dryRun:
          kind ===
          "DRY_RUN",

        paper:
          kind ===
          "PAPER",
      },
    );

    this.transition(
      session,
      "READY_FOR_SUBMISSION",
    );

    this.addEvent(
      session,
      "READY_FOR_SUBMISSION",
      kind ===
        "PAPER"
        ? "PAPER session is ready for synthetic two-leg lifecycle execution."
        : kind ===
            "DRY_RUN"
          ? "Dry-run session is ready for synthetic lifecycle execution."
          : "Session passed all Version 14.0 gates and is ready for the Order Lifecycle Manager.",
      {
        dryRun:
          kind ===
          "DRY_RUN",

        paper:
          kind ===
          "PAPER",
      },
    );

    this.totalPrepared +=
      1;

    return {
      approved:
        true,

      session:
        this.cloneSession(
          session,
        ),

      reasons:
        nonLive
          ? [
              kind ===
                "PAPER"
                ? "PAPER lifecycle structural validation passed."
                : "Dry-run structural validation passed.",
              "Capital reservation acquired.",
              "Execution route lock acquired.",
              "No exchange API call or live order submission occurred.",
            ]
          : [
              "Execution plan validated.",
              "Live execution adapters are registered and connected.",
              "Capital reservation acquired.",
              "Execution route lock acquired.",
              "Session is ready for Version 14.1 order submission.",
            ],
    };
  }

  private validateLivePreconditions(
    plan:
      ExecutionPlan,
  ): string[] {
    const reasons =
      this.validateCommonPlan(
        plan,
        "LIVE",
      );

    if (
      !this.isLiveExecutionConfirmed()
    ) {
      reasons.push(
        "Live execution is blocked because LIVE_TRADING_CONFIRMATION is not ENABLE_CONFIRMED_LIVE_EXECUTION.",
      );
    }

    return reasons;
  }

  private validateDryRunPreconditions(
    plan:
      ExecutionPlan,
  ): string[] {
    const reasons =
      this.validateCommonPlan(
        plan,
        "LIVE",
      );

    if (
      plan.buy.side !==
      "BUY"
    ) {
      reasons.push(
        "Dry-run BUY leg side must be BUY.",
      );
    }

    if (
      plan.sell.side !==
      "SELL"
    ) {
      reasons.push(
        "Dry-run SELL leg side must be SELL.",
      );
    }

    if (
      plan.buy.market
        .trim()
        .toUpperCase() !==
      plan.market
        .trim()
        .toUpperCase()
    ) {
      reasons.push(
        "Dry-run BUY market does not match plan market.",
      );
    }

    if (
      plan.sell.market
        .trim()
        .toUpperCase() !==
      plan.market
        .trim()
        .toUpperCase()
    ) {
      reasons.push(
        "Dry-run SELL market does not match plan market.",
      );
    }

    for (
      const leg
      of [
        plan.buy,
        plan.sell,
      ]
    ) {
      if (
        !Number.isFinite(
          leg.quantity,
        ) ||
        leg.quantity <=
          0
      ) {
        reasons.push(
          `${leg.side} quantity must be positive.`,
        );
      }

      if (
        !Number.isFinite(
          leg.limitPrice,
        ) ||
        leg.limitPrice <=
          0
      ) {
        reasons.push(
          `${leg.side} limit price must be positive.`,
        );
      }
    }

    return reasons;
  }

  private validatePaperPreconditions(
    plan:
      ExecutionPlan,
  ): string[] {
    const reasons =
      this.validateCommonPlan(
        plan,
        "PAPER",
      );

    if (
      plan.buy.side !==
      "BUY"
    ) {
      reasons.push(
        "PAPER BUY leg side must be BUY.",
      );
    }

    if (
      plan.sell.side !==
      "SELL"
    ) {
      reasons.push(
        "PAPER SELL leg side must be SELL.",
      );
    }

    if (
      plan.buy.market
        .trim()
        .toUpperCase() !==
      plan.market
        .trim()
        .toUpperCase() ||
      plan.sell.market
        .trim()
        .toUpperCase() !==
      plan.market
        .trim()
        .toUpperCase()
    ) {
      reasons.push(
        "PAPER execution-leg markets must match the plan market.",
      );
    }

    for (
      const leg
      of [
        plan.buy,
        plan.sell,
      ]
    ) {
      if (
        !Number.isFinite(
          leg.quantity,
        ) ||
        leg.quantity <=
          0
      ) {
        reasons.push(
          `${leg.side} PAPER quantity must be positive.`,
        );
      }

      if (
        !Number.isFinite(
          leg.limitPrice,
        ) ||
        leg.limitPrice <=
          0
      ) {
        reasons.push(
          `${leg.side} PAPER limit price must be positive.`,
        );
      }
    }

    return reasons;
  }

  private validateCommonPlan(
    plan:
      ExecutionPlan,

    expectedMode:
      ExecutionPlan["mode"],
  ): string[] {
    const reasons:
      string[] =
      [];

    if (
      plan.mode !==
      expectedMode
    ) {
      reasons.push(
        `Execution plan mode must be ${expectedMode}. Current mode: ${plan.mode}.`,
      );
    }

    if (
      plan.status !==
      "READY"
    ) {
      reasons.push(
        `Execution plan must be READY. Current status: ${plan.status}.`,
      );
    }

    if (
      !plan.id
        .trim()
    ) {
      reasons.push(
        "Execution plan ID is required.",
      );
    }

    if (
      !plan.market
        .trim()
    ) {
      reasons.push(
        "Execution market is required.",
      );
    }

    if (
      plan.buy.exchange
        .trim()
        .toLowerCase() ===
      plan.sell.exchange
        .trim()
        .toLowerCase()
    ) {
      reasons.push(
        "Arbitrage buy and sell exchanges must be different.",
      );
    }

    if (
      !Number.isFinite(
        plan.capital,
      ) ||
      plan.capital <=
        0
    ) {
      reasons.push(
        "Execution capital must be a positive finite number.",
      );
    }

    if (
      Date.now() >=
      this.resolveExpiration(
        plan,
        Date.now(),
      )
    ) {
      reasons.push(
        "Execution plan has already expired.",
      );
    }

    return reasons;
  }

  private validateSessionAvailability(
    plan:
      ExecutionPlan,
  ): {
    lockKey:
      string;

    reasons:
      string[];
  } {
    const lockKey =
      this.createLockKey(
        plan,
      );

    const reasons:
      string[] =
      [];

    if (
      this.executionLocks.has(
        lockKey,
      )
    ) {
      reasons.push(
        "Another execution session already owns this market/exchange route.",
      );
    }

    const duplicatePlan =
      Array.from(
        this.sessions.values(),
      )
        .find(
          (
            session,
          ) =>
            session.planId ===
              plan.id &&
            this.isActiveStatus(
              session.status,
            ),
        );

    if (
      duplicatePlan
    ) {
      reasons.push(
        "This execution plan already has an active execution session.",
      );
    }

    return {
      lockKey,
      reasons,
    };
  }

  private createSession(
    plan:
      ExecutionPlan,

    lockKey:
      string,
  ): LiveExecutionSession {
    const now =
      Date.now();

    const session:
      LiveExecutionSession = {
      id:
        randomUUID(),

      planId:
        plan.id,

      lockKey,

      market:
        plan.market
          .trim()
          .toUpperCase(),

      buyExchange:
        plan.buy.exchange
          .trim()
          .toLowerCase(),

      sellExchange:
        plan.sell.exchange
          .trim()
          .toLowerCase(),

      capital:
        plan.capital,

      status:
        "VALIDATING",

      reservationId:
        null,

      createdAt:
        now,

      updatedAt:
        now,

      expiresAt:
        this.resolveExpiration(
          plan,
          now,
        ),

      startedAt:
        null,

      completedAt:
        null,

      failureReason:
        null,

      validationReasons:
        [],

      plan:
        structuredClone(
          plan,
        ),

      events: [],
    };

    this.addEvent(
      session,
      "SESSION_CREATED",
      "Execution session created.",
    );

    return session;
  }

  private acquireSession(
    session:
      LiveExecutionSession,
  ): void {
    this.executionLocks.set(
      session.lockKey,
      session.id,
    );

    this.sessions.set(
      session.id,
      session,
    );
  }

  private validateExecutionAdapters(
    plan:
      ExecutionPlan,
  ): string[] {
    const reasons:
      string[] =
      [];

    const exchanges = [
      plan.buy.exchange,
      plan.sell.exchange,
    ];

    for (
      const exchange
      of exchanges
    ) {
      const normalized =
        exchange
          .trim()
          .toLowerCase();

      if (
        !liveExecutionService
          .hasAdapter(
            normalized,
          )
      ) {
        reasons.push(
          `No live execution adapter is registered for ${normalized}.`,
        );

        continue;
      }

      if (
        !liveExecutionService
          .isExchangeConnected(
            normalized,
          )
      ) {
        const status =
          liveExecutionService
            .getExchangeStatus(
              normalized,
            );

        reasons.push(
          `LIVE execution availability is blocked for ${normalized} (liveEnabled=${status.liveExecutionEnabled}, verification=${status.verificationState}, authenticated=${status.authenticationVerified}, apiReachable=${status.exchangeApiReachable}).`,
        );
      }
    }

    return reasons;
  }

  private failInternal(
    session:
      LiveExecutionSession,

    reason:
      string,
  ): void {
    if (
      !this.isActiveStatus(
        session.status,
      )
    ) {
      return;
    }

    this.releaseReservation(
      session,
      reason,
    );

    session.failureReason =
      reason;

    session.completedAt =
      Date.now();

    this.transition(
      session,
      "FAILED",
    );

    this.addEvent(
      session,
      "EXECUTION_FAILED",
      reason,
      {
        dryRun:
          this.isDryRunSession(
            session.id,
          ),

        paper:
          this.isPaperSession(
            session.id,
          ),
      },
    );

    this.releaseLock(
      session,
    );

    this.totalFailed +=
      1;
  }

  private expireInternal(
    session:
      LiveExecutionSession,
  ): void {
    if (
      !this.isActiveStatus(
        session.status,
      )
    ) {
      return;
    }

    const reason =
      "Execution session expired before order submission.";

    this.releaseReservation(
      session,
      reason,
    );

    session.failureReason =
      reason;

    session.completedAt =
      Date.now();

    this.transition(
      session,
      "EXPIRED",
    );

    this.addEvent(
      session,
      "EXECUTION_EXPIRED",
      reason,
    );

    this.releaseLock(
      session,
    );

    this.totalExpired +=
      1;
  }

  private releaseReservation(
    session:
      LiveExecutionSession,

    reason:
      string,
  ): void {
    if (
      !session.reservationId
    ) {
      return;
    }

    const released =
      capitalReservationService
        .release(
          session.reservationId,
          reason,
        );

    if (
      released
    ) {
      this.addEvent(
        session,
        "CAPITAL_RELEASED",
        "Capital reservation released.",
        {
          reservationId:
            session.reservationId,
        },
      );
    }

    session.reservationId =
      null;
  }

  private releaseLock(
    session:
      LiveExecutionSession,
  ): void {
    const owner =
      this.executionLocks
        .get(
          session.lockKey,
        );

    if (
      owner ===
      session.id
    ) {
      this.executionLocks.delete(
        session.lockKey,
      );
    }
  }

  private getMutableActiveSession(
    sessionId:
      string,
  ): LiveExecutionSession {
    this.sweepExpired();

    const session =
      this.sessions.get(
        sessionId,
      );

    if (
      !session
    ) {
      throw new Error(
        "Live execution session not found.",
      );
    }

    if (
      !this.isActiveStatus(
        session.status,
      )
    ) {
      throw new Error(
        `Live execution session is already terminal: ${session.status}.`,
      );
    }

    return session;
  }

  private transition(
    session:
      LiveExecutionSession,

    status:
      LiveExecutionSession["status"],
  ): void {
    session.status =
      status;

    session.updatedAt =
      Date.now();
  }

  private addEvent(
    session:
      LiveExecutionSession,

    type:
      LiveExecutionCoordinatorEventType,

    message:
      string,

    metadata:
      Record<
        string,
        unknown
      > =
      {},
  ): void {
    const event:
      LiveExecutionCoordinatorEvent = {
      type,

      timestamp:
        Date.now(),

      message,

      metadata:
        structuredClone(
          metadata,
        ),
    };

    session.events.push(
      event,
    );

    session.updatedAt =
      event.timestamp;
  }

  private createLockKey(
    plan:
      ExecutionPlan,
  ): string {
    return [
      plan.market
        .trim()
        .toUpperCase(),

      plan.buy.exchange
        .trim()
        .toLowerCase(),

      plan.sell.exchange
        .trim()
        .toLowerCase(),
    ].join(
      "|",
    );
  }

  private resolveExpiration(
    plan:
      ExecutionPlan,

    now:
      number,
  ): number {
    if (
      plan.expiresAt !==
        undefined &&
      Number.isFinite(
        plan.expiresAt,
      )
    ) {
      return plan.expiresAt;
    }

    if (
      Number.isFinite(
        plan.timeoutMs,
      ) &&
      plan.timeoutMs >
        0
    ) {
      return (
        plan.createdAt +
        plan.timeoutMs
      );
    }

    return (
      now +
      3_000
    );
  }

  private clampReservationTtl(
    ttlMs:
      number,
  ): number {
    return Math.max(
      1_000,

      Math.min(
        5 * 60_000,
        Math.floor(
          ttlMs,
        ),
      ),
    );
  }

  private isLiveExecutionConfirmed():
    boolean {
    return (
      process.env
        .LIVE_TRADING_CONFIRMATION
        ?.trim() ===
      LIVE_EXECUTION_CONFIRMATION
    );
  }

  private isActiveStatus(
    status:
      LiveExecutionSession["status"],
  ): boolean {
    return (
      status ===
        "VALIDATING" ||
      status ===
        "RESERVED" ||
      status ===
        "READY_FOR_SUBMISSION" ||
      status ===
        "RUNNING"
    );
  }

  private cloneSession(
    session:
      LiveExecutionSession,
  ): LiveExecutionSession {
    return structuredClone(
      session,
    );
  }
}

export const liveExecutionCoordinator =
  new LiveExecutionCoordinator();
