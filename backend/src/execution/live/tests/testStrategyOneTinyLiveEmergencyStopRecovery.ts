import assert from "node:assert/strict";

import {
  defaultTradingAccount,
  type TradingAccount,
} from "../../../trading/account/TradingAccount";

import type {
  TradingAccountEmergencyStopTransition,
} from "../../../trading/account/TradingAccountLedgerService";

import type {
  StrategyOneTwoLegRecoveryResolutionRecord,
} from "../recovery/StrategyOneTwoLegRecoveryResolutionService";

import type {
  StrategyOneTinyLiveAuthorityRecord,
} from "../tiny-live/StrategyOneTinyLiveActionAuthorityService";

import {
  StrategyOneTinyLiveEmergencyStopRecoveryService,
  type StrategyOneTinyLiveEmergencyStopRecoveryDependencies,
} from "../tiny-live/StrategyOneTinyLiveEmergencyStopRecoveryService";

const NOW =
  Date.UTC(
    2026,
    7,
    26,
    1,
    0,
    0,
  );

const STOP_AT =
  NOW -
  60_000;

function main(): void {
  let account:
    TradingAccount = {
    ...structuredClone(
      defaultTradingAccount,
    ),
    emergencyStop:
      true,
  };
  let pairResolved =
    true;
  let activeLease:
    {readonly id: string} | null =
      null;
  let blockingAuthority =
    false;
  let disableCalls =
    0;
  const transition:
    TradingAccountEmergencyStopTransition = {
    entryId:
      "stop-entry-1",
    timestamp:
      STOP_AT,
    operation:
      "EMERGENCY_STOP_ENABLED",
  };
  const authority =
    authorityFixture();
  const resolution =
    resolutionFixture();
  const dependencies:
    StrategyOneTinyLiveEmergencyStopRecoveryDependencies = {
    getAccount: () =>
      structuredClone(
        account,
      ),
    getLatestEmergencyStopTransition: () =>
      transition,
    disableEmergencyStop: () => {
      disableCalls +=
        1;
      account = {
        ...account,
        emergencyStop:
          false,
      };
    },
    getActiveLease: () =>
      activeLease,
    getActionDiagnostics: () => ({
      blockingAuthorityPresent:
        blockingAuthority,
      records: [
        authority,
      ],
    }),
    getRecoveryGate: (
      now,
    ) => ({
      schemaVersion:
        "109.0",
      generatedAt:
        now,
      classification:
        "CLEAN",
      allowNewLivePreparation:
        true,
      unresolved: [],
      summary: {
        unresolvedSessions:
          0,
        possibleExposureSessions:
          0,
        persistenceIntegrityProblems:
          0,
      },
      persistenceProblems: [],
      safety: {
        failClosed:
          true,
        automaticRetryAllowed:
          false,
        automaticCancelAllowed:
          false,
        automaticHedgeAllowed:
          false,
        automaticUnwindAllowed:
          false,
        explicitEvidenceBoundResolutionRequired:
          true,
      },
    }),
    isPairResolved: (
      sessionId,
    ) =>
      pairResolved &&
      sessionId ===
        authority.pairSessionId,
    getResolution: (
      sessionId,
    ) =>
      sessionId ===
        resolution.sessionId
        ? resolution
        : null,
  };
  const service =
    new StrategyOneTinyLiveEmergencyStopRecoveryService(
      dependencies,
    );
  const ready =
    service.getDiagnostics(
      NOW,
    );

  assert.equal(
    ready.state,
    "RECOVERED_RESET_AVAILABLE",
  );
  assert.equal(
    ready.eligible,
    true,
  );
  assert.equal(
    ready.recovery
      ?.pairSessionId,
    authority.pairSessionId,
  );
  assert.match(
    ready.requiredConfirmation ??
      "",
    /stop-entry-1$/u,
  );
  assert.throws(
    () =>
      service.clear(
        "CLEAR EMERGENCY STOP",
        NOW,
      ),
    /Exact recovered emergency-stop confirmation/iu,
  );
  assert.equal(
    disableCalls,
    0,
  );

  pairResolved =
    false;
  const invalidated =
    service.getDiagnostics(
      NOW +
        1,
    );
  assert.equal(
    invalidated.eligible,
    false,
    "Invalidated recovery fingerprints must immediately block reset.",
  );
  assert.match(
    invalidated.blockers.join(
      " ",
    ),
    /fingerprint-current/iu,
  );

  pairResolved =
    true;
  blockingAuthority =
    true;
  assert.equal(
    service.getDiagnostics(
      NOW +
        2,
    ).eligible,
    false,
    "A current action authority must keep the stop latched.",
  );

  blockingAuthority =
    false;
  activeLease = {
    id:
      "tiny-live-account-lease-active",
  };
  assert.equal(
    service.getDiagnostics(
      NOW +
        3,
    ).eligible,
    false,
    "An active account lease must keep the stop latched.",
  );

  activeLease =
    null;
  account = {
    ...account,
    openTrades:
      1,
  };
  assert.equal(
    service.getDiagnostics(
      NOW +
        4,
    ).eligible,
    false,
    "Open account positions must keep the stop latched.",
  );

  account = {
    ...account,
    openTrades:
      0,
  };
  const confirmation =
    service.getDiagnostics(
      NOW +
        5,
    ).requiredConfirmation;
  assert.ok(
    confirmation,
  );
  const cleared =
    service.clear(
      confirmation,
      NOW +
        6,
    );

  assert.equal(
    disableCalls,
    1,
  );
  assert.equal(
    account.emergencyStop,
    false,
  );
  assert.equal(
    cleared.state,
    "CLEAR",
  );
  assert.equal(
    cleared.safety
      .accountModeMutationPerformed,
    false,
  );
  assert.equal(
    cleared.safety
      .orderActionPerformed,
    false,
  );

  console.log(
    "STRATEGY ONE TINY-LIVE EMERGENCY-STOP RECOVERY TEST PASSED.",
  );
}

function authorityFixture():
  StrategyOneTinyLiveAuthorityRecord {
  return {
    schemaVersion:
      "191.0",
    id:
      "tiny-live-authority-recovered",
    state:
      "FINALIZED",
    opportunityId:
      "opportunity-recovered",
    market:
      "SANDUSDT",
    buyExchange:
      "bybit",
    sellExchange:
      "coindcx",
    capitalPerLegInr:
      500,
    maximumCapitalPerLegInr:
      1_000,
    maximumBuyQuoteSpend:
      5.05,
    maximumOrderBookAgeMs:
      250,
    exactQuantity:
      123,
    preflightHash:
      "preflight-hash",
    calibrationId:
      "calibration-id",
    calibrationScope:
      "DYNAMIC_POOL",
    requiredAuthorizationPhrase:
      "AUTHORIZE",
    previewedAt:
      STOP_AT -
      5_000,
    authorizedAt:
      STOP_AT -
      4_000,
    authorityExpiresAt:
      STOP_AT +
      5_000,
    consumedAt:
      STOP_AT -
      3_000,
    pairBoundAt:
      STOP_AT -
      2_000,
    pairSessionId:
      "strategy-one:recovered-pair",
    finalizedAt:
      STOP_AT +
      2_000,
    finalOutcome:
      "POSSIBLE_EXPOSURE",
    requiresRecovery:
      true,
    resolvedAt:
      null,
    liveOrderSubmissionAuthorized:
      true,
    automaticRetryAllowed:
      false,
    automaticFundMovementAllowed:
      false,
  };
}

function resolutionFixture():
  StrategyOneTwoLegRecoveryResolutionRecord {
  return {
    schemaVersion:
      "109.0",
    sessionId:
      "strategy-one:recovered-pair",
    status:
      "RESOLVED",
    basis:
      "AUTHORITATIVE_TERMINAL_BALANCED",
    evidenceFingerprint:
      "current-fingerprint",
    resolutionNote:
      "Both exchange legs are authoritative, terminal and quantity-balanced.",
    resolvedAt:
      STOP_AT +
      30_000,
    buyFilledQuantity:
      123,
    sellFilledQuantity:
      123,
    terminalStatuses: [
      "FILLED",
      "FILLED",
    ],
    automaticOrderActionPerformed:
      false,
  };
}

main();
