import {
  CrossExchangeArbitrageStrategyController,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import {
  CrossExchangeMarketMakingStrategyController,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingStrategyController";

import {
  crossExchangeMarketMakingInventoryRouteSelector,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingInventoryRouteSelector";

import {
  crossExchangeMarketMakingVenueRouteSelector,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingVenueRouteSelector";

import {
  HedgeInventoryManagementStrategyController,
} from "../hedge-inventory-management/HedgeInventoryManagementStrategyController";

import {
  TriangularArbitrageStrategyController,
} from "../triangular-arbitrage/TriangularArbitrageStrategyController";

import {AclaCapitalLoopManager} from "../triangular-arbitrage/AclaCapitalLoopManager";
import {AclaShadowLifecycleService} from "../triangular-arbitrage/AclaShadowLifecycleService";

import {
  SpotPerpetualBasisStrategyController,
} from "../spot-perpetual-basis-arbitrage/SpotPerpetualBasisStrategyController";

import {
  FundingRateArbitrageStrategyController,
} from "../funding-rate-arbitrage/FundingRateArbitrageStrategyController";

import {
  PerpetualPerpetualArbitrageStrategyController,
} from "../perpetual-perpetual-arbitrage/PerpetualPerpetualArbitrageStrategyController";

import {
  DynamicMarketMakingStrategyController,
} from "../dynamic-market-making/DynamicMarketMakingStrategyController";

import {
  StatisticalArbitrageStrategyController,
} from "../statistical-arbitrage/StatisticalArbitrageStrategyController";

import {
  StrategyOrchestrator,
} from "../services/StrategyOrchestrator";

import {
  StrategyReadModelService,
} from "../services/StrategyReadModelService";

import {
  StrategyAttributionService,
} from "../services/StrategyAttributionService";

import {
  StrategyRegistry,
} from "../services/StrategyRegistry";

import {
  StrategyIntentService,
} from "../services/StrategyIntentService";

import {
  CentralStrategyExecutionAdmissionService,
} from "../services/CentralStrategyExecutionAdmissionService";

import {
  centralPaperExecutionQueueService,
} from "../services/CentralPaperExecutionQueueService";

import {
  strategyRuntimeOperatorConfiguration,
} from "../config/StrategyRuntimeOperatorConfiguration";

import {
  CentralPaperPlanAdmissionService,
} from "../services/CentralPaperPlanAdmissionService";

export const strategyRegistry =
  new StrategyRegistry();

export const crossExchangeArbitrageStrategyController =
  new CrossExchangeArbitrageStrategyController();

strategyRegistry.register(
  crossExchangeArbitrageStrategyController,
);

/*
 * V21.7 Strategy #2 operator-approved venue failover, inventory-aware,
 * queue-aware partial-fill SHADOW evidence.
 *
 * Registered fail-closed with its default DISABLED, SHADOW-only
 * configuration. Its evidence sources are read-only and are never refreshed
 * while the default configuration remains disabled.
 */
export const crossExchangeMarketMakingStrategyController =
  new CrossExchangeMarketMakingStrategyController(
    strategyRuntimeOperatorConfiguration.xemm,
    undefined,
    undefined,
    undefined,
    undefined,
    crossExchangeMarketMakingInventoryRouteSelector,
    crossExchangeMarketMakingVenueRouteSelector,
  );

strategyRegistry.register(
  crossExchangeMarketMakingStrategyController,
);

/*
 * Legacy V22.18 hedge/inventory implementation retained as an internal
 * evidence producer for the shared recovery bridge. It is deliberately NOT
 * registered as a trading strategy and receives no independent lifecycle.
 */
export const hedgeInventoryManagementStrategyController =
  new HedgeInventoryManagementStrategyController();

/*
 * V25.0 actual Strategy #3 fee/rule/depth-qualified triangular arbitrage.
 * Registered default-disabled and SHADOW-only; it has no execution surface.
 */
export const triangularArbitrageStrategyController =
  new TriangularArbitrageStrategyController({
    enabled: strategyRuntimeOperatorConfiguration.controllerEnabled["triangular-arbitrage"],
  });

strategyRegistry.register(
  triangularArbitrageStrategyController,
);

/* V27.0 actual Strategy #4, default-disabled and SHADOW-only. */
export const spotPerpetualBasisStrategyController =
  new SpotPerpetualBasisStrategyController({
    enabled: strategyRuntimeOperatorConfiguration.controllerEnabled["spot-perpetual-basis-arbitrage"],
  });

strategyRegistry.register(
  spotPerpetualBasisStrategyController,
);

/* V88 bounded carry extension of Strategy #5, operator-enabled and SHADOW-only. */
export const fundingRateArbitrageStrategyController =
  new FundingRateArbitrageStrategyController({
    enabled: strategyRuntimeOperatorConfiguration.controllerEnabled["funding-rate-arbitrage"],
  });

strategyRegistry.register(
  fundingRateArbitrageStrategyController,
);

/* V29.0 actual Strategy #6, default-disabled and SHADOW-only. */
export const perpetualPerpetualArbitrageStrategyController =
  new PerpetualPerpetualArbitrageStrategyController({
    enabled: strategyRuntimeOperatorConfiguration.controllerEnabled["perpetual-perpetual-arbitrage"],
  });

strategyRegistry.register(
  perpetualPerpetualArbitrageStrategyController,
);

/* V30.0 actual Strategy #7, default-disabled and SHADOW-only. */
export const dynamicMarketMakingStrategyController =
  new DynamicMarketMakingStrategyController({
    enabled: strategyRuntimeOperatorConfiguration.controllerEnabled["dynamic-market-making"],
  });

strategyRegistry.register(
  dynamicMarketMakingStrategyController,
);

/* V31.0 actual Strategy #8, default-disabled and SHADOW-only. */
export const statisticalArbitrageStrategyController =
  new StatisticalArbitrageStrategyController({
    enabled: strategyRuntimeOperatorConfiguration.controllerEnabled["statistical-arbitrage"],
  });

strategyRegistry.register(
  statisticalArbitrageStrategyController,
);

export const strategyOrchestrator =
  new StrategyOrchestrator(
    strategyRegistry,
  );

export const centralStrategyExecutionAdmissionService =
  new CentralStrategyExecutionAdmissionService(
    strategyOrchestrator,
    1_000,
    undefined,
    new CentralPaperPlanAdmissionService({
      enabled: strategyRuntimeOperatorConfiguration.centralPaper.enabled,
      allowedStrategies: strategyRuntimeOperatorConfiguration.centralPaper.allowedStrategies,
    }),
  );

export const aclaCapitalLoopManager =
  new AclaCapitalLoopManager(
    triangularArbitrageStrategyController.getConfiguration().capitalPool,
  );

export const aclaShadowLifecycleService =
  new AclaShadowLifecycleService(
    centralStrategyExecutionAdmissionService,
    triangularArbitrageStrategyController,
    aclaCapitalLoopManager,
  );

export {
  centralPaperExecutionQueueService,
  strategyRuntimeOperatorConfiguration,
};

export const strategyAttributionService =
  new StrategyAttributionService(
    strategyOrchestrator,
  );

export const strategyIntentService =
  new StrategyIntentService();

export const strategyReadModelService =
  new StrategyReadModelService(
    strategyRegistry,
    strategyOrchestrator,
    null,
    strategyIntentService,
  );
