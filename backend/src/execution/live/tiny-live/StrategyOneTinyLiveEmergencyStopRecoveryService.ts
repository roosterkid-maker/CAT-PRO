import type {
  TradingAccount,
} from "../../../trading/account/TradingAccount";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import type {
  TradingAccountEmergencyStopTransition,
} from "../../../trading/account/TradingAccountLedgerService";

import {
  strategyOneTwoLegRecoveryResolutionService,
  type StrategyOneTwoLegRecoveryResolutionRecord,
} from "../recovery/StrategyOneTwoLegRecoveryResolutionService";

import {
  strategyOneTwoLegRestartRecoveryService,
} from "../recovery/StrategyOneTwoLegRestartRecoveryService";

import {
  strategyOneTinyLiveActionAuthorityService,
  type StrategyOneTinyLiveAuthorityRecord,
} from "./StrategyOneTinyLiveActionAuthorityService";

import {
  strategyOneTinyLiveAccountModeLeaseService,
} from "./StrategyOneTinyLiveAccountModeLeaseService";

type RecoveryGate =
  ReturnType<
    typeof strategyOneTwoLegRestartRecoveryService.getReport
  >;

export interface StrategyOneTinyLiveEmergencyStopRecoveryDependencies {
  getAccount(): TradingAccount;
  getLatestEmergencyStopTransition():
    TradingAccountEmergencyStopTransition | null;
  disableEmergencyStop(): void;
  getActiveLease(): {readonly id: string} | null;
  getActionDiagnostics(now: number): {
    readonly blockingAuthorityPresent: boolean;
    readonly records: readonly StrategyOneTinyLiveAuthorityRecord[];
  };
  getRecoveryGate(now: number): RecoveryGate;
  isPairResolved(sessionId: string): boolean;
  getResolution(
    sessionId: string,
  ): StrategyOneTwoLegRecoveryResolutionRecord | null;
}

const DEFAULT_DEPENDENCIES:
  StrategyOneTinyLiveEmergencyStopRecoveryDependencies = {
  getAccount: () =>
    tradingAccountService
      .getAccount(),
  getLatestEmergencyStopTransition: () =>
    tradingAccountService
      .getLatestEmergencyStopTransition(),
  disableEmergencyStop: () =>
    tradingAccountService
      .disableEmergencyStop(),
  getActiveLease: () =>
    strategyOneTinyLiveAccountModeLeaseService
      .getDiagnostics()
      .activeLease,
  getActionDiagnostics: (
    now,
  ) =>
    strategyOneTinyLiveActionAuthorityService
      .getDiagnostics(
        now,
      ),
  getRecoveryGate: (
    now,
  ) =>
    strategyOneTwoLegRestartRecoveryService
      .getReport(
        now,
      ),
  isPairResolved: (
    sessionId,
  ) =>
    strategyOneTwoLegRecoveryResolutionService
      .isSessionResolved(
        sessionId,
      ),
  getResolution: (
    sessionId,
  ) =>
    strategyOneTwoLegRecoveryResolutionService
      .getResolution(
        sessionId,
      ),
};

/**
 * A scoped manual reset for a fail-closed Tiny-LIVE stop after the exact
 * two-leg attempt has authoritative, fingerprint-current recovery evidence.
 * It never arms, leases, authorizes, submits, cancels or moves funds.
 */
export class StrategyOneTinyLiveEmergencyStopRecoveryService {
  constructor(
    private readonly dependencies:
      StrategyOneTinyLiveEmergencyStopRecoveryDependencies =
        DEFAULT_DEPENDENCIES,
  ) {}

  getDiagnostics(
    now = Date.now(),
  ) {
    validateTime(
      now,
    );

    const account =
      this.dependencies
        .getAccount();
    const transition =
      this.dependencies
        .getLatestEmergencyStopTransition();
    const activeLease =
      this.dependencies
        .getActiveLease();
    const action =
      this.dependencies
        .getActionDiagnostics(
          now,
        );
    const recoveryGate =
      this.dependencies
        .getRecoveryGate(
          now,
        );
    const evidence =
      transition?.operation ===
        "EMERGENCY_STOP_ENABLED"
        ? this.findRecoveryEvidence(
            action.records,
            transition.timestamp,
          )
        : null;
    const blockers:
      string[] = [];

    if (
      !account.emergencyStop
    ) {
      blockers.push(
        "Emergency stop is already clear.",
      );
    }

    if (
      transition?.operation !==
        "EMERGENCY_STOP_ENABLED"
    ) {
      blockers.push(
        "No current durable emergency-stop activation record exists.",
      );
    }

    if (
      account.mode !==
        "PAPER"
    ) {
      blockers.push(
        "Trading account must already be restored to PAPER.",
      );
    }

    if (
      !account.enabled
    ) {
      blockers.push(
        "Trading account is disabled.",
      );
    }

    if (
      account.openTrades !==
        0
    ) {
      blockers.push(
        `${account.openTrades} account position(s) remain open.`,
      );
    }

    if (
      activeLease
    ) {
      blockers.push(
        `Tiny-LIVE account lease ${activeLease.id} is still active.`,
      );
    }

    if (
      action.blockingAuthorityPresent
    ) {
      blockers.push(
        "A current or unresolved Tiny-LIVE action authority still exists.",
      );
    }

    if (
      recoveryGate.classification !==
        "CLEAN" ||
      !recoveryGate.allowNewLivePreparation ||
      recoveryGate.summary
        .unresolvedSessions !==
        0 ||
      recoveryGate.summary
        .possibleExposureSessions !==
        0 ||
      recoveryGate.summary
        .persistenceIntegrityProblems !==
        0
    ) {
      blockers.push(
        "Strategy #1 two-leg restart recovery gate is not durably CLEAN.",
      );
    }

    if (
      !evidence
    ) {
      blockers.push(
        "No fingerprint-current authoritative recovery resolution post-dates this emergency-stop instance.",
      );
    }

    const eligible =
      account.emergencyStop &&
      blockers.length ===
        0;
    const requiredConfirmation =
      eligible &&
      transition
        ? requiredPhrase(
            transition.entryId,
          )
        : null;

    return freeze({
      schemaVersion:
        "201.0" as const,
      generatedAt:
        now,
      state:
        !account.emergencyStop
          ? "CLEAR" as const
          : eligible
            ? "RECOVERED_RESET_AVAILABLE" as const
            : "BLOCKED" as const,
      active:
        account.emergencyStop,
      eligible,
      requiredConfirmation,
      stop:
        transition?.operation ===
          "EMERGENCY_STOP_ENABLED"
          ? {
              entryId:
                transition.entryId,
              activatedAt:
                transition.timestamp,
            }
          : null,
      recovery:
        evidence,
      blockers,
      safety: {
        exactStopInstanceBinding:
          true,
        explicitOperatorActionRequired:
          true,
        automaticResetAllowed:
          false,
        paperModeRequired:
          true,
        zeroOpenTradesRequired:
          true,
        cleanRecoveryGateRequired:
          true,
        currentEvidenceFingerprintRequired:
          true,
        accountModeMutationPerformed:
          false,
        armMutationPerformed:
          false,
        leaseMutationPerformed:
          false,
        orderActionPerformed:
          false,
        fundMovementPerformed:
          false,
      },
    });
  }

  clear(
    confirmationValue: string,
    now = Date.now(),
  ) {
    const diagnostics =
      this.getDiagnostics(
        now,
      );

    if (
      !diagnostics.eligible ||
      diagnostics.requiredConfirmation ===
        null
    ) {
      throw new Error(
        `Recovered Tiny-LIVE emergency-stop reset is blocked: ${diagnostics.blockers.join(" | ")}`,
      );
    }

    if (
      confirmationValue.trim() !==
        diagnostics.requiredConfirmation
    ) {
      throw new Error(
        `Exact recovered emergency-stop confirmation is required: ${diagnostics.requiredConfirmation}`,
      );
    }

    this.dependencies
      .disableEmergencyStop();

    const account =
      this.dependencies
        .getAccount();

    if (
      account.emergencyStop
    ) {
      throw new Error(
        "Emergency-stop reset did not persist; the account remains stopped.",
      );
    }

    return this.getDiagnostics(
      now,
    );
  }

  private findRecoveryEvidence(
    records:
      readonly StrategyOneTinyLiveAuthorityRecord[],
    stopActivatedAt:
      number,
  ) {
    const candidates =
      [...records]
        .filter(
          (
            record,
          ) =>
            record.state ===
              "FINALIZED" &&
            record.requiresRecovery &&
            record.pairSessionId !==
              null &&
            record.previewedAt <=
              stopActivatedAt,
        )
        .sort(
          (
            first,
            second,
          ) =>
            (second.finalizedAt ?? 0) -
            (first.finalizedAt ?? 0),
        );

    for (
      const authority
      of candidates
    ) {
      const sessionId =
        authority.pairSessionId;

      if (
        !sessionId
      ) {
        continue;
      }

      let resolved =
        false;

      try {
        resolved =
          this.dependencies
            .isPairResolved(
              sessionId,
            );
      } catch {
        resolved =
          false;
      }

      if (
        !resolved
      ) {
        continue;
      }

      const resolution =
        this.dependencies
          .getResolution(
            sessionId,
          );

      if (
        !resolution ||
        resolution.resolvedAt <=
          stopActivatedAt
      ) {
        continue;
      }

      return {
        authorityId:
          authority.id,
        pairSessionId:
          sessionId,
        finalizedAt:
          authority.finalizedAt,
        resolvedAt:
          resolution.resolvedAt,
        basis:
          resolution.basis,
      };
    }

    return null;
  }
}

function requiredPhrase(
  entryId: string,
): string {
  return `CLEAR RECOVERED TINY-LIVE EMERGENCY STOP ${entryId}`;
}

function validateTime(
  value: number,
): void {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      "Tiny-LIVE emergency-stop recovery timestamp must be positive.",
    );
  }
}

function freeze<T>(
  value: T,
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

export const strategyOneTinyLiveEmergencyStopRecoveryService =
  new StrategyOneTinyLiveEmergencyStopRecoveryService();
