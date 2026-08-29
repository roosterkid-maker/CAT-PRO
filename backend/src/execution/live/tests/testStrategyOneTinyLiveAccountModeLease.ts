import assert from "node:assert/strict";

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  defaultTradingAccount,
  type TradingAccount,
} from "../../../trading/account/TradingAccount";

import type {
  StrategyOnePolicyActivationGuard,
} from "../../../trading/policy/StrategyOneExecutionPolicyService";

import {
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

import {
  StrategyOneTinyLiveAccountModeLeaseService,
} from "../tiny-live/StrategyOneTinyLiveAccountModeLeaseService";

import type {
  StrategyOneTinyLivePreArmRecord,
} from "../tiny-live/StrategyOneTinyLivePreArmService";

const NOW =
  1_787_214_300_000;

const PRE_ARM_ID =
  "tiny-live-prearm-a799f68322541a20b31eb2ec9531d357";

function main(): void {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-v151-account-lease-",
      ),
    );

  try {
    testActivationAndClaimedRestorationBoundary(
      join(
        directory,
        "primary.jsonl",
      ),
    );
    testRestartRecovery(
      join(
        directory,
        "restart.jsonl",
      ),
    );
    testActivationGuard(
      join(
        directory,
        "guard.jsonl",
      ),
    );
    testTenAttemptLease(
      join(
        directory,
        "ten-attempt.jsonl",
      ),
    );
    testDynamicRoutePoolLease(join(directory, "route-pool.jsonl"));
  } finally {
    rmSync(
      directory,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }

  console.log(
    "V151/V190 bounded account-mode lease passed: exact confirmation, ₹1000 hard-cap consent, remaining-budget dynamic-pool persistence, journal-first PAPER→LIVE, claimed in-flight protection, automatic PAPER restore, restart recovery and no order/fund authority.",
  );
}

function testDynamicRoutePoolLease(filePath: string): void {
  let account = accountFixture();
  const arm: StrategyOneTinyLivePreArmRecord = {
    ...armFixture(),
    schemaVersion: "190.0",
    market: "DYNAMIC_POOL",
    buyExchange: "coindcx",
    sellExchange: "binance",
    requiredArmPhrase:
      "ARM DYNAMIC-POOL USDT INR500 MAXINR1000 MINORDER-STEPS ATTEMPTS8 MINUTES180",
    maximumCapitalPerLegInr: 1_000,
    expiresAt: NOW + 180 * 60_000,
    maximumAttempts: 8,
    routeScope: "DYNAMIC_POOL",
    routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
  };
  const service = new StrategyOneTinyLiveAccountModeLeaseService({
    persistenceFilePath: filePath,
    dependencies: {
      runtimeGateEnabled: () => true,
      getPreArm: (id) => id === arm.id ? structuredClone(arm) : null,
      getAccount: () => structuredClone(account),
      transitionAccountMode: (mode) => {
        account = {...account, mode};
        return structuredClone(account);
      },
      enableEmergencyStop: () => {
        account = {...account, emergencyStop: true};
      },
      getActivationGuard: clearGuard,
      getActionDiagnostics: () => ({
        attemptsToday: 0,
        blockingAuthorityPresent: false,
      }),
      getCalibration: () => {
        throw new Error("Dynamic-pool activation must defer exact calibration to each attempt.");
      },
      now: () => NOW,
    },
  });
  const active = service.activate(
    arm.id,
    StrategyOneTinyLiveAccountModeLeaseService.requiredActivationPhrase(arm.id),
    NOW,
  );

  assert.equal(active.schemaVersion, "190.1");
  assert.equal(active.maximumCapitalPerLegInr, 1_000);
  assert.equal(active.routeScope, "DYNAMIC_POOL");
  assert.equal(active.routePoolId, STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID);
  assert.equal(active.maximumAttempts, 8);
  assert.equal(
    active.timingCalibrationId,
    `PER_ATTEMPT:${STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID}`,
  );
  assert.equal(active.expiresAt, arm.expiresAt);
  assert.equal(active.automaticOrderAuthorityAllowed, false);
  assert.equal(active.automaticTransferAllowed, false);
  assert.equal(active.withdrawalAllowed, false);
  assert.equal(account.mode, "LIVE");

  verifyRetiredFixedBasketLeaseIsNotRestored(filePath);

  const restored = service.restore(active.id, active.requiredRestorePhrase, NOW + 1);
  assert.equal(restored.state, "RESTORED");
  assert.equal(account.mode, "PAPER");
}

function verifyRetiredFixedBasketLeaseIsNotRestored(
  currentFilePath: string,
): void {
  const retiredFilePath = `${currentFilePath}.retired`;
  const envelope = JSON.parse(
    readFileSync(currentFilePath, "utf8").trim().split(/\r?\n/u)[0],
  ) as {payload: Record<string, unknown>};

  envelope.payload.schemaVersion = "183.1";
  envelope.payload.routeScope = "PILOT_BASKET";
  envelope.payload.pilotBasketId = "strategy-one-seven-coin-inventory-v1";
  delete envelope.payload.routePoolId;
  writeFileSync(retiredFilePath, `${JSON.stringify(envelope)}\n`, "utf8");

  const restarted = new StrategyOneTinyLiveAccountModeLeaseService({
    persistenceFilePath: retiredFilePath,
    dependencies: {now: () => NOW},
  });

  assert.equal(
    restarted.getDiagnostics().activeLease,
    null,
    "A retired fixed-basket V183 lease must never be restored after restart.",
  );
  assert.equal(restarted.getDiagnostics().records.length, 0);
}

function testTenAttemptLease(filePath: string): void {
  let account = accountFixture();
  const arm: StrategyOneTinyLivePreArmRecord = {
    ...armFixture(),
    schemaVersion: "182.0",
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    requiredArmPhrase:
      "ARM TEN-SLOT BTCUSDT BINANCE BYBIT INR500 ATTEMPTS10 MINUTES180",
    maximumAttempts: 10,
  };
  const service = new StrategyOneTinyLiveAccountModeLeaseService({
    persistenceFilePath: filePath,
    dependencies: {
      runtimeGateEnabled: () => true,
      getPreArm: (id) => id === arm.id ? structuredClone(arm) : null,
      getAccount: () => structuredClone(account),
      transitionAccountMode: (mode) => {
        account = {...account, mode};
        return structuredClone(account);
      },
      enableEmergencyStop: () => {
        account = {...account, emergencyStop: true};
      },
      getActivationGuard: clearGuard,
      getActionDiagnostics: () => ({
        attemptsToday: 0,
        blockingAuthorityPresent: false,
      }),
      getCalibration: () => ({
        id: "timing-v182-continuous",
        expiresAt: NOW + 120_000,
      }),
      now: () => NOW,
    },
  });
  const active = service.activate(
    arm.id,
    StrategyOneTinyLiveAccountModeLeaseService.requiredActivationPhrase(arm.id),
    NOW,
  );

  assert.equal(active.schemaVersion, "182.1");
  assert.equal(active.maximumAttempts, 10);
  assert.equal(active.market, "BTCUSDT");
  assert.equal(account.mode, "LIVE");

  const restored = service.restore(
    active.id,
    active.requiredRestorePhrase,
    NOW + 1,
  );
  assert.equal(restored.state, "RESTORED");
  assert.equal(account.mode, "PAPER");
}

function testActivationAndClaimedRestorationBoundary(
  filePath:
    string,
): void {
  let account =
    accountFixture();
  let arm =
    armFixture();
  let transitions =
    0;

  const service =
    new StrategyOneTinyLiveAccountModeLeaseService({
      persistenceFilePath:
        filePath,
      dependencies: {
        runtimeGateEnabled: () =>
          true,
        getPreArm: (
          id,
        ) =>
          id ===
            arm.id
            ? structuredClone(
                arm,
              )
            : null,
        getAccount: () =>
          structuredClone(
            account,
          ),
        transitionAccountMode: (
          mode,
        ) => {
          transitions +=
            1;

          assert.equal(
            existsSync(
              filePath,
            ),
            true,
            "The lease journal must exist before account mode changes.",
          );
          assert.match(
            readFileSync(
              filePath,
              "utf8",
            ),
            /"state":"ACTIVATING"/u,
            "ACTIVATING must be durable before PAPER becomes LIVE.",
          );

          account = {
            ...account,
            mode,
          };

          return structuredClone(
            account,
          );
        },
        enableEmergencyStop: () => {
          account = {
            ...account,
            emergencyStop:
              true,
          };
        },
        getActivationGuard:
          clearGuard,
        getActionDiagnostics: () => ({
          attemptsToday:
            0,
          blockingAuthorityPresent:
            false,
        }),
        getCalibration: () => ({
          id:
            "timing-91b4d80ec03bc2670e47e52a6093ab21",
          expiresAt:
            NOW +
            120_000,
        }),
        now: () =>
          NOW,
      },
    });

  assert.throws(
    () =>
      service.activate(
        PRE_ARM_ID,
        "wrong phrase",
        NOW,
      ),
    /Exact account-mode activation confirmation/iu,
  );
  assert.equal(
    account.mode,
    "PAPER",
  );
  assert.equal(
    transitions,
    0,
  );

  const activationPhrase =
    StrategyOneTinyLiveAccountModeLeaseService
      .requiredActivationPhrase(
        PRE_ARM_ID,
      );
  const active =
    service.activate(
      PRE_ARM_ID,
      activationPhrase,
      NOW,
    );

  assert.equal(
    active.state,
    "ACTIVE",
  );
  assert.equal(
    account.mode,
    "LIVE",
  );
  assert.equal(
    active.expiresAt,
    NOW +
      120_000,
    "The account lease must end at the earlier arm/timing expiry.",
  );
  assert.equal(
    active.automaticOrderAuthorityAllowed,
    false,
  );
  assert.equal(
    active.automaticTransferAllowed,
    false,
  );
  assert.equal(
    active.withdrawalAllowed,
    false,
  );

  arm = {
    ...arm,
    state:
      "CLAIMED",
    claimedAt:
      NOW +
      1,
  };

  service.reconcile(
    NOW +
      121_000,
  );
  assert.equal(
    account.mode,
    "LIVE",
    "An in-flight claimed attempt must never have its account mode flipped mid-order.",
  );

  arm = {
    ...arm,
    state:
      "COMPLETED",
    completedAt:
      NOW +
      121_001,
  };

  const restored =
    service.reconcile(
      NOW +
      121_001,
    );
  assert.equal(
    restored?.state,
    "RESTORED",
  );
  assert.equal(
    account.mode,
    "PAPER",
  );
  assert.equal(
    account.emergencyStop,
    false,
  );
  assert.equal(
    service.getDiagnostics(
      NOW +
      121_002,
    ).activeLease,
    null,
  );
}

function testRestartRecovery(
  filePath:
    string,
): void {
  let account =
    accountFixture();
  let arm =
    armFixture();
  const dependencies = {
    runtimeGateEnabled: () =>
      true,
    getPreArm: () =>
      structuredClone(
        arm,
      ),
    getAccount: () =>
      structuredClone(
        account,
      ),
    transitionAccountMode: (
      mode: "PAPER" | "LIVE",
    ) => {
      account = {
        ...account,
        mode,
      };
      return structuredClone(
        account,
      );
    },
    enableEmergencyStop: () => {
      account = {
        ...account,
        emergencyStop:
          true,
      };
    },
    getActivationGuard:
      clearGuard,
    getActionDiagnostics: () => ({
      attemptsToday:
        0,
      blockingAuthorityPresent:
        false,
    }),
    getCalibration: () => ({
      id:
        "timing-restart-1234567890abcdef1234567890abcdef",
      expiresAt:
        NOW +
        120_000,
    }),
    now: () =>
      NOW,
  };

  const first =
    new StrategyOneTinyLiveAccountModeLeaseService({
      persistenceFilePath:
        filePath,
      dependencies,
    });
  first.activate(
    PRE_ARM_ID,
    StrategyOneTinyLiveAccountModeLeaseService
      .requiredActivationPhrase(
        PRE_ARM_ID,
      ),
    NOW,
  );
  assert.equal(
    account.mode,
    "LIVE",
  );

  arm = {
    ...arm,
    state:
      "EXPIRED",
    completedAt:
      NOW +
      121_000,
  };

  const restarted =
    new StrategyOneTinyLiveAccountModeLeaseService({
      persistenceFilePath:
        filePath,
      dependencies,
    });
  const restored =
    restarted.reconcile(
      NOW +
      121_000,
    );

  assert.equal(
    restored?.state,
    "RESTORED",
  );
  assert.equal(
    account.mode,
    "PAPER",
    "A restarted process must restore PAPER from its durable active lease.",
  );
}

function testActivationGuard(
  filePath:
    string,
): void {
  const account =
    accountFixture();
  let transitions =
    0;
  const blocked =
    new StrategyOneTinyLiveAccountModeLeaseService({
      persistenceFilePath:
        filePath,
      dependencies: {
        runtimeGateEnabled: () =>
          true,
        getPreArm: () =>
          armFixture(),
        getAccount: () =>
          structuredClone(
            account,
          ),
        transitionAccountMode: () => {
          transitions +=
            1;
          return structuredClone(
            account,
          );
        },
        enableEmergencyStop: () =>
          undefined,
        getActivationGuard: () => ({
          ...clearGuard(),
          clear:
            false,
          nonTerminalOrders:
            1,
          blockers: [
            "one order remains non-terminal",
          ],
        }),
        getActionDiagnostics: () => ({
          attemptsToday:
            0,
          blockingAuthorityPresent:
            false,
        }),
        getCalibration: () => ({
          id:
            "timing-guard-1234567890abcdef1234567890abcdef",
          expiresAt:
            NOW +
            120_000,
        }),
        now: () =>
          NOW,
      },
    });

  assert.throws(
    () =>
      blocked.activate(
        PRE_ARM_ID,
        StrategyOneTinyLiveAccountModeLeaseService
          .requiredActivationPhrase(
            PRE_ARM_ID,
          ),
        NOW,
      ),
    /non-terminal/iu,
  );
  assert.equal(
    transitions,
    0,
  );
  assert.equal(
    blocked.getDiagnostics(
      NOW,
    ).activeLease,
    null,
  );
}

function accountFixture(): TradingAccount {
  return {
    ...structuredClone(
      defaultTradingAccount,
    ),
    mode:
      "PAPER",
    enabled:
      true,
    emergencyStop:
      false,
    openTrades:
      0,
  };
}

function armFixture(): StrategyOneTinyLivePreArmRecord {
  return {
    schemaVersion:
      "150.0",
    id:
      PRE_ARM_ID,
    state:
      "ARMED",
    market:
      "COTIUSDT",
    buyExchange:
      "coindcx",
    sellExchange:
      "binance",
    capitalPerLegInr:
      500,
    requiredArmPhrase:
      "ARM TWO-SLOT COTIUSDT COINDCX BINANCE INR500 ATTEMPTS2 MINUTES180",
    armedAt:
      NOW -
      60_000,
    expiresAt:
      NOW +
      180_000,
    claimedAt:
      null,
    opportunityId:
      null,
    authorityId:
      null,
    completedAt:
      null,
    executionStatus:
      null,
    failureReason:
      null,
    automaticRetryAllowed:
      false,
    automaticFundMovementAllowed:
      false,
    maximumAttempts:
      2,
    attemptsUsed:
      0,
    attempts:
      [],
    nextAttemptNotBefore:
      null,
  };
}

function clearGuard(): StrategyOnePolicyActivationGuard {
  return {
    clear:
      false,
    botPaused:
      false,
    accountOpenTrades:
      0,
    activeExecutionSessions:
      0,
    activeExecutionLocks:
      0,
    nonTerminalOrders:
      0,
    unresolvedRecoveryIncidents:
      0,
    blockers: [
      "Personal bot must remain paused before policy mutation.",
    ],
  };
}

try {
  main();
} catch (error: unknown) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );
  process.exitCode =
    1;
}
