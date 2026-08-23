import {
  createHash,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  strategyOneTimingCalibrationService,
} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";

import {
  isExactStrategyOnePilotRoute,
} from "../../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";
import {
  STRATEGY_ONE_TINY_LIVE_BASKET_ID,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import type {
  TradingAccount,
} from "../../../trading/account/TradingAccount";

import {
  strategyOneExecutionPolicyService,
  type StrategyOnePolicyActivationGuard,
} from "../../../trading/policy/StrategyOneExecutionPolicyService";

import {
  strategyOneTinyLiveActionAuthorityService,
} from "./StrategyOneTinyLiveActionAuthorityService";

import {
  strategyOneTinyLivePreArmService,
  type StrategyOneTinyLivePreArmRecord,
} from "./StrategyOneTinyLivePreArmService";

export type StrategyOneTinyLiveAccountModeLeaseState =
  | "ACTIVATING"
  | "ACTIVE"
  | "RESTORING"
  | "RESTORED"
  | "ACTIVATION_FAILED"
  | "RESTORE_FAILED";

export interface StrategyOneTinyLiveAccountModeLeaseRecord {
  readonly schemaVersion: "151.0" | "182.1" | "183.1";
  readonly id: string;
  readonly state: StrategyOneTinyLiveAccountModeLeaseState;
  readonly preArmId: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly capitalPerLegInr: number;
  readonly maximumAttempts: 1 | 2 | 10;
  readonly priorAccountMode: "PAPER";
  readonly leasedAccountMode: "LIVE";
  readonly timingCalibrationId: string;
  readonly requiredActivationPhrase: string;
  readonly requiredRestorePhrase: string;
  readonly requestedAt: number;
  readonly activatedAt: number | null;
  readonly expiresAt: number;
  readonly completedAt: number | null;
  readonly reason: string | null;
  readonly automaticOrderAuthorityAllowed: false;
  readonly automaticTransferAllowed: false;
  readonly withdrawalAllowed: false;
  readonly routeScope?: "EXACT_ROUTE" | "PILOT_BASKET";
  readonly pilotBasketId?: typeof STRATEGY_ONE_TINY_LIVE_BASKET_ID;
}

export interface StrategyOneTinyLiveAccountModeLeaseDependencies {
  runtimeGateEnabled(): boolean;
  getPreArm(
    id: string,
    now: number,
  ): StrategyOneTinyLivePreArmRecord | null;
  getAccount(): TradingAccount;
  transitionAccountMode(
    mode: "PAPER" | "LIVE",
    leaseId: string,
  ): TradingAccount;
  enableEmergencyStop(): void;
  getActivationGuard(): StrategyOnePolicyActivationGuard;
  getActionDiagnostics(now: number): {
    readonly attemptsToday: number;
    readonly blockingAuthorityPresent: boolean;
  };
  getCalibration(input: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
    readonly now: number;
  }): {
    readonly id: string;
    readonly expiresAt: number;
  } | null;
  now(): number;
}

export interface StrategyOneTinyLiveAccountModeLeaseServiceOptions {
  readonly persistenceFilePath?: string;
  readonly dependencies?: Partial<StrategyOneTinyLiveAccountModeLeaseDependencies>;
  readonly reconciliationIntervalMs?: number;
}

const DEFAULT_FILE =
  resolve(
    process.cwd(),
    "logs",
    "live",
    "strategy-one-tiny-live-account-mode-leases.jsonl",
  );

const DEFAULT_RECONCILIATION_INTERVAL_MS =
  250;

const MINIMUM_REMAINING_LEASE_MS =
  30_000;

const ACTIVE_STATES:
  readonly StrategyOneTinyLiveAccountModeLeaseState[] = [
    "ACTIVATING",
    "ACTIVE",
    "RESTORING",
    "RESTORE_FAILED",
  ];

const DEFAULT_DEPENDENCIES:
  StrategyOneTinyLiveAccountModeLeaseDependencies = {
  runtimeGateEnabled: () =>
    process.env.TRADING_MODE?.trim().toLowerCase() ===
      "live" &&
    process.env.TRADING_EXECUTION_MODE?.trim().toLowerCase() ===
      "live" &&
    process.env.LIVE_TRADING_ENABLED?.trim().toLowerCase() ===
      "true" &&
    process.env.ARBITRAGE_LIVE_CONFIRMATION?.trim() ===
      "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION" &&
    process.env.STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION?.trim() ===
      "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME",
  getPreArm: (
    id,
    now,
  ) =>
    strategyOneTinyLivePreArmService
      .getRecord(
        id,
        now,
      ),
  getAccount: () =>
    tradingAccountService
      .getAccount(),
  transitionAccountMode: (
    mode,
    leaseId,
  ) =>
    tradingAccountService
      .transitionModeForTinyLiveLease(
        mode,
        leaseId,
      ),
  enableEmergencyStop: () =>
    tradingAccountService
      .enableEmergencyStop(),
  getActivationGuard: () =>
    strategyOneExecutionPolicyService
      .getActivationGuard(),
  getActionDiagnostics: (
    now,
  ) =>
    strategyOneTinyLiveActionAuthorityService
      .getDiagnostics(
        now,
      ),
  getCalibration: (
    input,
  ) => {
    const calibration =
      strategyOneTimingCalibrationService
      .getApprovedRouteCalibration(
        input,
      );

    return calibration?.expiresAt ===
      null ||
      !calibration
      ? null
      : {
          id:
            calibration.id,
          expiresAt:
            calibration.expiresAt,
        };
  },
  now:
    Date.now,
};

/**
 * Journal-first, route-bound lease for the one account-mode prerequisite that
 * an arm deliberately cannot change. The lease grants no order authority; the
 * existing pre-arm, three-second authority and sole coordinator remain the
 * only order path.
 */
export class StrategyOneTinyLiveAccountModeLeaseService {
  private readonly dependencies:
    StrategyOneTinyLiveAccountModeLeaseDependencies;

  private readonly store:
    JsonlSnapshotStore<StrategyOneTinyLiveAccountModeLeaseRecord>;

  private readonly latest =
    new Map<
      string,
      StrategyOneTinyLiveAccountModeLeaseRecord
    >();

  private readonly reconciliationIntervalMs:
    number;

  private activeLeaseId:
    string | null =
      null;

  private timer:
    NodeJS.Timeout | null =
      null;

  private lastReconciliationError:
    string | null =
      null;

  constructor(
    options:
      StrategyOneTinyLiveAccountModeLeaseServiceOptions = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...options.dependencies,
    };

    this.reconciliationIntervalMs =
      options.reconciliationIntervalMs ??
      DEFAULT_RECONCILIATION_INTERVAL_MS;

    if (
      !Number.isSafeInteger(
        this.reconciliationIntervalMs,
      ) ||
      this.reconciliationIntervalMs <
        100 ||
      this.reconciliationIntervalMs >
        5_000
    ) {
      throw new Error(
        "Tiny-LIVE account lease reconciliation interval must be 100-5000 ms.",
      );
    }

    this.store =
      new JsonlSnapshotStore({
        filePath:
          options.persistenceFilePath ??
          DEFAULT_FILE,
        isPayload:
          isLeaseRecord,
      });

    for (
      const record
      of this.store
        .readAll()
    ) {
      const previous =
        this.latest
          .get(
            record.id,
          ) ??
        null;

      if (
        !isValidTransition(
          previous,
          record,
        )
      ) {
        throw new Error(
          `Tiny-LIVE account-mode lease journal has an invalid transition for ${record.id}.`,
        );
      }

      this.latest
        .set(
          record.id,
          freeze(
            clone(
              record,
            ),
          ),
        );
    }

    const active =
      [...this.latest.values()]
        .filter(
          (
            record,
          ) =>
            ACTIVE_STATES
              .includes(
                record.state,
              ),
        );

    if (
      active.length >
        1
    ) {
      throw new Error(
        "Multiple bounded Tiny-LIVE account-mode leases are active.",
      );
    }

    this.activeLeaseId =
      active[0]?.id ??
      null;
  }

  activate(
    preArmIdValue:
      string,
    confirmationValue:
      string,
    now =
      this.dependencies
        .now(),
  ): StrategyOneTinyLiveAccountModeLeaseRecord {
    validateTime(
      now,
    );
    this.reconcile(
      now,
    );

    if (
      this.activeLeaseId !==
        null
    ) {
      throw new Error(
        "Another bounded Tiny-LIVE account-mode lease is already active.",
      );
    }

    if (
      !this.dependencies
        .runtimeGateEnabled()
    ) {
      throw new Error(
        "Tiny-LIVE runtime gates are not explicitly enabled.",
      );
    }

    const preArmId =
      preArmIdValue
        .trim();

    const arm =
      this.dependencies
        .getPreArm(
          preArmId,
          now,
        );

    if (
      !arm ||
      arm.state !==
        "ARMED"
    ) {
      throw new Error(
        "A current ARMED Strategy #1 Tiny-LIVE record is required.",
      );
    }

    if (
      getAttemptsUsed(
        arm,
      ) !==
        0
    ) {
      throw new Error(
        "Account-mode lease activation is restricted to a zero-attempt arm.",
      );
    }

    const requiredActivationPhrase =
      StrategyOneTinyLiveAccountModeLeaseService
        .requiredActivationPhrase(
          arm.id,
        );

    if (
      confirmationValue.trim() !==
        requiredActivationPhrase
    ) {
      throw new Error(
        `Exact account-mode activation confirmation is required: ${requiredActivationPhrase}`,
      );
    }

    const account =
      this.dependencies
        .getAccount();

    validateActivationAccount(
      account,
    );

    const guard =
      this.dependencies
        .getActivationGuard();

    const guardBlockers =
      nonBotGuardBlockers(
        guard,
      );

    if (
      guardBlockers.length >
        0
    ) {
      throw new Error(
        `Tiny-LIVE account-mode activation guard is blocked: ${guardBlockers.join(" | ")}`,
      );
    }

    const action =
      this.dependencies
        .getActionDiagnostics(
          now,
        );

    if (
      action.blockingAuthorityPresent
    ) {
      throw new Error(
        "A current or unresolved Tiny-LIVE action authority blocks account-mode activation.",
      );
    }

    const basketArm = arm.routeScope === "PILOT_BASKET" &&
      arm.pilotBasketId === STRATEGY_ONE_TINY_LIVE_BASKET_ID;
    const calibration = basketArm
      ? null
      : this.dependencies
          .getCalibration({
            market: arm.market,
            buyExchange: arm.buyExchange,
            sellExchange: arm.sellExchange,
            now,
          });

    if (
      !basketArm &&
      !calibration
    ) {
      throw new Error(
        "A current approved timing calibration is required for this exact arm.",
      );
    }

    const expiresAt = basketArm
      ? arm.expiresAt
      : Math.min(arm.expiresAt, calibration?.expiresAt ?? 0);

    if (
      expiresAt -
        now <
      MINIMUM_REMAINING_LEASE_MS
    ) {
      throw new Error(
        "Less than 30 seconds remain in the bounded arm/timing window.",
      );
    }

    const id =
      `tiny-live-account-lease-${hash({
        preArmId:
          arm.id,
        timingCalibrationId:
          basketArm ? `PER_ATTEMPT:${STRATEGY_ONE_TINY_LIVE_BASKET_ID}` : calibration?.id,
        requestedAt:
          now,
        expiresAt,
      }).slice(0, 32)}`;

    const requiredRestorePhrase =
      `RESTORE PAPER ACCOUNT MODE ${id}`;

    const activating =
      freeze({
        schemaVersion:
          basketArm
            ? "183.1" as const
            : arm.maximumAttempts === 10
            ? "182.1" as const
            : "151.0" as const,
        id,
        state:
          "ACTIVATING" as const,
        preArmId:
          arm.id,
        market:
          arm.market,
        buyExchange:
          arm.buyExchange,
        sellExchange:
          arm.sellExchange,
        capitalPerLegInr:
          arm.capitalPerLegInr,
        maximumAttempts:
          arm.maximumAttempts,
        priorAccountMode:
          "PAPER" as const,
        leasedAccountMode:
          "LIVE" as const,
        timingCalibrationId:
          basketArm ? `PER_ATTEMPT:${STRATEGY_ONE_TINY_LIVE_BASKET_ID}` : calibration?.id ?? "",
        requiredActivationPhrase,
        requiredRestorePhrase,
        requestedAt:
          now,
        activatedAt:
          null,
        expiresAt,
        completedAt:
          null,
        reason:
          null,
        automaticOrderAuthorityAllowed:
          false as const,
        automaticTransferAllowed:
          false as const,
        withdrawalAllowed:
          false as const,
        routeScope:
          arm.routeScope ?? "EXACT_ROUTE" as const,
        pilotBasketId:
          arm.pilotBasketId,
      });

    this.persist(
      activating,
    );

    try {
      this.dependencies
        .transitionAccountMode(
          "LIVE",
          id,
        );

      const active =
        freeze({
          ...clone(
            activating,
          ),
          state:
            "ACTIVE" as const,
          activatedAt:
            now,
        });

      this.persist(
        active,
      );

      return clone(
        active,
      );
    } catch (
      error:
        unknown
    ) {
      const originalReason =
        message(
          error,
        );

      let rollbackReason:
        string | null =
          null;

      try {
        if (
          this.dependencies
            .getAccount()
            .mode ===
          "LIVE"
        ) {
          this.dependencies
            .transitionAccountMode(
              "PAPER",
              id,
            );
        }
      } catch (
        rollbackError:
          unknown
      ) {
        rollbackReason =
          message(
            rollbackError,
          );
        this.failClosedWithEmergencyStop();
      }

      const failed =
        freeze({
          ...clone(
            activating,
          ),
          state:
            "ACTIVATION_FAILED" as const,
          completedAt:
            this.dependencies
              .now(),
          reason:
            rollbackReason
              ? `${originalReason} | PAPER rollback failed: ${rollbackReason}`
              : originalReason,
        });

      try {
        this.persist(
          failed,
        );
      } catch {
        this.failClosedWithEmergencyStop();
      }

      throw new Error(
        `Tiny-LIVE account-mode activation failed safely: ${failed.reason}`,
      );
    }
  }

  restore(
    leaseIdValue:
      string,
    confirmationValue:
      string,
    now =
      this.dependencies
        .now(),
  ): StrategyOneTinyLiveAccountModeLeaseRecord {
    validateTime(
      now,
    );

    const lease =
      this.requireActive(
        leaseIdValue,
      );

    if (
      confirmationValue.trim() !==
        lease.requiredRestorePhrase
    ) {
      throw new Error(
        `Exact PAPER restore confirmation is required: ${lease.requiredRestorePhrase}`,
      );
    }

    const arm =
      this.dependencies
        .getPreArm(
          lease.preArmId,
          now,
        );

    if (
      arm?.state ===
        "CLAIMED"
    ) {
      throw new Error(
        "PAPER restore is blocked while the exact Tiny-LIVE attempt is CLAIMED/in-flight.",
      );
    }

    return this.restoreOwnedLease(
      lease,
      "Operator explicitly restored PAPER account mode.",
      now,
    );
  }

  reconcile(
    now =
      this.dependencies
        .now(),
  ): StrategyOneTinyLiveAccountModeLeaseRecord | null {
    validateTime(
      now,
    );

    const lease =
      this.getActiveLease();

    if (
      !lease
    ) {
      return null;
    }

    const arm =
      this.dependencies
        .getPreArm(
          lease.preArmId,
          now,
        );

    if (
      arm?.state ===
        "CLAIMED"
    ) {
      if (
        this.dependencies
          .getAccount()
          .mode !==
        "LIVE"
      ) {
        this.lastReconciliationError =
          "Claimed Tiny-LIVE attempt no longer has its leased LIVE account mode.";
        this.failClosedWithEmergencyStop();
      }

      return lease;
    }

    if (
      lease.state ===
        "RESTORING" ||
      lease.state ===
        "RESTORE_FAILED"
    ) {
      return this.restoreOwnedLease(
        lease,
        lease.reason ??
          "Retrying bounded PAPER account-mode restoration.",
        now,
      );
    }

    const shouldRemainActive =
      arm?.state ===
        "ARMED" &&
      now <
        lease.expiresAt &&
      this.dependencies
        .runtimeGateEnabled();

    if (
      !shouldRemainActive
    ) {
      return this.restoreOwnedLease(
        lease,
        restorationReason(
          arm,
          lease,
          now,
          this.dependencies
            .runtimeGateEnabled(),
        ),
        now,
      );
    }

    const account =
      this.dependencies
        .getAccount();

    if (
      lease.state ===
        "ACTIVATING"
    ) {
      if (
        account.mode ===
          "PAPER"
      ) {
        this.dependencies
          .transitionAccountMode(
            "LIVE",
            lease.id,
          );
      } else if (
        account.mode !==
          "LIVE"
      ) {
        throw new Error(
          `Tiny-LIVE account lease cannot recover from ${account.mode} mode.`,
        );
      }

      const active =
        freeze({
          ...clone(
            lease,
          ),
          state:
            "ACTIVE" as const,
          activatedAt:
            lease.activatedAt ??
            now,
          reason:
            null,
        });

      this.persist(
        active,
      );

      this.lastReconciliationError =
        null;

      return clone(
        active,
      );
    }

    if (
      account.mode !==
        "LIVE"
    ) {
      return this.restoreOwnedLease(
        lease,
        `Lease found account mode ${account.mode}; CAT PRO did not silently re-enable LIVE.`,
        now,
      );
    }

    this.lastReconciliationError =
      null;

    return lease;
  }

  start(): void {
    if (
      this.timer
    ) {
      return;
    }

    this.reconcileSafely();

    this.timer =
      setInterval(
        () => {
          this.reconcileSafely();
        },
        this.reconciliationIntervalMs,
      );

    this.timer
      .unref?.();
  }

  stop(
    restorePaper =
      false,
  ): void {
    if (
      this.timer
    ) {
      clearInterval(
        this.timer,
      );
      this.timer =
        null;
    }

    if (
      !restorePaper
    ) {
      return;
    }

    const lease =
      this.getActiveLease();

    if (
      !lease
    ) {
      return;
    }

    const now =
      this.dependencies
        .now();

    const arm =
      this.dependencies
        .getPreArm(
          lease.preArmId,
          now,
        );

    if (
      arm?.state ===
        "CLAIMED"
    ) {
      return;
    }

    try {
      this.restoreOwnedLease(
        lease,
        "Backend shutdown restored PAPER account mode fail-safe.",
        now,
      );
    } catch (
      error:
        unknown
    ) {
      this.lastReconciliationError =
        message(
          error,
        );
    }
  }

  getDiagnostics(
    now =
      this.dependencies
        .now(),
  ) {
    validateTime(
      now,
    );

    const activeLease =
      this.getActiveLease();

    return freeze({
      schemaVersion:
        "151.0" as const,
      generatedAt:
        now,
      accountMode:
        this.dependencies
          .getAccount()
          .mode,
      activeLease,
      activeArmState:
        activeLease
          ? this.dependencies
              .getPreArm(
                activeLease.preArmId,
                now,
              )
              ?.state ??
            null
          : null,
      lastReconciliationError:
        this.lastReconciliationError,
      records:
        [...this.latest.values()]
          .sort(
            (
              first,
              second,
            ) =>
              second.requestedAt -
              first.requestedAt,
          )
          .slice(
            0,
            20,
          )
          .map(
            clone,
          ),
      persistence:
        this.store
          .getDiagnostics(),
      safety: {
        exactPreArmBinding:
          true,
        exactConfirmationRequired:
          true,
        journalBeforeModeMutation:
          true,
        automaticPaperRestore:
          true,
        claimedAttemptModeFlipAllowed:
          false,
        automaticOrderAuthorityAllowed:
          false,
        automaticTransferAllowed:
          false,
        withdrawalAllowed:
          false,
      },
    });
  }

  static requiredActivationPhrase(
    preArmIdValue:
      string,
  ): string {
    const preArmId =
      preArmIdValue
        .trim();

    if (
      !/^tiny-live-prearm-[a-f0-9]{32}$/u.test(
        preArmId,
      )
    ) {
      throw new Error(
        "A valid Tiny-LIVE pre-arm ID is required for account-mode activation.",
      );
    }

    return `ACTIVATE TINY-LIVE ACCOUNT LEASE ${preArmId}`;
  }

  private restoreOwnedLease(
    lease:
      StrategyOneTinyLiveAccountModeLeaseRecord,
    reason:
      string,
    now:
      number,
  ): StrategyOneTinyLiveAccountModeLeaseRecord {
    const arm =
      this.dependencies
        .getPreArm(
          lease.preArmId,
          now,
        );

    if (
      arm?.state ===
        "CLAIMED"
    ) {
      return lease;
    }

    const restoring =
      lease.state ===
        "RESTORING"
        ? lease
        : freeze({
            ...clone(
              lease,
            ),
            state:
              "RESTORING" as const,
            reason,
          });

    try {
      if (
        restoring !==
          lease
      ) {
        this.persist(
          restoring,
        );
      }

      const account =
        this.dependencies
          .getAccount();

      if (
        account.mode ===
          "LIVE"
      ) {
        this.dependencies
          .transitionAccountMode(
            "PAPER",
            lease.id,
          );
      } else if (
        account.mode !==
          "PAPER"
      ) {
        throw new Error(
          `Bounded PAPER restore cannot transition account mode ${account.mode}.`,
        );
      }

      const restored =
        freeze({
          ...clone(
            restoring,
          ),
          state:
            "RESTORED" as const,
          completedAt:
            now,
          reason,
        });

      this.persist(
        restored,
      );

      this.lastReconciliationError =
        null;

      return clone(
        restored,
      );
    } catch (
      error:
        unknown
    ) {
      const failureReason =
        `PAPER account-mode restore failed: ${message(error)}`;

      this.lastReconciliationError =
        failureReason;
      this.failClosedWithEmergencyStop();

      const failed =
        freeze({
          ...clone(
            restoring,
          ),
          state:
            "RESTORE_FAILED" as const,
          reason:
            failureReason,
        });

      try {
        this.persist(
          failed,
        );
      } catch {
        // The account emergency stop is the final fail-closed boundary when
        // even the dedicated lease journal cannot accept another record.
      }

      throw new Error(
        failureReason,
      );
    }
  }

  private requireActive(
    idValue:
      string,
  ): StrategyOneTinyLiveAccountModeLeaseRecord {
    const lease =
      this.latest
        .get(
          idValue
            .trim(),
        );

    if (
      !lease ||
      !ACTIVE_STATES
        .includes(
          lease.state,
        )
    ) {
      throw new Error(
        "A current bounded Tiny-LIVE account-mode lease is required.",
      );
    }

    return lease;
  }

  private getActiveLease():
  StrategyOneTinyLiveAccountModeLeaseRecord | null {
    if (
      this.activeLeaseId ===
        null
    ) {
      return null;
    }

    const lease =
      this.latest
        .get(
          this.activeLeaseId,
        );

    return lease &&
      ACTIVE_STATES
        .includes(
          lease.state,
        )
      ? clone(
          lease,
        )
      : null;
  }

  private persist(
    record:
      StrategyOneTinyLiveAccountModeLeaseRecord,
  ): void {
    const previous =
      this.latest
        .get(
          record.id,
        ) ??
      null;

    if (
      !isValidTransition(
        previous,
        record,
      )
    ) {
      throw new Error(
        `Invalid Tiny-LIVE account-mode lease transition ${previous?.state ?? "NONE"} -> ${record.state}.`,
      );
    }

    this.store
      .append(
        record,
      );
    this.latest
      .set(
        record.id,
        freeze(
          clone(
            record,
          ),
        ),
      );
    this.activeLeaseId =
      ACTIVE_STATES
        .includes(
          record.state,
        )
        ? record.id
        : this.activeLeaseId ===
            record.id
          ? null
          : this.activeLeaseId;
  }

  private reconcileSafely(): void {
    try {
      this.reconcile();
    } catch (
      error:
        unknown
    ) {
      this.lastReconciliationError =
        message(
          error,
        );
      console.error(
        "[Tiny-LIVE Account Lease] Reconciliation failed closed:",
        this.lastReconciliationError,
      );
    }
  }

  private failClosedWithEmergencyStop(): void {
    try {
      this.dependencies
        .enableEmergencyStop();
    } catch (
      error:
        unknown
    ) {
      console.error(
        "[Tiny-LIVE Account Lease] Emergency-stop persistence failed:",
        message(
          error,
        ),
      );
    }
  }
}

function validateActivationAccount(
  account:
    TradingAccount,
): void {
  const blockers:
    string[] = [];

  if (
    account.mode !==
      "PAPER"
  ) {
    blockers.push(
      `account mode is ${account.mode}`,
    );
  }

  if (
    !account.enabled
  ) {
    blockers.push(
      "account is disabled",
    );
  }

  if (
    account.emergencyStop
  ) {
    blockers.push(
      "emergency stop is active",
    );
  }

  if (
    account.openTrades !==
      0
  ) {
    blockers.push(
      `${account.openTrades} account position(s) are open`,
    );
  }

  if (
    blockers.length >
      0
  ) {
    throw new Error(
      `Tiny-LIVE account-mode activation is blocked: ${blockers.join(" | ")}.`,
    );
  }
}

function nonBotGuardBlockers(
  guard:
    StrategyOnePolicyActivationGuard,
): string[] {
  const blockers:
    string[] = [];

  if (
    guard.accountOpenTrades >
      0
  ) {
    blockers.push(
      `${guard.accountOpenTrades} trading-account position(s) remain open.`,
    );
  }

  if (
    guard.activeExecutionSessions >
      0 ||
    guard.activeExecutionLocks >
      0
  ) {
    blockers.push(
      "Execution sessions or route locks are active.",
    );
  }

  if (
    guard.nonTerminalOrders >
      0
  ) {
    blockers.push(
      `${guard.nonTerminalOrders} order lifecycle record(s) are non-terminal.`,
    );
  }

  if (
    guard.unresolvedRecoveryIncidents >
      0
  ) {
    blockers.push(
      `${guard.unresolvedRecoveryIncidents} recovery incident(s) remain unresolved.`,
    );
  }

  return blockers;
}

function restorationReason(
  arm:
    StrategyOneTinyLivePreArmRecord | null,
  lease:
    StrategyOneTinyLiveAccountModeLeaseRecord,
  now:
    number,
  runtimeGateEnabled:
    boolean,
): string {
  if (
    !runtimeGateEnabled
  ) {
    return "Tiny-LIVE runtime gate disabled; PAPER account mode restored.";
  }

  if (
    now >=
      lease.expiresAt
  ) {
    return "Bounded arm/timing lease expired; PAPER account mode restored.";
  }

  return arm
    ? `Pre-arm became ${arm.state}; PAPER account mode restored.`
    : "Bound pre-arm is unavailable; PAPER account mode restored.";
}

function getAttemptsUsed(
  record:
    StrategyOneTinyLivePreArmRecord,
): number {
  return record.attemptsUsed ??
    record.attempts?.length ??
    0;
}

function isLeaseRecord(
  value:
    unknown,
): value is StrategyOneTinyLiveAccountModeLeaseRecord {
  if (
    typeof value !==
      "object" ||
    value ===
      null
  ) {
    return false;
  }

  const item =
    value as Partial<StrategyOneTinyLiveAccountModeLeaseRecord>;

  const states:
    readonly StrategyOneTinyLiveAccountModeLeaseState[] = [
      "ACTIVATING",
      "ACTIVE",
      "RESTORING",
      "RESTORED",
      "ACTIVATION_FAILED",
      "RESTORE_FAILED",
    ];

  const legacy = item.schemaVersion === "151.0";
  const tenAttempt = item.schemaVersion === "182.1";
  const basket = item.schemaVersion === "183.1";
  const exactRouteRecord = item.routeScope !== "PILOT_BASKET" &&
    typeof item.market === "string" && item.market.endsWith("USDT") &&
    typeof item.buyExchange === "string" &&
    typeof item.sellExchange === "string" &&
    isExactStrategyOnePilotRoute({
      market: item.market,
      buyExchange: item.buyExchange,
      sellExchange: item.sellExchange,
    });
  const basketRecord = basket &&
    item.routeScope === "PILOT_BASKET" &&
    item.pilotBasketId === STRATEGY_ONE_TINY_LIVE_BASKET_ID &&
    item.market === "PILOT_BASKET" &&
    item.buyExchange === "coindcx" &&
    item.sellExchange === "binance" &&
    item.timingCalibrationId === `PER_ATTEMPT:${STRATEGY_ONE_TINY_LIVE_BASKET_ID}`;

  return (legacy || tenAttempt || basket) &&
    typeof item.id ===
      "string" &&
    /^tiny-live-account-lease-[a-f0-9]{32}$/u.test(
      item.id,
    ) &&
    states.includes(
      item.state as StrategyOneTinyLiveAccountModeLeaseState,
    ) &&
    typeof item.preArmId ===
      "string" &&
    /^tiny-live-prearm-[a-f0-9]{32}$/u.test(
      item.preArmId,
    ) &&
    (exactRouteRecord || basketRecord) &&
    item.buyExchange !== item.sellExchange &&
    Number.isSafeInteger(
      item.capitalPerLegInr,
    ) &&
    (item.capitalPerLegInr ?? 0) >=
      100 &&
    (item.capitalPerLegInr ?? 0) <=
      500 &&
    (legacy
      ? item.maximumAttempts === 1 || item.maximumAttempts === 2
      : item.maximumAttempts === 10) &&
    item.priorAccountMode ===
      "PAPER" &&
    item.leasedAccountMode ===
      "LIVE" &&
    typeof item.timingCalibrationId ===
      "string" &&
    typeof item.requiredActivationPhrase ===
      "string" &&
    item.requiredActivationPhrase ===
      `ACTIVATE TINY-LIVE ACCOUNT LEASE ${item.preArmId}` &&
    typeof item.requiredRestorePhrase ===
      "string" &&
    item.requiredRestorePhrase ===
      `RESTORE PAPER ACCOUNT MODE ${item.id}` &&
    isPositiveTime(
      item.requestedAt,
    ) &&
    (item.activatedAt ===
      null ||
      isPositiveTime(
        item.activatedAt,
      )) &&
    isPositiveTime(
      item.expiresAt,
    ) &&
    (item.expiresAt ?? 0) >
      (item.requestedAt ?? 0) &&
    (item.completedAt ===
      null ||
      isPositiveTime(
        item.completedAt,
      )) &&
    (item.reason ===
      null ||
      typeof item.reason ===
        "string") &&
    item.automaticOrderAuthorityAllowed ===
      false &&
    item.automaticTransferAllowed ===
      false &&
    item.withdrawalAllowed ===
      false;
}

function isValidTransition(
  previous:
    StrategyOneTinyLiveAccountModeLeaseRecord | null,
  next:
    StrategyOneTinyLiveAccountModeLeaseRecord,
): boolean {
  if (
    !previous
  ) {
    return next.state ===
      "ACTIVATING";
  }

  const immutableMatch =
    previous.id ===
      next.id &&
    previous.schemaVersion ===
      next.schemaVersion &&
    previous.preArmId ===
      next.preArmId &&
    previous.market ===
      next.market &&
    previous.buyExchange ===
      next.buyExchange &&
    previous.sellExchange ===
      next.sellExchange &&
    previous.capitalPerLegInr ===
      next.capitalPerLegInr &&
    previous.maximumAttempts ===
      next.maximumAttempts &&
    previous.routeScope ===
      next.routeScope &&
    previous.pilotBasketId ===
      next.pilotBasketId &&
    previous.priorAccountMode ===
      next.priorAccountMode &&
    previous.leasedAccountMode ===
      next.leasedAccountMode &&
    previous.timingCalibrationId ===
      next.timingCalibrationId &&
    previous.requiredActivationPhrase ===
      next.requiredActivationPhrase &&
    previous.requiredRestorePhrase ===
      next.requiredRestorePhrase &&
    previous.requestedAt ===
      next.requestedAt &&
    previous.expiresAt ===
      next.expiresAt;

  if (
    !immutableMatch
  ) {
    return false;
  }

  const allowed:
    Readonly<Record<
      StrategyOneTinyLiveAccountModeLeaseState,
      readonly StrategyOneTinyLiveAccountModeLeaseState[]
    >> = {
    ACTIVATING: [
      "ACTIVE",
      "ACTIVATION_FAILED",
      "RESTORING",
      "RESTORE_FAILED",
    ],
    ACTIVE: [
      "RESTORING",
      "RESTORE_FAILED",
    ],
    RESTORING: [
      "RESTORED",
      "RESTORE_FAILED",
    ],
    RESTORE_FAILED: [
      "RESTORING",
      "RESTORE_FAILED",
    ],
    RESTORED:
      [],
    ACTIVATION_FAILED:
      [],
  };

  return allowed[
    previous.state
  ].includes(
    next.state,
  );
}

function hash(
  value:
    unknown,
): string {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        value,
      ),
    )
    .digest(
      "hex",
    );
}

function validateTime(
  value:
    number,
): void {
  if (
    !isPositiveTime(
      value,
    )
  ) {
    throw new Error(
      "Tiny-LIVE account-mode lease timestamp must be a positive integer.",
    );
  }
}

function isPositiveTime(
  value:
    unknown,
): value is number {
  return typeof value ===
      "number" &&
    Number.isSafeInteger(
      value,
    ) &&
    value >
      0;
}

function message(
  error:
    unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Unknown Tiny-LIVE account-mode lease failure.";
}

function clone<T>(
  value:
    T,
): T {
  return structuredClone(
    value,
  );
}

function freeze<T>(
  value:
    T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const child
    of Object.values(
      value,
    )
  ) {
    freeze(
      child,
    );
  }

  return Object.freeze(
    value,
  );
}

export const strategyOneTinyLiveAccountModeLeaseService =
  new StrategyOneTinyLiveAccountModeLeaseService();
