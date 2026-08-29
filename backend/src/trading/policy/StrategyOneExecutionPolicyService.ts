import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import {
  orderLifecycleManager,
} from "../../execution/live/lifecycle/OrderLifecycleManager";

import {
  executionRecoveryEngine,
} from "../../execution/live/recovery/ExecutionRecoveryEngine";

import {
  personalBotRuntimeControlService,
} from "../../strategies/services/PersonalBotRuntimeControlService";

import {
  tradingAccountService,
} from "../account/TradingAccountService";

export const STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION =
  "ACTIVATE_VERSIONED_STRATEGY_ONE_POLICY";

export interface StrategyOneExecutionPolicyValues {
  readonly discovery: {
    readonly minimumSpreadPercent: number;
    readonly minimumNetProfitPercent: number;
    readonly referenceCapitalInr: number;
    readonly minimumLiquidityPercent: number;
    readonly maximumQuoteAgeMs: number;
    readonly maximumCrossExchangePriceRatio: number;
    readonly allowLastPriceFallback: false;
  };

  readonly qualification: {
    readonly minimumConsecutiveObservations: number;
    readonly minimumPersistenceMs: number;
    readonly minimumNetProfitPercent: number;
    readonly minimumLiquidityScore: number;
    readonly minimumFreshnessScore: number;
  };

  readonly paper: {
    readonly minimumNetProfitPercent: number;
    readonly maximumSnapshotAgeMs: number;
    readonly routeCooldownMs: number;
    readonly maximumCapitalPerTradeInr: number;
    readonly buySlippagePercent: number;
    readonly sellSlippagePercent: number;
    readonly safetyBufferPercent: number;
    readonly requireCompleteTwoLegDepth: true;
  };

  readonly tinyLive: {
    readonly mode: "PREFLIGHT_ONLY";
    readonly capitalPerLegInr: number;
    readonly maximumConcurrentTrades: 1;
    readonly minimumNetProfitPercent: number;
    /**
     * Optional for backward-compatible immutable policy hashes. Historical
     * policies fall back to minimumNetProfitPercent; newer revisions may use a
     * separate floor after depth, fees, adverse-move reserve and safety buffer.
     */
    readonly postStressMinimumNetProfitPercent?: number;
    readonly maximumPreviewOpportunityAgeMs: number;
    readonly orderSubmissionMaximumQuoteAgeMs: null;
    readonly requireCompleteTwoLegDepth: true;
    readonly requirePrefundedBalances: true;
    readonly requireParallelDispatch: true;
    readonly requireAuditedTimeInForce: true;
    readonly requireWebSocketFillConfirmation: true;
    readonly requireBoundedResidualRecovery: true;
  };
}

export interface StrategyOneExecutionPolicyDefinition {
  readonly schemaVersion: "102.0";
  readonly policyId: string;
  readonly revision: number;
  readonly label: string;
  readonly rationale: string;
  readonly policyHash: string;
  readonly values: StrategyOneExecutionPolicyValues;
  readonly safety: {
    readonly liveOrderSubmissionAllowed: false;
    readonly automaticFundMovementAllowed: false;
    readonly midTradeMutationAllowed: false;
    readonly activationRequiresBotPaused: true;
    readonly activationRequiresNoOpenExposure: true;
  };
}

export interface StrategyOnePolicyActivationGuard {
  readonly clear: boolean;
  readonly botPaused: boolean;
  readonly accountOpenTrades: number;
  readonly activeExecutionSessions: number;
  readonly activeExecutionLocks: number;
  readonly nonTerminalOrders: number;
  readonly unresolvedRecoveryIncidents: number;
  readonly blockers: readonly string[];
}

export interface StrategyOnePolicyReport {
  readonly generatedAt: number;
  readonly mode: "VERSIONED_STRATEGY_ONE_POLICY";
  readonly active: StrategyOneExecutionPolicyDefinition;
  readonly availableVersions: readonly {
    readonly policyId: string;
    readonly revision: number;
    readonly label: string;
    readonly policyHash: string;
    readonly active: boolean;
  }[];
  readonly activationGuard: StrategyOnePolicyActivationGuard;
  readonly activationConfirmation: typeof STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION;
  readonly activationIsAtomic: true;
  readonly persistenceIsAppendOnly: true;
  readonly liveOrderSubmissionAllowed: false;
  readonly orderTimeQuoteAgeCalibrated: false;
  readonly reasons: readonly string[];
}

interface StrategyOnePolicyActivationEvent {
  readonly schemaVersion: "102.0";
  readonly eventId: string;
  readonly event: "ACTIVATED";
  readonly policyId: string;
  readonly revision: number;
  readonly policyHash: string;
  readonly activatedAt: number;
}

export interface StrategyOnePolicyRuntimeEvidence {
  readonly botEnabled: boolean;
  readonly accountOpenTrades: number;
  readonly activeExecutionSessions: number;
  readonly activeExecutionLocks: number;
  readonly nonTerminalOrders: number;
  readonly unresolvedRecoveryIncidents: number;
}

export interface StrategyOneExecutionPolicyDependencies {
  getRuntimeEvidence(): StrategyOnePolicyRuntimeEvidence;
}

export interface StrategyOneExecutionPolicyServiceOptions {
  readonly persistenceFilePath?: string;
  readonly policies?: readonly StrategyOneExecutionPolicyDefinition[];
  readonly dependencies?: StrategyOneExecutionPolicyDependencies;
  readonly now?: number;
}

const DEFAULT_POLICY_FILE =
  resolve(
    process.cwd(),
    "logs",
    "control",
    "strategy-one-policy-activations.jsonl",
  );

export const DEFAULT_STRATEGY_ONE_EXECUTION_POLICY =
  createStrategyOneExecutionPolicyDefinition({
    policyId:
      "strategy-one-execution-policy-v1",
    revision:
      1,
    label:
      "Strategy #1 PAPER + Tiny-LIVE Preflight V1",
    rationale:
      "Separates discovery, qualification, PAPER and Tiny-LIVE preflight policy while keeping every real-order authority fail-closed.",
    values: {
      discovery: {
        minimumSpreadPercent:
          0.05,
        minimumNetProfitPercent:
          0.05,
        referenceCapitalInr:
          500,
        minimumLiquidityPercent:
          5,
        maximumQuoteAgeMs:
          10_000,
        maximumCrossExchangePriceRatio:
          1.05,
        allowLastPriceFallback:
          false,
      },
      qualification: {
        minimumConsecutiveObservations:
          3,
        minimumPersistenceMs:
          5_000,
        minimumNetProfitPercent:
          0.3,
        minimumLiquidityScore:
          70,
        minimumFreshnessScore:
          80,
      },
      paper: {
        minimumNetProfitPercent:
          0.5,
        maximumSnapshotAgeMs:
          7_500,
        routeCooldownMs:
          30_000,
        maximumCapitalPerTradeInr:
          1_000,
        buySlippagePercent:
          0.02,
        sellSlippagePercent:
          0.02,
        safetyBufferPercent:
          0.05,
        requireCompleteTwoLegDepth:
          true,
      },
      tinyLive: {
        mode:
          "PREFLIGHT_ONLY",
        capitalPerLegInr:
          100,
        maximumConcurrentTrades:
          1,
        minimumNetProfitPercent:
          0.5,
        maximumPreviewOpportunityAgeMs:
          10_000,
        orderSubmissionMaximumQuoteAgeMs:
          null,
        requireCompleteTwoLegDepth:
          true,
        requirePrefundedBalances:
          true,
        requireParallelDispatch:
          true,
        requireAuditedTimeInForce:
          true,
        requireWebSocketFillConfirmation:
          true,
        requireBoundedResidualRecovery:
          true,
      },
    },
  });

/**
 * Binance and Bybit currently require at least 5 quote-asset units for the
 * audited USDT SPOT pilot lane. The legacy ₹100 policy is retained for
 * append-only history, while this revision uses the existing hard ₹500 cap
 * and still fails closed whenever live order rules or INR/USDT conversion
 * make that amount insufficient.
 */
export const EXCHANGE_EXECUTABLE_STRATEGY_ONE_EXECUTION_POLICY =
  createStrategyOneExecutionPolicyDefinition({
    policyId:
      "strategy-one-execution-policy-v2-exchange-minimum",
    revision:
      2,
    label:
      "Strategy #1 Exchange-Executable Tiny-LIVE V2",
    rationale:
      "Raises the one-time pilot from the non-executable legacy ₹100 amount to the existing hard ₹500 per-leg ceiling while retaining current order-rule, funding, timing, profit, one-time authority and recovery gates.",
    values: {
      ...structuredClone(
        DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.values,
      ),
      tinyLive: {
        ...DEFAULT_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive,
        capitalPerLegInr:
          500,
      },
    },
  });

/**
 * PAPER-only HFT policy. This is a new immutable revision: changing the
 * historical V1/V2 definitions would invalidate persisted activation hashes.
 * Tiny-LIVE keeps every V2 threshold and fail-closed safety requirement.
 */
export const HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY =
  createStrategyOneExecutionPolicyDefinition({
    policyId:
      "strategy-one-execution-policy-v3-hft-paper",
    revision:
      3,
    label:
      "Strategy #1 HFT PAPER V2",
    rationale:
      "Allows qualified PAPER candidates from 0.30% with a five-second route cooldown while retaining the exchange-executable Tiny-LIVE policy unchanged.",
    values: {
      ...structuredClone(
        EXCHANGE_EXECUTABLE_STRATEGY_ONE_EXECUTION_POLICY.values,
      ),
      paper: {
        ...EXCHANGE_EXECUTABLE_STRATEGY_ONE_EXECUTION_POLICY.values.paper,
        minimumNetProfitPercent:
          0.3,
        routeCooldownMs:
          5_000,
      },
    },
  });

/**
 * Controlled Tiny-LIVE economics revision. Historical policy definitions stay
 * immutable so persisted activation hashes remain verifiable. The lower floor
 * is still evaluated after fees, slippage, the safety buffer and adverse-move
 * stress; every funding, freshness, depth, authority and recovery gate remains
 * fail-closed.
 */
export const TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY =
  createStrategyOneExecutionPolicyDefinition({
    policyId:
      "strategy-one-execution-policy-v4-tiny-live-030",
    revision:
      4,
    label:
      "Strategy #1 Controlled Tiny-LIVE 0.30% V4",
    rationale:
      "Uses a 0.30% post-stress Tiny-LIVE floor while retaining the exchange-executable ₹500 per-leg cap, one concurrent trade and every existing funding, timing, depth, authority, fill and recovery guard.",
    values: {
      ...structuredClone(
        HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY.values,
      ),
      tinyLive: {
        ...HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive,
        minimumNetProfitPercent:
          0.3,
      },
    },
  });

/**
 * Separates the current fee-adjusted entry floor from the final stressed
 * economics floor. V1-V4 remain byte-for-byte unchanged for persisted hash
 * verification and continue to fall back to their original Tiny-LIVE floor.
 */
export const TINY_LIVE_POST_STRESS_015_STRATEGY_ONE_EXECUTION_POLICY =
  createStrategyOneExecutionPolicyDefinition({
    policyId:
      "strategy-one-execution-policy-v5-post-stress-015",
    revision:
      5,
    label:
      "Strategy #1 Tiny-LIVE 0.30% Current / 0.15% Post-Stress V5",
    rationale:
      "Keeps the 0.30% current fee-adjusted Tiny-LIVE entry floor and uses a distinct 0.15% post-stress floor after exact depth, fees, adverse-move reserve and safety buffer; all funding, freshness, authority, fill and recovery guards remain unchanged.",
    values: {
      ...structuredClone(
        TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY.values,
      ),
      tinyLive: {
        ...TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY.values.tinyLive,
        postStressMinimumNetProfitPercent:
          0.15,
      },
    },
  });

const DEFAULT_DEPENDENCIES:
  StrategyOneExecutionPolicyDependencies = {
  getRuntimeEvidence:
    () => {
      const bot =
        personalBotRuntimeControlService
          .getControl();

      const account =
        tradingAccountService
          .getAccount();

      const coordinator =
        liveExecutionCoordinator
          .getDiagnostics();

      const orders =
        orderLifecycleManager
          .getDiagnostics();

      const recovery =
        executionRecoveryEngine
          .getDiagnostics();

      return {
        botEnabled:
          bot.enabled,
        accountOpenTrades:
          account.openTrades,
        activeExecutionSessions:
          coordinator.activeSessions,
        activeExecutionLocks:
          coordinator.activeLocks,
        nonTerminalOrders:
          orders.prepared +
          orders.submissionRequested +
          orders.acknowledged +
          orders.open +
          orders.partiallyFilled,
        unresolvedRecoveryIncidents:
          recovery.openIncidents +
          recovery.acknowledgedIncidents,
      };
    },
};

export class StrategyOneExecutionPolicyService {
  private readonly store:
    JsonlSnapshotStore<StrategyOnePolicyActivationEvent>;

  private readonly policies:
    ReadonlyMap<string, StrategyOneExecutionPolicyDefinition>;

  private readonly dependencies:
    StrategyOneExecutionPolicyDependencies;

  private active:
    StrategyOneExecutionPolicyDefinition;

  private activatedAt:
    number;

  constructor(
    options:
      StrategyOneExecutionPolicyServiceOptions = {},
  ) {
    const now =
      options.now ??
      Date.now();

    validateTimestamp(
      now,
    );

    const definitions =
      options.policies ??
      [
        DEFAULT_STRATEGY_ONE_EXECUTION_POLICY,
        EXCHANGE_EXECUTABLE_STRATEGY_ONE_EXECUTION_POLICY,
        HFT_PAPER_STRATEGY_ONE_EXECUTION_POLICY,
        TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY,
        TINY_LIVE_POST_STRESS_015_STRATEGY_ONE_EXECUTION_POLICY,
      ];

    if (
      definitions.length ===
      0
    ) {
      throw new Error(
        "At least one Strategy #1 execution policy must be registered.",
      );
    }

    const policyEntries:
      Array<[string, StrategyOneExecutionPolicyDefinition]> =
      definitions.map(
        (
          policy,
        ) => {
          validatePolicy(
            policy,
          );

          return [
            policy.policyId,
            structuredClone(
              policy,
            ),
          ];
        },
      );

    this.policies =
      new Map(
        policyEntries,
      );

    if (
      this.policies.size !==
      definitions.length
    ) {
      throw new Error(
        "Strategy #1 policy IDs must be unique.",
      );
    }

    this.dependencies =
      options.dependencies ??
      DEFAULT_DEPENDENCIES;

    this.store =
      new JsonlSnapshotStore<StrategyOnePolicyActivationEvent>({
        filePath:
          options.persistenceFilePath ??
          DEFAULT_POLICY_FILE,
        isPayload:
          isActivationEvent,
      });

    const defaultPolicy =
      [...this.policies.values()]
        .sort(
          (
            first,
            second,
          ) =>
            first.revision -
            second.revision,
        )[0];

    if (
      !defaultPolicy
    ) {
      throw new Error(
        "Strategy #1 default policy is unavailable.",
      );
    }

    this.active =
      structuredClone(
        defaultPolicy,
      );
    this.activatedAt =
      now;

    const restored =
      this.store
        .readAll()
        .filter(
          (
            event,
          ) => {
            const policy =
              this.policies.get(
                event.policyId,
              );

            return Boolean(
              policy &&
              policy.revision ===
                event.revision &&
              policy.policyHash ===
                event.policyHash,
            );
          },
        )
        .at(-1);

    if (
      restored
    ) {
      const policy =
        this.policies.get(
          restored.policyId,
        );

      if (
        policy
      ) {
        this.active =
          structuredClone(
            policy,
          );
        this.activatedAt =
          restored.activatedAt;
      }
    }
  }

  getActivePolicy():
  StrategyOneExecutionPolicyDefinition {
    return structuredClone(
      this.active,
    );
  }

  getActivatedAt(): number {
    return this.activatedAt;
  }

  getReport(
    now =
      Date.now(),
  ): StrategyOnePolicyReport {
    validateTimestamp(
      now,
    );

    const activationGuard =
      this.getActivationGuard();

    return {
      generatedAt:
        now,
      mode:
        "VERSIONED_STRATEGY_ONE_POLICY",
      active:
        this.getActivePolicy(),
      availableVersions:
        [...this.policies.values()]
          .sort(
            (
              first,
              second,
            ) =>
              first.revision -
              second.revision,
          )
          .map(
            (
              policy,
            ) => ({
              policyId:
                policy.policyId,
              revision:
                policy.revision,
              label:
                policy.label,
              policyHash:
                policy.policyHash,
              active:
                policy.policyId ===
                this.active.policyId,
            }),
          ),
      activationGuard,
      activationConfirmation:
        STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION,
      activationIsAtomic:
        true,
      persistenceIsAppendOnly:
        true,
      liveOrderSubmissionAllowed:
        false,
      orderTimeQuoteAgeCalibrated:
        false,
      reasons: [
        "Discovery, qualification, PAPER and Tiny-LIVE preflight thresholds are explicitly separated.",
        "The active policy identity is captured before Strategy #1 execution planning.",
        "Policy activation persists before the in-memory active pointer changes.",
        "No registered policy can authorize LIVE orders, transfers or automatic fund movement.",
        "Order-time quote age remains deliberately uncalibrated until the execution-risk build is proven.",
      ],
    };
  }

  getActivationGuard():
  StrategyOnePolicyActivationGuard {
    const evidence =
      this.dependencies
        .getRuntimeEvidence();

    validateRuntimeEvidence(
      evidence,
    );

    const blockers:
      string[] = [];

    if (
      evidence.botEnabled
    ) {
      blockers.push(
        "Pause the personal bot before activating a different policy version.",
      );
    }

    if (
      evidence.accountOpenTrades >
      0
    ) {
      blockers.push(
        `${evidence.accountOpenTrades} trading-account position(s) remain open.`,
      );
    }

    if (
      evidence.activeExecutionSessions >
      0 ||
      evidence.activeExecutionLocks >
      0
    ) {
      blockers.push(
        "Execution sessions or route locks are still active.",
      );
    }

    if (
      evidence.nonTerminalOrders >
      0
    ) {
      blockers.push(
        `${evidence.nonTerminalOrders} order lifecycle record(s) are non-terminal.`,
      );
    }

    if (
      evidence.unresolvedRecoveryIncidents >
      0
    ) {
      blockers.push(
        `${evidence.unresolvedRecoveryIncidents} recovery incident(s) remain unresolved.`,
      );
    }

    return {
      clear:
        blockers.length ===
        0,
      botPaused:
        !evidence.botEnabled,
      accountOpenTrades:
        evidence.accountOpenTrades,
      activeExecutionSessions:
        evidence.activeExecutionSessions,
      activeExecutionLocks:
        evidence.activeExecutionLocks,
      nonTerminalOrders:
        evidence.nonTerminalOrders,
      unresolvedRecoveryIncidents:
        evidence.unresolvedRecoveryIncidents,
      blockers,
    };
  }

  activate(
    policyId:
      string,
    confirmation:
      string,
    now =
      Date.now(),
  ): StrategyOneExecutionPolicyDefinition {
    if (
      confirmation !==
      STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION
    ) {
      throw new Error(
        `Strategy #1 policy activation requires confirmation ${STRATEGY_ONE_POLICY_ACTIVATION_CONFIRMATION}.`,
      );
    }

    validateTimestamp(
      now,
    );

    const normalizedPolicyId =
      policyId
        .trim();

    const next =
      this.policies.get(
        normalizedPolicyId,
      );

    if (
      !next
    ) {
      throw new Error(
        `Strategy #1 policy is not registered: ${normalizedPolicyId || "missing"}.`,
      );
    }

    if (
      next.policyId ===
      this.active.policyId
    ) {
      return this.getActivePolicy();
    }

    const guard =
      this.getActivationGuard();

    if (
      !guard.clear
    ) {
      throw new Error(
        `Strategy #1 policy activation is blocked: ${guard.blockers.join(" | ")}`,
      );
    }

    const event:
      StrategyOnePolicyActivationEvent = {
      schemaVersion:
        "102.0",
      eventId:
        randomUUID(),
      event:
        "ACTIVATED",
      policyId:
        next.policyId,
      revision:
        next.revision,
      policyHash:
        next.policyHash,
      activatedAt:
        now,
    };

    /*
     * Fail closed and switch atomically from the process perspective:
     * persistence must succeed before the active pointer is changed.
     */
    this.store.append(
      event,
    );

    this.active =
      structuredClone(
        next,
      );
    this.activatedAt =
      now;

    return this.getActivePolicy();
  }
}

export function createStrategyOneExecutionPolicyDefinition(
  input: {
    readonly policyId: string;
    readonly revision: number;
    readonly label: string;
    readonly rationale: string;
    readonly values: StrategyOneExecutionPolicyValues;
  },
): StrategyOneExecutionPolicyDefinition {
  const base = {
    schemaVersion:
      "102.0" as const,
    policyId:
      input.policyId.trim(),
    revision:
      input.revision,
    label:
      input.label.trim(),
    rationale:
      input.rationale.trim(),
    values:
      structuredClone(
        input.values,
      ),
    safety: {
      liveOrderSubmissionAllowed:
        false as const,
      automaticFundMovementAllowed:
        false as const,
      midTradeMutationAllowed:
        false as const,
      activationRequiresBotPaused:
        true as const,
      activationRequiresNoOpenExposure:
        true as const,
    },
  };

  const definition:
    StrategyOneExecutionPolicyDefinition = {
    ...base,
    policyHash:
      hashPolicy(
        base,
      ),
  };

  validatePolicy(
    definition,
  );

  return definition;
}

function validatePolicy(
  policy:
    StrategyOneExecutionPolicyDefinition,
): void {
  if (
    policy.schemaVersion !==
      "102.0" ||
    !policy.policyId.trim() ||
    !Number.isSafeInteger(
      policy.revision,
    ) ||
    policy.revision <=
      0 ||
    !policy.label.trim() ||
    !policy.rationale.trim()
  ) {
    throw new Error(
      "Strategy #1 policy identity is invalid.",
    );
  }

  const values =
    policy.values;

  const percentages:
    Array<[string, number]> = [
      [
        "discovery.minimumSpreadPercent",
        values.discovery.minimumSpreadPercent,
      ],
      [
        "discovery.minimumNetProfitPercent",
        values.discovery.minimumNetProfitPercent,
      ],
      [
        "discovery.minimumLiquidityPercent",
        values.discovery.minimumLiquidityPercent,
      ],
      [
        "qualification.minimumNetProfitPercent",
        values.qualification.minimumNetProfitPercent,
      ],
      [
        "qualification.minimumLiquidityScore",
        values.qualification.minimumLiquidityScore,
      ],
      [
        "qualification.minimumFreshnessScore",
        values.qualification.minimumFreshnessScore,
      ],
      [
        "paper.minimumNetProfitPercent",
        values.paper.minimumNetProfitPercent,
      ],
      [
        "paper.buySlippagePercent",
        values.paper.buySlippagePercent,
      ],
      [
        "paper.sellSlippagePercent",
        values.paper.sellSlippagePercent,
      ],
      [
        "paper.safetyBufferPercent",
        values.paper.safetyBufferPercent,
      ],
      [
        "tinyLive.minimumNetProfitPercent",
        values.tinyLive.minimumNetProfitPercent,
      ],
    ];

  if (
    values.tinyLive.postStressMinimumNetProfitPercent !==
      undefined
  ) {
    percentages.push([
      "tinyLive.postStressMinimumNetProfitPercent",
      values.tinyLive.postStressMinimumNetProfitPercent,
    ]);
  }

  for (
    const [
      name,
      value,
    ] of percentages
  ) {
    if (
      !Number.isFinite(
        value,
      ) ||
      value <
        0 ||
      value >
        100
    ) {
      throw new Error(
        `${name} must be between 0 and 100.`,
      );
    }
  }

  const positiveIntegers:
    Array<[string, number]> = [
      [
        "discovery.referenceCapitalInr",
        values.discovery.referenceCapitalInr,
      ],
      [
        "discovery.maximumQuoteAgeMs",
        values.discovery.maximumQuoteAgeMs,
      ],
      [
        "qualification.minimumConsecutiveObservations",
        values.qualification.minimumConsecutiveObservations,
      ],
      [
        "qualification.minimumPersistenceMs",
        values.qualification.minimumPersistenceMs,
      ],
      [
        "paper.maximumSnapshotAgeMs",
        values.paper.maximumSnapshotAgeMs,
      ],
      [
        "paper.routeCooldownMs",
        values.paper.routeCooldownMs,
      ],
      [
        "paper.maximumCapitalPerTradeInr",
        values.paper.maximumCapitalPerTradeInr,
      ],
      [
        "tinyLive.capitalPerLegInr",
        values.tinyLive.capitalPerLegInr,
      ],
      [
        "tinyLive.maximumPreviewOpportunityAgeMs",
        values.tinyLive.maximumPreviewOpportunityAgeMs,
      ],
    ];

  for (
    const [
      name,
      value,
    ] of positiveIntegers
  ) {
    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value <=
        0
    ) {
      throw new Error(
        `${name} must be a positive integer.`,
      );
    }
  }

  if (
    values.discovery.maximumCrossExchangePriceRatio <
      1 ||
    !Number.isFinite(
      values.discovery.maximumCrossExchangePriceRatio,
    )
  ) {
    throw new Error(
      "Discovery maximum cross-exchange price ratio must be at least 1.",
    );
  }

  if (
    values.discovery.allowLastPriceFallback !==
      false ||
    values.paper.requireCompleteTwoLegDepth !==
      true ||
    values.tinyLive.mode !==
      "PREFLIGHT_ONLY" ||
    values.tinyLive.maximumConcurrentTrades !==
      1 ||
    values.tinyLive.orderSubmissionMaximumQuoteAgeMs !==
      null ||
    values.tinyLive.requireCompleteTwoLegDepth !==
      true ||
    values.tinyLive.requirePrefundedBalances !==
      true ||
    values.tinyLive.requireParallelDispatch !==
      true ||
    values.tinyLive.requireAuditedTimeInForce !==
      true ||
    values.tinyLive.requireWebSocketFillConfirmation !==
      true ||
    values.tinyLive.requireBoundedResidualRecovery !==
      true ||
    policy.safety.liveOrderSubmissionAllowed !==
      false ||
    policy.safety.automaticFundMovementAllowed !==
      false ||
    policy.safety.midTradeMutationAllowed !==
      false
  ) {
    throw new Error(
      "Strategy #1 policy attempted to weaken a non-negotiable safety invariant.",
    );
  }

  if (
    values.discovery.minimumNetProfitPercent >
      values.qualification.minimumNetProfitPercent ||
    values.qualification.minimumNetProfitPercent >
      values.paper.minimumNetProfitPercent ||
    values.paper.minimumNetProfitPercent >
      values.tinyLive.minimumNetProfitPercent
  ) {
    throw new Error(
      "Strategy #1 profit thresholds must become at least as strict from discovery through Tiny-LIVE.",
    );
  }

  if (
    getStrategyOneTinyLivePostStressMinimumNetProfitPercent(
      values.tinyLive,
    ) >
      values.tinyLive.minimumNetProfitPercent
  ) {
    throw new Error(
      "Strategy #1 Tiny-LIVE post-stress floor cannot exceed its current fee-adjusted entry floor.",
    );
  }

  if (
    values.tinyLive.capitalPerLegInr <
      100 ||
    values.tinyLive.capitalPerLegInr >
      500
  ) {
    throw new Error(
      "Tiny-LIVE preflight capital per leg must remain between ₹100 and ₹500.",
    );
  }

  const expectedHash =
    hashPolicy({
      schemaVersion:
        policy.schemaVersion,
      policyId:
        policy.policyId,
      revision:
        policy.revision,
      label:
        policy.label,
      rationale:
        policy.rationale,
      values:
        policy.values,
      safety:
        policy.safety,
    });

  if (
    policy.policyHash !==
    expectedHash
  ) {
    throw new Error(
      "Strategy #1 policy hash does not match its execution-critical contents.",
    );
  }
}

export function getStrategyOneTinyLivePostStressMinimumNetProfitPercent(
  tinyLive:
    StrategyOneExecutionPolicyValues["tinyLive"],
): number {
  return tinyLive.postStressMinimumNetProfitPercent ??
    tinyLive.minimumNetProfitPercent;
}

function validateRuntimeEvidence(
  evidence:
    StrategyOnePolicyRuntimeEvidence,
): void {
  if (
    typeof evidence.botEnabled !==
    "boolean"
  ) {
    throw new Error(
      "Strategy #1 policy activation bot evidence is invalid.",
    );
  }

  for (
    const value of [
      evidence.accountOpenTrades,
      evidence.activeExecutionSessions,
      evidence.activeExecutionLocks,
      evidence.nonTerminalOrders,
      evidence.unresolvedRecoveryIncidents,
    ]
  ) {
    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value <
        0
    ) {
      throw new Error(
        "Strategy #1 policy activation runtime evidence is invalid.",
      );
    }
  }
}

function validateTimestamp(
  value:
    number,
): void {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      "Strategy #1 policy timestamp must be a positive safe integer.",
    );
  }
}

function hashPolicy(
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

function isActivationEvent(
  value:
    unknown,
): value is StrategyOnePolicyActivationEvent {
  if (
    typeof value !==
      "object" ||
    value ===
      null
  ) {
    return false;
  }

  const candidate =
    value as Partial<StrategyOnePolicyActivationEvent>;

  return candidate.schemaVersion ===
      "102.0" &&
    typeof candidate.eventId ===
      "string" &&
    Boolean(
      candidate.eventId.trim(),
    ) &&
    candidate.event ===
      "ACTIVATED" &&
    typeof candidate.policyId ===
      "string" &&
    Boolean(
      candidate.policyId.trim(),
    ) &&
    Number.isSafeInteger(
      candidate.revision,
    ) &&
    typeof candidate.policyHash ===
      "string" &&
    candidate.policyHash.length ===
      64 &&
    Number.isSafeInteger(
      candidate.activatedAt,
    );
}

export const strategyOneExecutionPolicyService =
  new StrategyOneExecutionPolicyService();
