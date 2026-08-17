import {
  Router,
} from "express";

import executionValidationRoutes
  from "./executionValidationRoutes";

import {
  executionHealthService,
} from "../health/ExecutionHealthService";

import {
  executionMetricsService,
} from "../metrics/ExecutionMetricsService";

import {
  executionMetricsSnapshotService,
} from "../metrics/ExecutionMetricsSnapshotService";

import tinyLivePreflightRoutes
  from "./tinyLivePreflightRoutes";

import {
  executionReconciliationEngine,
} from "../reconciliation/ExecutionReconciliationEngine";

import {
  executionRecoveryEngine,
} from "../recovery/ExecutionRecoveryEngine";

import executionAlertRoutes
  from "./executionAlertRoutes";

import executionDryRunRoutes
  from "./executionDryRunRoutes";

import executionReconciliationRoutes
  from "./executionReconciliationRoutes";

import executionRecoveryRoutes
  from "./executionRecoveryRoutes";

import executionSecurityRoutes
  from "./executionSecurityRoutes";

import executionSettlementRoutes
  from "./executionSettlementRoutes";

  import v18ProductionReadinessRoutes
  from "./v18ProductionReadinessRoutes";

import fillEngineRoutes
  from "./fillEngineRoutes";

import liveExecutionCoordinatorRoutes
  from "./liveExecutionCoordinatorRoutes";

import orderLifecycleRoutes
  from "./orderLifecycleRoutes";

import executionVerificationRoutes
  from "./executionVerificationRoutes";

export const executionMonitoringRoutes =
  Router();

executionRecoveryEngine
  .start();

executionReconciliationEngine
  .start();

executionMonitoringRoutes.use(
  "/dry-run",
  executionDryRunRoutes,
);

executionMonitoringRoutes.use(
  "/v18-readiness",
  v18ProductionReadinessRoutes,
);

executionMonitoringRoutes.use(
  "/tiny-live",
  tinyLivePreflightRoutes,
);

executionMonitoringRoutes.use(
  "/validation",
  executionValidationRoutes,
);

executionMonitoringRoutes.use(
  "/verification",
  executionVerificationRoutes,
);

executionMonitoringRoutes.use(
  "/coordinator",
  liveExecutionCoordinatorRoutes,
);

executionMonitoringRoutes.use(
  "/lifecycle",
  orderLifecycleRoutes,
);

executionMonitoringRoutes.use(
  "/fills",
  fillEngineRoutes,
);

executionMonitoringRoutes.use(
  "/recovery",
  executionRecoveryRoutes,
);

executionMonitoringRoutes.use(
  "/reconciliation",
  executionReconciliationRoutes,
);

executionMonitoringRoutes.use(
  "/settlement",
  executionSettlementRoutes,
);

/*
 * VERSION 18 BUILD 10
 */
executionMonitoringRoutes.use(
  "/security",
  executionSecurityRoutes,
);

/*
 * VERSION 18 BUILD 11
 */
executionMonitoringRoutes.use(
  "/alerts",
  executionAlertRoutes,
);

executionMonitoringRoutes.get(
  "/metrics",

  (
    _request,
    response,
  ) => {
    response
      .status(
        200,
      )
      .json(
        executionMetricsService
          .getReport(),
      );
  },
);

executionMonitoringRoutes.get(
  "/health",

  (
    _request,
    response,
  ) => {
    const report =
      executionHealthService
        .getReport();

    response
      .status(
        report.status ===
          "UNHEALTHY"
          ? 503
          : 200,
      )
      .json(
        report,
      );
  },
);

executionMonitoringRoutes.get(
  "/analytics",

  (
    request,
    response,
  ) => {
    const limit =
      Number(
        request.query.limit ??
        60,
      );

    response
      .status(
        200,
      )
      .json({
        timestamp:
          Date.now(),

        snapshots:
          executionMetricsSnapshotService
            .getRecent(
              limit,
            ),
      });
  },
);
