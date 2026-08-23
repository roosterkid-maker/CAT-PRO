import assert from "node:assert/strict";

import {
  mkdtempSync,
  rmSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  createStrategyOneExecutionPolicyDefinition,
  DEFAULT_STRATEGY_ONE_EXECUTION_POLICY,
  EXCHANGE_EXECUTABLE_STRATEGY_ONE_EXECUTION_POLICY,
  HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY,
  STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION,
  StrategyOneExecutionPolicyService,
  TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY,
} from "../StrategyOneExecutionPolicyService";

import type {
  StrategyOnePolicyRuntimeEvidence,
} from "../StrategyOneExecutionPolicyService";

function main(): void {
  assert.equal(
    DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.values.paper.minimumNetProfitPercent,
    0.5,
  );

  assert.equal(
    DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.values.paper.routeCooldownMs,
    30_000,
  );

  assert.equal(
    EXCHANGE_EXECUTABLE_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.capitalPerLegInr,
    500,
  );

  assert.equal(
    EXCHANGE_EXECUTABLE_STRATEGY_ONE_EXECUTION_POLICY.safety.liveOrderSubmissionAllowed,
    false,
  );

  assert.equal(
    HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY.values.paper.minimumNetProfitPercent,
    0.3,
  );

  assert.equal(
    HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY.values.paper.routeCooldownMs,
    5_000,
  );

  assert.equal(
    HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.minimumNetProfitPercent,
    EXCHANGE_EXECUTABLE_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.minimumNetProfitPercent,
  );

  assert.equal(
    HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.capitalPerLegInr,
    EXCHANGE_EXECUTABLE_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.capitalPerLegInr,
  );

  assert.equal(
    HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY.safety.liveOrderSubmissionAllowed,
    false,
  );

  assert.equal(
    TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.minimumNetProfitPercent,
    0.3,
  );

  assert.equal(
    TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.capitalPerLegInr,
    500,
  );

  assert.equal(
    TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.maximumConcurrentTrades,
    1,
  );

  assert.equal(
    TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.requirePrefundedBalances,
    true,
  );

  assert.equal(
    TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.requireParallelDispatch,
    true,
  );

  assert.equal(
    TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive.requireBoundedResidualRecovery,
    true,
  );

  assert.equal(
    TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY.safety.liveOrderSubmissionAllowed,
    false,
  );

  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-strategy-one-policy-",
      ),
    );

  try {
    const persistenceFilePath =
      join(
        directory,
        "policy-activations.jsonl",
      );

    let evidence:
      StrategyOnePolicyRuntimeEvidence = {
      botEnabled:
        true,
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
    };

    const versionTwo =
      createStrategyOneExecutionPolicyDefinition({
        policyId:
          "strategy-one-execution-policy-v2",
        revision:
          2,
        label:
          "Strategy #1 PAPER + Tiny-LIVE Preflight V2",
        rationale:
          "Deterministic activation test policy with stricter profit gates.",
        values: {
          ...structuredClone(
            DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.values,
          ),
          paper: {
            ...DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.values.paper,
            minimumNetProfitPercent:
              0.6,
          },
          tinyLive: {
            ...DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive,
            minimumNetProfitPercent:
              0.6,
          },
        },
      });

    const policies = [
      DEFAULT_STRATEGY_ONE_EXECUTION_POLICY,
      versionTwo,
    ] as const;

    const service =
      new StrategyOneExecutionPolicyService({
        persistenceFilePath,
        policies,
        dependencies: {
          getRuntimeEvidence:
            () => ({
              ...evidence,
            }),
        },
        now:
          1_000,
      });

    assert.equal(
      service.getActivePolicy().policyId,
      DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.policyId,
    );

    const report =
      service.getReport(
        2_000,
      );

    assert.equal(
      report.liveOrderSubmissionAllowed,
      false,
    );

    assert.equal(
      report.orderTimeQuoteAgeCalibrated,
      false,
    );

    assert.equal(
      report.activationGuard.clear,
      false,
    );

    assert.match(
      report.activationGuard.blockers[0] ??
        "",
      /Pause the personal bot/,
    );

    assert.throws(
      () =>
        service.activate(
          versionTwo.policyId,
          "WRONG_CONFIRMATION",
          3_000,
        ),
      /requires confirmation/,
    );

    assert.throws(
      () =>
        service.activate(
          versionTwo.policyId,
          STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION,
          4_000,
        ),
      /Pause the personal bot/,
    );

    evidence = {
      ...evidence,
      botEnabled:
        false,
    };

    const activated =
      service.activate(
        versionTwo.policyId,
        STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION,
        5_000,
      );

    assert.equal(
      activated.policyId,
      versionTwo.policyId,
    );

    assert.equal(
      activated.policyHash,
      versionTwo.policyHash,
    );

    const restored =
      new StrategyOneExecutionPolicyService({
        persistenceFilePath,
        policies,
        dependencies: {
          getRuntimeEvidence:
            () => ({
              ...evidence,
            }),
        },
        now:
          6_000,
      });

    assert.equal(
      restored.getActivePolicy().policyId,
      versionTwo.policyId,
    );

    assert.equal(
      restored.getActivatedAt(),
      5_000,
    );

    evidence = {
      ...evidence,
      nonTerminalOrders:
        1,
      unresolvedRecoveryIncidents:
        1,
    };

    assert.throws(
      () =>
        restored.activate(
          DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.policyId,
          STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION,
          7_000,
        ),
      /non-terminal.*recovery incident/,
    );

    assert.equal(
      restored.getActivePolicy().policyId,
      versionTwo.policyId,
      "A blocked activation must not mutate the active pointer.",
    );

    evidence = {
      ...evidence,
      nonTerminalOrders:
        0,
      unresolvedRecoveryIncidents:
        0,
    };

    const rolledBack =
      restored.activate(
        DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.policyId,
        STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION,
        8_000,
      );

    assert.equal(
      rolledBack.policyId,
      DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.policyId,
    );

    assert.throws(
      () =>
        createStrategyOneExecutionPolicyDefinition({
          policyId:
            "unsafe-tiny-live-capital",
          revision:
            3,
          label:
            "Unsafe capital test",
          rationale:
            "Must fail before registration.",
          values: {
            ...structuredClone(
              DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.values,
            ),
            tinyLive: {
              ...DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive,
              capitalPerLegInr:
                99,
            },
          },
        }),
      /between ₹100 and ₹500/,
    );

    console.log(
      "Strategy #1 versioned policy activation tests passed.",
    );
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
}

main();
