import type {
  ExchangeBalanceDashboardReport,
  ExchangeBalanceDashboardStatus,
} from "../../portfolio/services/ExchangeBalancePortfolioService";

import type {
  StrategyOneCapitalPlacementReport,
} from "./StrategyOneCapitalPlacementService";

const RECOMMENDED_STARTING_BANKROLL_INR = 3_000;
const MAXIMUM_INITIAL_EXCHANGE_EXPOSURE_INR = 2_000;
const OFF_EXCHANGE_RESERVE_INR = 1_000;
const MAXIMUM_VISIBLE_ASSETS_PER_EXCHANGE = 8;

export type PersonalCapitalManagerState =
  | "EVIDENCE_INCOMPLETE"
  | "WAITING_FOR_ROUTE"
  | "OPERATOR_ACTION_REQUIRED"
  | "READY_FOR_PREFLIGHT";

export interface PersonalCapitalManagerRequirementInput {
  readonly side: "BUY_QUOTE" | "SELL_BASE";
  readonly exchange: string;
  readonly asset: string | null;
  readonly requiredAmount: number | null;
  readonly availableAmount: number | null;
  readonly planningAvailableAmount: number | null;
  readonly deficitAmount: number | null;
  readonly evidence: "PRESENT" | "SYNCHRONIZED_ASSET_OMITTED" | "UNAVAILABLE";
  readonly action: string;
}

export interface PersonalCapitalManagerInventoryRouteInput {
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly baseAsset: string | null;
  readonly quoteAsset: string | null;
  readonly fundingState: "FUNDED" | "REDUCED" | "BLOCKED";
  readonly fullySpecified: boolean;
  readonly requirements: readonly [
    PersonalCapitalManagerRequirementInput,
    PersonalCapitalManagerRequirementInput,
  ];
}

export interface PersonalCapitalManagerInput {
  readonly now: number;
  readonly inventoryPlan: {
    readonly recommendationStatus:
      | "NO_CURRENT_EXECUTE_ROUTE"
      | "EVIDENCE_INCOMPLETE"
      | "FUNDING_REQUIRED"
      | "READY";
    readonly recommendedRoute: PersonalCapitalManagerInventoryRouteInput | null;
  };
  readonly capitalPlacement: StrategyOneCapitalPlacementReport;
  readonly exchangeBalances: ExchangeBalanceDashboardReport;
  readonly paperCapital: {
    readonly budgetInr: number;
    readonly accountingEquityInr: number;
    readonly availableAccountingEquityInr: number;
  };
  readonly profitEvidence: {
    readonly credibleSettlements: number;
    readonly grossTradingProfitInr: number;
    readonly tradingFeesInr: number;
    readonly economicNetPnlInr: number;
    readonly tdsWithheldInr: number;
    readonly deployableCashPnlInr: number;
    readonly realizedLossesInr: number;
    readonly pendingSettlements: number;
  };
}

export interface PersonalCapitalManagerAction {
  readonly priority: number;
  readonly kind:
    | "HOLD_OFF_EXCHANGE_RESERVE"
    | "WAIT_FOR_CURRENT_ROUTE"
    | "REFRESH_BALANCE_EVIDENCE"
    | "PREPOSITION_ASSET"
    | "KEEP_POSITION"
    | "RUN_READ_ONLY_PREFLIGHT";
  readonly state: "WAITING" | "BLOCKED" | "ACTION_REQUIRED" | "READY";
  readonly exchange: string | null;
  readonly asset: string | null;
  readonly amount: number | null;
  readonly unit: "INR" | "NATIVE_ASSET" | null;
  readonly instruction: string;
  readonly operatorApprovalRequired: boolean;
  readonly automaticExecutionAllowed: false;
}

export interface PersonalCapitalManagerReport {
  readonly version: "101.0";
  readonly generatedAt: number;
  readonly mode: "ADVISORY_ONLY";
  readonly state: PersonalCapitalManagerState;
  readonly pilotPolicy: {
    readonly recommendedStartingBankrollInr: 3_000;
    readonly maximumInitialExchangeExposureInr: 2_000;
    readonly offExchangeReserveInr: 1_000;
    readonly offExchangeReserveLocation: "OPERATOR_LINKED_BANK_ACCOUNT";
    readonly offExchangeReserveEvidence: "NOT_OBSERVED_BY_BOT";
    readonly requestedPerLegInr: number;
    readonly minimumTwoLegInventoryInr: number;
  };
  readonly evidence: {
    readonly exchanges: number;
    readonly freshExchanges: number;
    readonly allExchangeBalancesFresh: boolean;
    readonly currentRouteAvailable: boolean;
    readonly currentRouteFullySpecified: boolean;
    readonly historicalRouteMatched: boolean;
    readonly nativeAssetUnitsNeverSummed: true;
  };
  readonly capitalTruth: {
    readonly valuationState:
      | "NO_FRESH_BALANCE_EVIDENCE"
      | "INR_SUBTOTAL_ONLY"
      | "FULLY_INR_DENOMINATED";
    readonly verifiedInrSubtotal: {
      readonly availableInr: number | null;
      readonly lockedInr: number | null;
      readonly totalInr: number | null;
      readonly contributingExchanges: number;
    };
    readonly allAssetPortfolioValueInr: number | null;
    readonly positiveUnvaluedAssetCount: number;
    readonly nativeAssetTotals: readonly {
      readonly asset: string;
      readonly availableBalance: number;
      readonly lockedBalance: number;
      readonly totalBalance: number;
      readonly contributingExchanges: number;
    }[];
    readonly paper: {
      readonly source: "ISOLATED_PAPER_LEDGER";
      readonly budgetInr: number;
      readonly accountingEquityInr: number;
      readonly availableAccountingEquityInr: number;
      readonly includedInLiveBalanceTotals: false;
    };
    readonly missingValuesNeverTreatedAsZero: true;
  };
  readonly profitTruth: {
    readonly mode: "PAPER_EVIDENCE_ONLY";
    readonly currency: "INR";
    readonly credibleSettlements: number;
    readonly grossTradingProfitInr: number;
    readonly tradingFeesInr: number;
    readonly economicNetPnlInr: number;
    readonly tdsWithheldInr: number;
    readonly deployableCashPnlInr: number;
    readonly realizedLossesInr: number;
    readonly pendingSettlements: number;
    readonly pendingPnlInr: null;
    readonly taxReserveInr: null;
    readonly safelyWithdrawableProfitInr: null;
    readonly withdrawalState: "UNAVAILABLE_WITHOUT_RECONCILED_LIVE_LEDGER";
    readonly paperProfitNeverWithdrawable: true;
  };
  readonly allocation: {
    readonly basis: "CURRENT_EXECUTE_REQUIREMENT_PLUS_DURABLE_ROUTE_DEMAND";
    readonly status:
      | "EVIDENCE_INCOMPLETE"
      | "WAITING_FOR_CURRENT_ROUTE"
      | "TARGETS_AVAILABLE";
    readonly staticEqualAllocationUsed: false;
    readonly stage: "SINGLE_CYCLE_TINY_LIVE_ADVISORY";
    readonly targetOperatingCycles: 1;
    readonly targets: readonly {
      readonly side: "BUY_QUOTE" | "SELL_BASE";
      readonly exchange: string;
      readonly asset: string;
      readonly minimumAmount: number;
      readonly targetAmount: number;
      readonly maximumAmount: number;
      readonly currentAmount: number;
      readonly deficitAmount: number;
      readonly surplusAmount: number;
      readonly estimatedOperatingCycles: number;
      readonly state: "NO_DATA" | "DEFICIT" | "ON_TARGET" | "SURPLUS";
      readonly blockedCurrentRoute: boolean;
      readonly reason: string;
    }[];
    readonly demandRanking: readonly {
      readonly rank: number;
      readonly side: "BUY" | "SELL";
      readonly exchange: string;
      readonly settlementSharePercent: number;
      readonly uniqueSettlements: number;
      readonly realizedPnlInr: number;
      readonly averageNetReturnPercent: number;
      readonly confidence: "LOW" | "MEDIUM" | "HIGH";
    }[];
    readonly scalingBlockedUntilLiveEvidence: true;
    readonly explanation: string;
  };
  readonly route: {
    readonly routeKey: string;
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
    readonly baseAsset: string | null;
    readonly quoteAsset: string | null;
    readonly fundingState: "FUNDED" | "REDUCED" | "BLOCKED";
    readonly historicalRank: number | null;
    readonly historicalSettlements: number | null;
    readonly confidence: "LOW" | "MEDIUM" | "HIGH" | null;
    readonly requirements: readonly PersonalCapitalManagerRequirementInput[];
  } | null;
  readonly venues: readonly {
    readonly exchange: string;
    readonly displayName: string;
    readonly status: ExchangeBalanceDashboardStatus;
    readonly lastSynchronizedAt: number | null;
    readonly balanceAgeMs: number | null;
    readonly positiveAssetCount: number;
    readonly synchronizedAssetCount: number;
    readonly assetsTruncated: boolean;
    readonly assets: readonly {
      readonly asset: string;
      readonly availableBalance: number;
      readonly lockedBalance: number;
      readonly totalBalance: number;
    }[];
  }[];
  readonly actions: readonly PersonalCapitalManagerAction[];
  readonly safety: {
    readonly advisoryOnly: true;
    readonly paperCapitalIsolated: true;
    readonly paperExecutionAffected: false;
    readonly automaticFundMovementAllowed: false;
    readonly transferInitiated: false;
    readonly withdrawalInitiated: false;
    readonly balanceMutated: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
    readonly bankWithdrawalAllowed: false;
    readonly transferAuthorityMode: "ADVISORY_ONLY";
    readonly emergencyFreezeAvailableBeforeTransferPhases: true;
  };
}

/**
 * Builds one immutable advisory view from balance snapshots and the existing
 * Strategy #1 inventory owners. It has no dependency on any order, transfer,
 * withdrawal, account-control or PAPER execution command path.
 */
export class PersonalCapitalManagerService {
  getReport(input: PersonalCapitalManagerInput): PersonalCapitalManagerReport {
    if (!Number.isSafeInteger(input.now) || input.now <= 0) {
      throw new Error("Personal capital-manager timestamp must be a positive safe integer.");
    }
    validateCapitalManagerInput(input);

    const route = input.inventoryPlan.recommendedRoute;
    const historicalRoute = route === null
      ? null
      : input.capitalPlacement.routes.find((candidate) => candidate.routeKey === route.routeKey) ?? null;
    const allExchangeBalancesFresh = input.exchangeBalances.totals.exchanges > 0 &&
      input.exchangeBalances.totals.synchronized === input.exchangeBalances.totals.exchanges;
    const routeEvidenceComplete = route !== null && route.fullySpecified &&
      route.requirements.every((requirement) =>
        requirement.asset !== null && requirement.requiredAmount !== null &&
        requirement.planningAvailableAmount !== null && requirement.deficitAmount !== null);
    const fundingActionRequired = routeEvidenceComplete && route.requirements.some(
      (requirement) => (requirement.deficitAmount ?? 0) > 0,
    );
    const state: PersonalCapitalManagerState = !allExchangeBalancesFresh ||
      input.inventoryPlan.recommendationStatus === "EVIDENCE_INCOMPLETE" ||
      (route !== null && !routeEvidenceComplete)
      ? "EVIDENCE_INCOMPLETE"
      : route === null
        ? "WAITING_FOR_ROUTE"
        : fundingActionRequired
          ? "OPERATOR_ACTION_REQUIRED"
          : "READY_FOR_PREFLIGHT";
    const actions = buildActions(route, routeEvidenceComplete, fundingActionRequired);
    const capitalTruth = buildCapitalTruth(input);
    const allocation = buildAllocation(
      route,
      routeEvidenceComplete,
      input.capitalPlacement,
    );

    return deepFreeze({
      version: "101.0" as const,
      generatedAt: input.now,
      mode: "ADVISORY_ONLY" as const,
      state,
      pilotPolicy: {
        recommendedStartingBankrollInr: RECOMMENDED_STARTING_BANKROLL_INR as 3_000,
        maximumInitialExchangeExposureInr: MAXIMUM_INITIAL_EXCHANGE_EXPOSURE_INR as 2_000,
        offExchangeReserveInr: OFF_EXCHANGE_RESERVE_INR as 1_000,
        offExchangeReserveLocation: "OPERATOR_LINKED_BANK_ACCOUNT" as const,
        offExchangeReserveEvidence: "NOT_OBSERVED_BY_BOT" as const,
        requestedPerLegInr: input.capitalPlacement.pilot.requestedPerLegInr,
        minimumTwoLegInventoryInr: input.capitalPlacement.pilot.minimumTwoLegInventoryInr,
      },
      evidence: {
        exchanges: input.exchangeBalances.totals.exchanges,
        freshExchanges: input.exchangeBalances.totals.synchronized,
        allExchangeBalancesFresh,
        currentRouteAvailable: route !== null,
        currentRouteFullySpecified: routeEvidenceComplete,
        historicalRouteMatched: historicalRoute !== null,
        nativeAssetUnitsNeverSummed: true as const,
      },
      capitalTruth,
      profitTruth: {
        mode: "PAPER_EVIDENCE_ONLY" as const,
        currency: "INR" as const,
        credibleSettlements: input.profitEvidence.credibleSettlements,
        grossTradingProfitInr: round(input.profitEvidence.grossTradingProfitInr),
        tradingFeesInr: round(input.profitEvidence.tradingFeesInr),
        economicNetPnlInr: round(input.profitEvidence.economicNetPnlInr),
        tdsWithheldInr: round(input.profitEvidence.tdsWithheldInr),
        deployableCashPnlInr: round(input.profitEvidence.deployableCashPnlInr),
        realizedLossesInr: round(input.profitEvidence.realizedLossesInr),
        pendingSettlements: input.profitEvidence.pendingSettlements,
        pendingPnlInr: null,
        taxReserveInr: null,
        safelyWithdrawableProfitInr: null,
        withdrawalState: "UNAVAILABLE_WITHOUT_RECONCILED_LIVE_LEDGER" as const,
        paperProfitNeverWithdrawable: true as const,
      },
      allocation,
      route: route === null
        ? null
        : {
            routeKey: route.routeKey,
            market: route.market,
            buyExchange: route.buyExchange,
            sellExchange: route.sellExchange,
            baseAsset: route.baseAsset,
            quoteAsset: route.quoteAsset,
            fundingState: route.fundingState,
            historicalRank: historicalRoute?.rank ?? null,
            historicalSettlements: historicalRoute?.uniqueSettlements ?? null,
            confidence: historicalRoute?.confidence ?? null,
            requirements: route.requirements.map((requirement) => ({...requirement})),
          },
      venues: input.exchangeBalances.exchanges.map((exchange) => {
        const positiveAssets = exchange.assets
          .filter((asset) => asset.totalBalance > 0)
          .sort((first, second) => first.asset.localeCompare(second.asset));
        return {
          exchange: exchange.exchange,
          displayName: exchange.displayName,
          status: exchange.status,
          lastSynchronizedAt: exchange.lastSynchronizedAt,
          balanceAgeMs: exchange.balanceAgeMs,
          positiveAssetCount: exchange.positiveAssetCount,
          synchronizedAssetCount: exchange.synchronizedAssetCount,
          assetsTruncated: positiveAssets.length > MAXIMUM_VISIBLE_ASSETS_PER_EXCHANGE,
          assets: positiveAssets.slice(0, MAXIMUM_VISIBLE_ASSETS_PER_EXCHANGE).map((asset) => ({
            asset: asset.asset,
            availableBalance: asset.availableBalance,
            lockedBalance: asset.lockedBalance,
            totalBalance: asset.totalBalance,
          })),
        };
      }),
      actions,
      safety: {
        advisoryOnly: true as const,
        paperCapitalIsolated: true as const,
        paperExecutionAffected: false as const,
        automaticFundMovementAllowed: false as const,
        transferInitiated: false as const,
        withdrawalInitiated: false as const,
        balanceMutated: false as const,
        liveExecutionAllowed: false as const,
        orderSubmissionAllowed: false as const,
        bankWithdrawalAllowed: false as const,
        transferAuthorityMode: "ADVISORY_ONLY" as const,
        emergencyFreezeAvailableBeforeTransferPhases: true as const,
      },
    });
  }
}

function buildCapitalTruth(
  input: PersonalCapitalManagerInput,
): PersonalCapitalManagerReport["capitalTruth"] {
  const aggregates = new Map<string, {
    availableBalance: number;
    lockedBalance: number;
    totalBalance: number;
    exchanges: Set<string>;
  }>();
  const freshExchanges = input.exchangeBalances.exchanges.filter(
    (exchange) => exchange.status === "SYNCHRONIZED",
  );

  for (const exchange of freshExchanges) {
    for (const asset of exchange.assets) {
      const symbol = asset.asset.trim().toUpperCase();
      if (!symbol || asset.totalBalance <= 0) continue;
      const aggregate = aggregates.get(symbol) ?? {
        availableBalance: 0,
        lockedBalance: 0,
        totalBalance: 0,
        exchanges: new Set<string>(),
      };
      aggregate.availableBalance += asset.availableBalance;
      aggregate.lockedBalance += asset.lockedBalance;
      aggregate.totalBalance += asset.totalBalance;
      aggregate.exchanges.add(exchange.exchange);
      aggregates.set(symbol, aggregate);
    }
  }

  const nativeAssetTotals = [...aggregates.entries()]
    .map(([asset, aggregate]) => ({
      asset,
      availableBalance: round(aggregate.availableBalance),
      lockedBalance: round(aggregate.lockedBalance),
      totalBalance: round(aggregate.totalBalance),
      contributingExchanges: aggregate.exchanges.size,
    }))
    .sort((first, second) => first.asset.localeCompare(second.asset));
  const inr = nativeAssetTotals.find((asset) => asset.asset === "INR") ?? null;
  const positiveUnvaluedAssetCount = nativeAssetTotals.filter(
    (asset) => asset.asset !== "INR" && asset.totalBalance > 0,
  ).length;
  const allExchangeBalancesFresh = freshExchanges.length === input.exchangeBalances.totals.exchanges &&
    freshExchanges.length > 0;
  const fullyInrDenominated = allExchangeBalancesFresh && inr !== null &&
    positiveUnvaluedAssetCount === 0;

  return {
    valuationState: freshExchanges.length === 0
      ? "NO_FRESH_BALANCE_EVIDENCE"
      : fullyInrDenominated
        ? "FULLY_INR_DENOMINATED"
        : "INR_SUBTOTAL_ONLY",
    verifiedInrSubtotal: {
      availableInr: inr?.availableBalance ?? null,
      lockedInr: inr?.lockedBalance ?? null,
      totalInr: inr?.totalBalance ?? null,
      contributingExchanges: inr?.contributingExchanges ?? 0,
    },
    allAssetPortfolioValueInr: fullyInrDenominated ? inr.totalBalance : null,
    positiveUnvaluedAssetCount,
    nativeAssetTotals,
    paper: {
      source: "ISOLATED_PAPER_LEDGER",
      budgetInr: round(input.paperCapital.budgetInr),
      accountingEquityInr: round(input.paperCapital.accountingEquityInr),
      availableAccountingEquityInr: round(input.paperCapital.availableAccountingEquityInr),
      includedInLiveBalanceTotals: false,
    },
    missingValuesNeverTreatedAsZero: true,
  };
}

function buildAllocation(
  route: PersonalCapitalManagerInventoryRouteInput | null,
  routeEvidenceComplete: boolean,
  placement: StrategyOneCapitalPlacementReport,
): PersonalCapitalManagerReport["allocation"] {
  const targets = route === null || !routeEvidenceComplete
    ? []
    : route.requirements.flatMap((requirement) => {
        if (requirement.asset === null || requirement.requiredAmount === null ||
          requirement.planningAvailableAmount === null) return [];
        const minimumAmount = round(requirement.requiredAmount);
        const currentAmount = round(requirement.planningAvailableAmount);
        const deficitAmount = round(Math.max(0, minimumAmount - currentAmount));
        const surplusAmount = round(Math.max(0, currentAmount - minimumAmount));
        const estimatedOperatingCycles = minimumAmount > 0
          ? round(currentAmount / minimumAmount)
          : 0;
        const state = deficitAmount > 0
          ? "DEFICIT" as const
          : surplusAmount > 0
            ? "SURPLUS" as const
            : "ON_TARGET" as const;
        return [{
          side: requirement.side,
          exchange: requirement.exchange,
          asset: requirement.asset,
          minimumAmount,
          targetAmount: minimumAmount,
          maximumAmount: minimumAmount,
          currentAmount,
          deficitAmount,
          surplusAmount,
          estimatedOperatingCycles,
          state,
          blockedCurrentRoute: deficitAmount > 0,
          reason: "Target equals one exact current-route cycle. Scaling stays locked until reconciled Tiny-LIVE evidence exists.",
        }];
      });
  const demandRanking = [
    ...placement.buyVenues.slice(0, 3),
    ...placement.sellVenues.slice(0, 3),
  ].map((venue) => ({
    rank: venue.rank,
    side: venue.side,
    exchange: venue.exchange,
    settlementSharePercent: round(venue.settlementSharePercent),
    uniqueSettlements: venue.uniqueSettlements,
    realizedPnlInr: round(venue.realizedPnlInr),
    averageNetReturnPercent: round(venue.averageNetReturnPercent),
    confidence: venue.confidence,
  }));

  return {
    basis: "CURRENT_EXECUTE_REQUIREMENT_PLUS_DURABLE_ROUTE_DEMAND",
    status: route === null
      ? "WAITING_FOR_CURRENT_ROUTE"
      : routeEvidenceComplete
        ? "TARGETS_AVAILABLE"
        : "EVIDENCE_INCOMPLETE",
    staticEqualAllocationUsed: false,
    stage: "SINGLE_CYCLE_TINY_LIVE_ADVISORY",
    targetOperatingCycles: 1,
    targets,
    demandRanking,
    scalingBlockedUntilLiveEvidence: true,
    explanation: "Current amounts follow the fresh route requirement; durable settlements rank demand, but cannot scale or move capital without reconciled LIVE evidence and a later authority phase.",
  };
}

function validateCapitalManagerInput(input: PersonalCapitalManagerInput): void {
  const nonNegativeValues = [
    input.paperCapital.budgetInr,
    input.paperCapital.accountingEquityInr,
    input.paperCapital.availableAccountingEquityInr,
    input.profitEvidence.tradingFeesInr,
    input.profitEvidence.tdsWithheldInr,
    input.profitEvidence.realizedLossesInr,
  ];
  if (nonNegativeValues.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Personal capital-manager non-negative capital evidence is invalid.");
  }
  const signedValues = [
    input.profitEvidence.grossTradingProfitInr,
    input.profitEvidence.economicNetPnlInr,
    input.profitEvidence.deployableCashPnlInr,
  ];
  if (signedValues.some((value) => !Number.isFinite(value))) {
    throw new Error("Personal capital-manager profit evidence is invalid.");
  }
  if (!Number.isSafeInteger(input.profitEvidence.credibleSettlements) ||
    input.profitEvidence.credibleSettlements < 0 ||
    !Number.isSafeInteger(input.profitEvidence.pendingSettlements) ||
    input.profitEvidence.pendingSettlements < 0) {
    throw new Error("Personal capital-manager settlement counts are invalid.");
  }
}

function round(value: number): number {
  return Number(value.toFixed(12));
}

function buildActions(
  route: PersonalCapitalManagerInventoryRouteInput | null,
  routeEvidenceComplete: boolean,
  fundingActionRequired: boolean,
): PersonalCapitalManagerAction[] {
  const actions: PersonalCapitalManagerAction[] = [{
    priority: 1,
    kind: "HOLD_OFF_EXCHANGE_RESERVE",
    state: "READY",
    exchange: null,
    asset: "INR",
    amount: OFF_EXCHANGE_RESERVE_INR,
    unit: "INR",
    instruction: "Keep ₹1,000 in the operator-linked bank account as a non-trading reserve; the bot cannot observe or spend it.",
    operatorApprovalRequired: false,
    automaticExecutionAllowed: false,
  }];

  if (route === null) {
    actions.push({
      priority: 2,
      kind: "WAIT_FOR_CURRENT_ROUTE",
      state: "WAITING",
      exchange: null,
      asset: null,
      amount: null,
      unit: null,
      instruction: "Wait for a fresh Strategy #1 EXECUTE route before positioning exchange capital.",
      operatorApprovalRequired: false,
      automaticExecutionAllowed: false,
    });
    return actions;
  }

  for (const requirement of route.requirements) {
    const nextPriority = actions.length + 1;
    if (requirement.deficitAmount === null || requirement.asset === null || !routeEvidenceComplete) {
      actions.push({
        priority: nextPriority,
        kind: "REFRESH_BALANCE_EVIDENCE",
        state: "BLOCKED",
        exchange: requirement.exchange,
        asset: requirement.asset,
        amount: null,
        unit: null,
        instruction: `Refresh authenticated ${requirement.side === "BUY_QUOTE" ? "BUY-wallet" : "SELL-inventory"} evidence on ${requirement.exchange}; no zero balance is inferred.`,
        operatorApprovalRequired: true,
        automaticExecutionAllowed: false,
      });
      continue;
    }

    if (requirement.deficitAmount > 0) {
      actions.push({
        priority: nextPriority,
        kind: "PREPOSITION_ASSET",
        state: "ACTION_REQUIRED",
        exchange: requirement.exchange,
        asset: requirement.asset,
        amount: requirement.deficitAmount,
        unit: requirement.asset === "INR" ? "INR" : "NATIVE_ASSET",
        instruction: requirement.action,
        operatorApprovalRequired: true,
        automaticExecutionAllowed: false,
      });
      continue;
    }

    actions.push({
      priority: nextPriority,
      kind: "KEEP_POSITION",
      state: "READY",
      exchange: requirement.exchange,
      asset: requirement.asset,
      amount: 0,
      unit: requirement.asset === "INR" ? "INR" : "NATIVE_ASSET",
      instruction: requirement.action,
      operatorApprovalRequired: false,
      automaticExecutionAllowed: false,
    });
  }

  if (routeEvidenceComplete && !fundingActionRequired) {
    actions.push({
      priority: actions.length + 1,
      kind: "RUN_READ_ONLY_PREFLIGHT",
      state: "READY",
      exchange: null,
      asset: null,
      amount: null,
      unit: null,
      instruction: "Run the separate action-time Tiny-LIVE preflight; this manager does not authorize activation or an order.",
      operatorApprovalRequired: true,
      automaticExecutionAllowed: false,
    });
  }

  return actions;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const personalCapitalManagerService = new PersonalCapitalManagerService();
