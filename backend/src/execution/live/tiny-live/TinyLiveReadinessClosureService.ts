import {
  exchangeFleetRegistry,
} from "../../../exchanges/core/ExchangeFleetRegistry";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  productionAlertHistoryService,
} from "../alerts/ProductionAlertHistoryService";

import {
  executionHealthService,
} from "../health/ExecutionHealthService";

import {
  fiveExchangeGoNoGoService,
} from "../readiness/FiveExchangeGoNoGoService";

import {
  credentialSafetyService,
} from "../security/CredentialSafetyService";

import {
  exchangeClockSafetyService,
} from "../time/ExchangeClockSafetyService";

export type TinyLiveClosureOwner =
  | "CODE"
  | "OPERATOR"
  | "EXTERNAL"
  | "EVIDENCE";

export type TinyLiveClosureActionState =
  | "COMPLETE"
  | "ACTION_REQUIRED"
  | "WAITING_FOR_EVIDENCE"
  | "DEFERRED";

export type TinyLiveClosurePriority =
  | "P0"
  | "P1"
  | "P2";

export interface TinyLiveClosureAction {
  key: string;
  title: string;
  owner:
    TinyLiveClosureOwner;
  state:
    TinyLiveClosureActionState;
  priority:
    TinyLiveClosurePriority;
  blocking: boolean;
  summary: string;
  evidence: string[];
  steps: string[];
}

export interface TinyLiveReadinessClosureReport {
  generatedAt: number;
  version: "22.19";
  build:
    "TINY_LIVE_READINESS_CLOSURE";
  mode:
    "READ_ONLY_CLOSURE";
  decision:
    | "BLOCKED"
    | "READY_FOR_AUDITED_ACTIVATION_REVIEW";
  activationReviewEligible:
    boolean;
  summary: {
    prerequisiteActions: number;
    completedPrerequisites: number;
    actionRequired: number;
    waitingForEvidence: number;
    deferred: number;
    progressPercent: number;
  };
  nextAction:
    TinyLiveClosureAction |
    null;
  actions:
    TinyLiveClosureAction[];
  safety: {
    readOnly: true;
    credentialValuesReturned: false;
    automaticAlertResolutionAllowed: false;
    automaticAccountModeChangeAllowed: false;
    automaticLivePromotionAllowed: false;
    liveOrderSubmissionAllowed: false;
    orderSubmissionPerformed: false;
    capitalReserved: false;
  };
  notes: string[];
}

interface FleetSource {
  getReport(): {
    targetExchangeCount: number;
    summary: {
      marketDataConnected: number;
      liveOrderAdapters: number;
    };
    exchanges: Array<{
      exchange: string;
      displayName: string;
      marketData: {
        connected: boolean;
      };
      authenticatedRead: {
        fresh: boolean;
        verificationState: string;
      };
      liveOrderAdapter: {
        adapterRegistered: boolean;
      };
    }>;
  };
}

interface CredentialSource {
  getReport(): {
    allConfigured: boolean;
    credentialValuesReturned: boolean;
    redaction: {
      selfTestPassed: boolean;
    };
    blockers: string[];
  };
}

interface ClockSource {
  getReport(): {
    allServerSynchronizedClocksHealthy: boolean;
    blockers: string[];
    exchanges: Array<{
      exchange: string;
      signedRequestAllowed: boolean;
      health: string;
      reasons: string[];
    }>;
  };
}

interface AlertHistorySource {
  getReport(): {
    persistenceHealthy: boolean;
    livePromotionBlocked: boolean;
    summary: {
      unresolvedCritical: number;
      activeCritical: number;
    };
    alerts: Array<{
      key: string;
      status: string;
      conditionActive: boolean;
      severity: string;
      blocksFutureLiveTrading: boolean;
      title: string;
    }>;
    blockers: string[];
  };
}

interface GoNoGoSource {
  getReport(): {
    activationReviewEligible: boolean;
    exchanges: Array<{
      exchange: string;
      rollingShadowStable: boolean;
      rollingPaperStable: boolean;
      authenticatedReadFresh: boolean;
      signedRequestAllowed: boolean;
      liveAdapterRegistered: boolean;
      blockers: string[];
    }>;
  };
}

interface HealthSource {
  getReport(): {
    status:
      | "HEALTHY"
      | "DEGRADED"
      | "UNHEALTHY"
      | "NO_DATA";
    totalExecutions: number;
    reasons: string[];
  };
}

interface AccountSource {
  getAccount(): {
    mode:
      | "PAPER"
      | "TESTNET"
      | "LIVE";
    enabled: boolean;
    emergencyStop: boolean;
  };
}

export interface TinyLiveReadinessClosureOptions {
  fleetSource?:
    FleetSource;
  credentialSource?:
    CredentialSource;
  clockSource?:
    ClockSource;
  alertHistorySource?:
    AlertHistorySource;
  goNoGoSource?:
    GoNoGoSource;
  healthSource?:
    HealthSource;
  accountSource?:
    AccountSource;
  now?:
    () => number;
}

export class TinyLiveReadinessClosureService {
  private readonly fleetSource:
    FleetSource;
  private readonly credentialSource:
    CredentialSource;
  private readonly clockSource:
    ClockSource;
  private readonly alertHistorySource:
    AlertHistorySource;
  private readonly goNoGoSource:
    GoNoGoSource;
  private readonly healthSource:
    HealthSource;
  private readonly accountSource:
    AccountSource;
  private readonly now:
    () => number;

  constructor(
    options:
      TinyLiveReadinessClosureOptions = {},
  ) {
    this.fleetSource =
      options.fleetSource ??
      exchangeFleetRegistry;
    this.credentialSource =
      options.credentialSource ??
      credentialSafetyService;
    this.clockSource =
      options.clockSource ??
      exchangeClockSafetyService;
    this.alertHistorySource =
      options.alertHistorySource ??
      productionAlertHistoryService;
    this.goNoGoSource =
      options.goNoGoSource ??
      fiveExchangeGoNoGoService;
    this.healthSource =
      options.healthSource ??
      executionHealthService;
    this.accountSource =
      options.accountSource ??
      tradingAccountService;
    this.now =
      options.now ??
      (() =>
        Date.now());
  }

  getReport():
    TinyLiveReadinessClosureReport {
    const fleet =
      this.fleetSource
        .getReport();
    const credentials =
      this.credentialSource
        .getReport();
    const clocks =
      this.clockSource
        .getReport();
    const alertHistory =
      this.alertHistorySource
        .getReport();
    const goNoGo =
      this.goNoGoSource
        .getReport();
    const health =
      this.healthSource
        .getReport();
    const account =
      this.accountSource
        .getAccount();
    const actions:
      TinyLiveClosureAction[] = [];

    const disconnectedMarkets =
      fleet.exchanges
        .filter(
          (exchange) =>
            !exchange.marketData
              .connected,
        )
        .map(
          (exchange) =>
            exchange.displayName,
        );

    actions.push(
      this.action({
        key:
          "MARKET_DATA_FLEET",
        title:
          "Keep all target market-data feeds connected",
        owner:
          "EXTERNAL",
        state:
          fleet.summary
            .marketDataConnected ===
          fleet.targetExchangeCount
            ? "COMPLETE"
            : "ACTION_REQUIRED",
        priority:
          "P0",
        summary:
          String(
            fleet.summary
              .marketDataConnected,
          ) +
          "/" +
          String(
            fleet.targetExchangeCount,
          ) +
          " target market-data feeds are connected.",
        evidence:
          disconnectedMarkets.length ===
          0
            ? [
                "No target exchange is currently disconnected.",
              ]
            : disconnectedMarkets.map(
                (exchange) =>
                  exchange +
                  " market data is disconnected.",
              ),
        steps: [
          "Repair only the failing public feed or adapter.",
          "Preserve strict freshness, depth and crossed-book validation.",
          "Observe the recovered feed through at least one normal refresh window.",
        ],
      }),
    );

    const credentialReady =
      credentials.allConfigured &&
      credentials.redaction
        .selfTestPassed &&
      !credentials
        .credentialValuesReturned &&
      credentials.blockers
        .length ===
        0;

    actions.push(
      this.action({
        key:
          "CREDENTIAL_CONFIGURATION",
        title:
          "Configure and protect exchange credentials",
        owner:
          "OPERATOR",
        state:
          credentialReady
            ? "COMPLETE"
            : "ACTION_REQUIRED",
        priority:
          "P0",
        summary:
          credentialReady
            ? "All target credential slots are configured and redaction self-test passes."
            : "One or more credential or redaction checks are blocked.",
        evidence:
          credentials.blockers
            .length >
          0
            ? credentials.blockers
            : [
                "Credential values are not returned by this report.",
              ],
        steps: [
          "Store real values only in backend/.env, never in .env.example.",
          "Rotate any credential shown in screenshots, logs or chat.",
          "Restart the backend and verify credential safety without exposing values.",
        ],
      }),
    );

    const unverifiedReads =
      fleet.exchanges
        .filter(
          (exchange) =>
            !exchange
              .authenticatedRead
              .fresh,
        );

    actions.push(
      this.action({
        key:
          "AUTHENTICATED_READ_ACCESS",
        title:
          "Verify fresh authenticated read access",
        owner:
          "EXTERNAL",
        state:
          unverifiedReads
            .length ===
          0
            ? "COMPLETE"
            : "ACTION_REQUIRED",
        priority:
          "P0",
        summary:
          String(
            fleet.targetExchangeCount -
            unverifiedReads.length,
          ) +
          "/" +
          String(
            fleet.targetExchangeCount,
          ) +
          " exchanges have fresh verified authenticated-read evidence.",
        evidence:
          unverifiedReads.length ===
          0
            ? [
                "All target authenticated-read checks are fresh.",
              ]
            : unverifiedReads.map(
                (exchange) =>
                  exchange.displayName +
                  ": " +
                  exchange.authenticatedRead
                    .verificationState +
                  ".",
              ),
        steps: [
          "Check exchange-side API permissions, IP allowlist and key status.",
          "Use read-only verification before enabling any trading permission.",
          "Never bypass a failed signed account or balance read.",
        ],
      }),
    );

    const unsafeClocks =
      clocks.exchanges
        .filter(
          (exchange) =>
            !exchange
              .signedRequestAllowed,
        );

    actions.push(
      this.action({
        key:
          "SIGNED_REQUEST_CLOCK_SAFETY",
        title:
          "Maintain safe signed-request clocks",
        owner:
          "EXTERNAL",
        state:
          clocks
            .allServerSynchronizedClocksHealthy &&
          unsafeClocks.length ===
            0 &&
          clocks.blockers.length ===
            0
            ? "COMPLETE"
            : "ACTION_REQUIRED",
        priority:
          "P0",
        summary:
          unsafeClocks.length ===
          0
            ? "All signed-request clocks currently allow authenticated requests."
            : String(
                unsafeClocks.length,
              ) +
              " exchange clock(s) currently block signed requests.",
        evidence: [
          ...clocks.blockers,
          ...unsafeClocks.map(
            (exchange) =>
              exchange.exchange +
              ": " +
              exchange.health +
              (
                exchange.reasons
                  .length >
                0
                  ? " — " +
                    exchange.reasons
                      .join(
                        " | ",
                      )
                  : ""
              ) +
              ".",
          ),
        ],
        steps: [
          "Keep the Windows system clock synchronized.",
          "Allow backend monitors to obtain fresh server-time evidence.",
          "Do not widen receive windows or offset limits to hide clock failures.",
        ],
      }),
    );

    const unresolvedCritical =
      alertHistory.alerts
        .filter(
          (alert) =>
            alert.severity ===
              "CRITICAL" &&
            alert.status !==
              "RESOLVED" &&
            alert
              .blocksFutureLiveTrading,
        );
    const activeCritical =
      unresolvedCritical
        .filter(
          (alert) =>
            alert.conditionActive,
        );
    const clearedCritical =
      unresolvedCritical
        .filter(
          (alert) =>
            !alert
              .conditionActive,
        );
    const alertsReady =
      alertHistory
        .persistenceHealthy &&
      unresolvedCritical.length ===
        0 &&
      !alertHistory
        .livePromotionBlocked;

    actions.push(
      this.action({
        key:
          "PRODUCTION_ALERT_LIFECYCLE",
        title:
          "Clear and explicitly resolve LIVE-blocking alerts",
        owner:
          "OPERATOR",
        state:
          alertsReady
            ? "COMPLETE"
            : "ACTION_REQUIRED",
        priority:
          "P0",
        summary:
          alertsReady
            ? "No unresolved CRITICAL alert blocks future LIVE promotion."
            : String(
                activeCritical.length,
              ) +
              " active and " +
              String(
                clearedCritical.length,
              ) +
              " cleared-but-unresolved CRITICAL alert(s) remain.",
        evidence: [
          ...activeCritical.map(
            (alert) =>
              alert.key +
              ": underlying condition is still active.",
          ),
          ...clearedCritical.map(
            (alert) =>
              alert.key +
              ": condition cleared; explicit operator resolution remains required.",
          ),
          ...(
            alertHistory
              .persistenceHealthy
              ? []
              : [
                  "Production alert-history persistence is unhealthy.",
                ]
          ),
        ],
        steps: [
          "Fix every active CRITICAL condition first.",
          "Review cleared CRITICAL history in Alerts and resolve it with an explicit note.",
          "Never auto-resolve or delete alert history to make readiness green.",
        ],
      }),
    );

    const missingAdapters =
      fleet.exchanges
        .filter(
          (exchange) =>
            !exchange
              .liveOrderAdapter
              .adapterRegistered,
        )
        .map(
          (exchange) =>
            exchange.displayName,
        );

    actions.push(
      this.action({
        key:
          "LIVE_ORDER_ADAPTER_FOUNDATION",
        title:
          "Complete audited LIVE order-adapter foundation",
        owner:
          "CODE",
        state:
          missingAdapters.length ===
          0
            ? "COMPLETE"
            : "ACTION_REQUIRED",
        priority:
          "P1",
        summary:
          String(
            fleet.summary
              .liveOrderAdapters,
          ) +
          "/" +
          String(
            fleet.targetExchangeCount,
          ) +
          " target LIVE order adapters are registered.",
        evidence:
          missingAdapters.length ===
          0
            ? [
                "Every target exchange has a registered order adapter foundation.",
              ]
            : missingAdapters.map(
                (exchange) =>
                  exchange +
                  ": LIVE order adapter is not implemented.",
              ),
        steps: [
          "Implement only from verified official exchange order contracts.",
          "Add test-order or dry-run validation before any real submission path.",
          "Keep every new adapter disabled and disconnected by default.",
        ],
      }),
    );

    const unstableRolling =
      goNoGo.exchanges
        .filter(
          (exchange) =>
            !exchange
              .rollingShadowStable ||
            !exchange
              .rollingPaperStable,
        );

    actions.push(
      this.action({
        key:
          "ROLLING_SHADOW_PAPER_EVIDENCE",
        title:
          "Accumulate stable rolling SHADOW and PAPER evidence",
        owner:
          "EVIDENCE",
        state:
          unstableRolling.length ===
          0
            ? "COMPLETE"
            : "WAITING_FOR_EVIDENCE",
        priority:
          "P1",
        summary:
          String(
            goNoGo.exchanges
              .length -
            unstableRolling.length,
          ) +
          "/" +
          String(
            goNoGo.exchanges
              .length,
          ) +
          " exchanges satisfy rolling SHADOW and PAPER stability.",
        evidence:
          unstableRolling.map(
            (exchange) =>
              exchange.exchange +
              ": SHADOW=" +
              (
                exchange
                  .rollingShadowStable
                  ? "stable"
                  : "not stable"
              ) +
              ", PAPER=" +
              (
                exchange
                  .rollingPaperStable
                  ? "stable"
                  : "not stable"
              ) +
              ".",
          ),
        steps: [
          "Keep the backend running through the configured observation window.",
          "Fix genuine feed or rule gaps that prevent evidence collection.",
          "Do not lower availability thresholds or fabricate historical observations.",
        ],
      }),
    );

    const prerequisites =
      [
        ...actions,
      ];
    const prerequisitesComplete =
      prerequisites.every(
        (action) =>
          action.state ===
          "COMPLETE",
      );

    const executionEvidenceReady =
      health.status ===
        "HEALTHY" &&
      health.totalExecutions >
        0;

    const postActivationHealth =
      this.action({
        key:
          "EXECUTION_HEALTH_EVIDENCE",
        title:
          "Validate post-activation execution health",
        owner:
          "EVIDENCE",
        state:
          executionEvidenceReady
            ? "COMPLETE"
            : "DEFERRED",
        priority:
          "P2",
        summary:
          executionEvidenceReady
            ? "Execution health is HEALTHY with " +
              String(
                health.totalExecutions,
              ) +
              " recorded execution(s)."
            : "Real execution health is " +
              health.status +
              " with " +
              String(
                health.totalExecutions,
              ) +
              " execution(s); this evidence can exist only after an explicitly authorized Tiny-LIVE attempt.",
        evidence:
          health.reasons
            .slice(
              0,
              10,
            ),
        steps: [
          "After explicit route-specific Tiny-LIVE authorization, measure the real order result and reconciliation evidence.",
          "Require healthy fills, bounded failures/timeouts and clean accounting before any scale increase.",
          "Do not count SHADOW, PAPER, dry-run, synthetic or unattributed records as real execution health.",
        ],
      });

    actions.push({
      ...postActivationHealth,
      blocking:
        false,
    });

    actions.push(
      this.action({
        key:
          "FINAL_ACCOUNT_ACTIVATION",
        title:
          "Perform final audited Tiny-LIVE activation review",
        owner:
          "OPERATOR",
        state:
          prerequisitesComplete
            ? account.mode ===
                "LIVE" &&
              goNoGo
                .activationReviewEligible
              ? "COMPLETE"
              : "ACTION_REQUIRED"
            : "DEFERRED",
        priority:
          "P2",
        summary:
          prerequisitesComplete
            ? "Technical and evidence prerequisites are complete; explicit operator activation review is required."
            : "Account remains " +
              account.mode +
              "; activation is deferred until every prerequisite is complete.",
        evidence: [
          "accountMode=" +
          account.mode,
          "accountEnabled=" +
          String(
            account.enabled,
          ),
          "emergencyStop=" +
          String(
            account.emergencyStop,
          ),
          "goNoGoEligible=" +
          String(
            goNoGo
              .activationReviewEligible,
          ),
        ],
        steps: [
          "Run the ₹100–₹500 route-specific Tiny-LIVE preflight.",
          "Require explicit operator confirmation after fresh balance and last-look review.",
          "Do not automatically change account mode, enable LIVE flags or submit an order.",
        ],
      }),
    );

    const completedPrerequisites =
      prerequisites.filter(
        (action) =>
          action.state ===
          "COMPLETE",
      ).length;
    const activationReviewEligible =
      prerequisitesComplete;
    const nextAction =
      actions.find(
        (action) =>
          action.state ===
          "ACTION_REQUIRED",
      ) ??
      actions.find(
        (action) =>
          action.state ===
          "WAITING_FOR_EVIDENCE",
      ) ??
      actions.find(
        (action) =>
          action.state ===
          "DEFERRED",
      ) ??
      null;

    return {
      generatedAt:
        this.now(),
      version:
        "22.19",
      build:
        "TINY_LIVE_READINESS_CLOSURE",
      mode:
        "READ_ONLY_CLOSURE",
      decision:
        activationReviewEligible
          ? "READY_FOR_AUDITED_ACTIVATION_REVIEW"
          : "BLOCKED",
      activationReviewEligible,
      summary: {
        prerequisiteActions:
          prerequisites.length,
        completedPrerequisites,
        actionRequired:
          actions.filter(
            (action) =>
              action.state ===
              "ACTION_REQUIRED",
          ).length,
        waitingForEvidence:
          actions.filter(
            (action) =>
              action.state ===
              "WAITING_FOR_EVIDENCE",
          ).length,
        deferred:
          actions.filter(
            (action) =>
              action.state ===
              "DEFERRED",
          ).length,
        progressPercent:
          prerequisites.length ===
          0
            ? 0
            : Number(
                (
                  completedPrerequisites /
                  prerequisites.length *
                  100
                ).toFixed(
                  2,
                ),
              ),
      },
      nextAction,
      actions,
      safety: {
        readOnly:
          true,
        credentialValuesReturned:
          false,
        automaticAlertResolutionAllowed:
          false,
        automaticAccountModeChangeAllowed:
          false,
        automaticLivePromotionAllowed:
          false,
        liveOrderSubmissionAllowed:
          false,
        orderSubmissionPerformed:
          false,
        capitalReserved:
          false,
      },
      notes: [
        "V22.19 converts existing readiness evidence into one ordered closure plan; it does not replace any safety gate.",
        "Action ownership distinguishes code work, operator work, external exchange state and time-based evidence.",
        "A cleared CRITICAL alert remains blocked until the operator explicitly resolves its persisted lifecycle record.",
        "Missing LIVE adapters remain code blockers; authenticated reads are never treated as order capability.",
        "Real execution-health metrics are a post-activation scale gate, not a prerequisite for reviewing the first explicitly authorized Tiny-LIVE attempt.",
        "Reclassifying the execution-health stage does not create LIVE authority; route preflight, funding, account controls and explicit operator confirmation remain mandatory.",
        "No threshold, validator, credential check, clock limit or readiness gate is weakened.",
        "LIVE trading, automatic promotion, capital reservation and exchange order submission remain disabled.",
      ],
    };
  }

  private action(
    input:
      Omit<
        TinyLiveClosureAction,
        "blocking"
      >,
  ):
    TinyLiveClosureAction {
    return {
      ...input,
      blocking:
        input.state !==
        "COMPLETE",
      evidence: [
        ...new Set(
          input.evidence
            .filter(
              (value) =>
                value
                  .trim()
                  .length >
                0,
            ),
        ),
      ],
    };
  }
}

export const tinyLiveReadinessClosureService =
  new TinyLiveReadinessClosureService();
