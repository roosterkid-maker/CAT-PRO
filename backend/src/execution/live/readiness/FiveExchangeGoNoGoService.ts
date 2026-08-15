import {
  productionSafetyControllerService,
} from "../../../automation/services/ProductionSafetyControllerService";

import {
  CAT_PRO_TARGET_EXCHANGES,
  type CatProTargetExchange,
} from "../../../exchanges/core/ExchangeFleetRegistry";

import {
  fiveExchangeReadinessObservationService,
} from "../../../exchanges/services/FiveExchangeReadinessObservationService";

import {
  productionAlertHistoryService,
} from "../alerts/ProductionAlertHistoryService";

import {
  liveExecutionService,
} from "../LiveExecutionService";

import {
  executionRestartRecoveryGateService,
} from "../recovery/ExecutionRestartRecoveryGateService";

import {
  credentialSafetyService,
} from "../security/CredentialSafetyService";

import {
  exchangeClockSafetyService,
} from "../time/ExchangeClockSafetyService";

import {
  v18ProductionReadinessService,
} from "./V18ProductionReadinessService";

export type FiveExchangeGoNoGoGateState =
  | "PASS"
  | "BLOCKED";

export interface FiveExchangeGoNoGoGate {
  key: string;

  category:
    | "ROLLING_EVIDENCE"
    | "V18_HARDENING"
    | "PRODUCTION_SAFETY"
    | "RECOVERY"
    | "ALERTING"
    | "CREDENTIALS"
    | "AUTHENTICATED_READ"
    | "CLOCK"
    | "EXECUTION_ADAPTER";

  state:
    FiveExchangeGoNoGoGateState;

  requiredForActivationReview:
    boolean;

  message: string;

  reasons: string[];
}

export interface FiveExchangeGoNoGoExchange {
  exchange: CatProTargetExchange;

  rollingShadowStable: boolean;

  rollingPaperStable: boolean;

  credentialsMonitored: boolean;

  credentialsConfigured: boolean;

  authenticatedReadFresh: boolean;

  clockMonitored: boolean;

  signedRequestAllowed: boolean;

  liveAdapterRegistered: boolean;

  liveAdapterConnected: false;

  blockers: string[];
}

export interface FiveExchangeGoNoGoReport {
  generatedAt: number;

  version: "19.35";

  mode:
    "FIVE_EXCHANGE_TINY_LIVE_GO_NO_GO";

  decision:
    | "NO_GO"
    | "GO_FOR_AUDITED_ACTIVATION_REVIEW";

  activationReviewEligible:
    boolean;

  targetExchangeCount: 5;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticPromotionAllowed: false;

  orderSubmissionPerformed: false;

  capitalReserved: false;

  summary: {
    totalGates: number;

    passed: number;

    blocked: number;

    requiredGates: number;

    requiredPassed: number;

    requiredBlocked: number;

    postActivationBlocked: number;

    exchangesWithoutBlockers: number;
  };

  gates:
    FiveExchangeGoNoGoGate[];

  exchanges:
    FiveExchangeGoNoGoExchange[];

  blockers: string[];

  postActivationBlockers:
    string[];

  sourceGeneratedAt: {
    rollingReadiness: number;

    v18Readiness: number;

    productionSafety: number;

    restartRecovery: number;

    alertHistory: number;

    credentialSafety: number;

    clockSafety: number;
  };

  notes: string[];
}

type RollingSource =
  Pick<
    typeof fiveExchangeReadinessObservationService,
    "getReport"
  >;

type V18Source =
  Pick<
    typeof v18ProductionReadinessService,
    "getReport"
  >;

type ProductionSafetySource =
  Pick<
    typeof productionSafetyControllerService,
    "getDiagnostics"
  >;

type RecoverySource =
  Pick<
    typeof executionRestartRecoveryGateService,
    "getReport"
  >;

type AlertSource =
  Pick<
    typeof productionAlertHistoryService,
    "getReport"
  >;

type CredentialSource =
  Pick<
    typeof credentialSafetyService,
    "getReport"
  >;

type ClockSource =
  Pick<
    typeof exchangeClockSafetyService,
    "getReport"
  >;

type LiveSource =
  Pick<
    typeof liveExecutionService,
    | "getMonitoredExchangeStatus"
    | "getExchangeStatuses"
  >;

export interface FiveExchangeGoNoGoOptions {
  rollingSource?: RollingSource;

  v18Source?: V18Source;

  productionSafetySource?:
    ProductionSafetySource;

  recoverySource?: RecoverySource;

  alertSource?: AlertSource;

  credentialSource?: CredentialSource;

  clockSource?: ClockSource;

  liveSource?: LiveSource;

  now?: () => number;
}

export class FiveExchangeGoNoGoService {
  private readonly rollingSource:
    RollingSource;

  private readonly v18Source:
    V18Source;

  private readonly productionSafetySource:
    ProductionSafetySource;

  private readonly recoverySource:
    RecoverySource;

  private readonly alertSource:
    AlertSource;

  private readonly credentialSource:
    CredentialSource;

  private readonly clockSource:
    ClockSource;

  private readonly liveSource:
    LiveSource;

  private readonly now:
    () => number;

  constructor(
    options:
      FiveExchangeGoNoGoOptions = {},
  ) {
    this.rollingSource =
      options.rollingSource ??
      fiveExchangeReadinessObservationService;

    this.v18Source =
      options.v18Source ??
      v18ProductionReadinessService;

    this.productionSafetySource =
      options.productionSafetySource ??
      productionSafetyControllerService;

    this.recoverySource =
      options.recoverySource ??
      executionRestartRecoveryGateService;

    this.alertSource =
      options.alertSource ??
      productionAlertHistoryService;

    this.credentialSource =
      options.credentialSource ??
      credentialSafetyService;

    this.clockSource =
      options.clockSource ??
      exchangeClockSafetyService;

    this.liveSource =
      options.liveSource ??
      liveExecutionService;

    this.now =
      options.now ??
      Date.now;
  }

  getReport():
    FiveExchangeGoNoGoReport {
    const rolling =
      this.rollingSource
        .getReport();

    const v18 =
      this.v18Source
        .getReport();

    const productionSafety =
      this.productionSafetySource
        .getDiagnostics();

    const recovery =
      this.recoverySource
        .getReport();

    const alerts =
      this.alertSource
        .getReport();

    const credentials =
      this.credentialSource
        .getReport();

    const clocks =
      this.clockSource
        .getReport();

    const liveAdapters =
      this.liveSource
        .getExchangeStatuses(
          CAT_PRO_TARGET_EXCHANGES,
        );

    const authenticatedReads =
      CAT_PRO_TARGET_EXCHANGES
        .map(
          (exchange) =>
            this.liveSource
              .getMonitoredExchangeStatus(
                exchange,
              ),
        );

    const exchanges:
      FiveExchangeGoNoGoExchange[] =
      CAT_PRO_TARGET_EXCHANGES
        .map(
          (exchange) => {
            const rollingExchange =
              rolling.exchanges.find(
                (item) =>
                  item.exchange ===
                  exchange,
              );

            const credential =
              credentials.exchanges.find(
                (item) =>
                  item.exchange ===
                  exchange,
              );

            const authenticatedRead =
              authenticatedReads.find(
                (item) =>
                  item.exchange ===
                  exchange,
              );

            const clock =
              clocks.exchanges.find(
                (item) =>
                  item.exchange ===
                  exchange,
              );

            const adapter =
              liveAdapters.find(
                (item) =>
                  item.exchange ===
                  exchange,
              );

            const blockers:
              string[] = [];

            if (
              !rollingExchange
                ?.rollingShadowStable
            ) {
              blockers.push(
                "Rolling shadow readiness is not proven.",
              );
            }

            if (
              !rollingExchange
                ?.rollingPaperStable
            ) {
              blockers.push(
                "Rolling paper readiness is not proven.",
              );
            }

            if (!credential) {
              blockers.push(
                "Credential safety monitoring is not implemented for this exchange.",
              );
            } else if (
              !credential.configured
            ) {
              blockers.push(
                "Credentials are not configured.",
              );
            }

            if (
              !authenticatedRead
                ?.readOnlyVerificationFresh ||
              !authenticatedRead
                .authenticationVerified ||
              !authenticatedRead
                .exchangeApiReachable
            ) {
              blockers.push(
                "Fresh authenticated read-only exchange access is not verified.",
              );
            }

            if (!clock) {
              blockers.push(
                "Signed-request clock safety is not monitored for this exchange.",
              );
            } else if (
              !clock.signedRequestAllowed
            ) {
              blockers.push(
                `Signed requests are blocked: ${clock.reasons.join(" | ") || clock.health}.`,
              );
            }

            if (
              !adapter
                ?.adapterRegistered
            ) {
              blockers.push(
                "A LIVE order adapter is not registered.",
              );
            }

            return {
              exchange,
              rollingShadowStable:
                rollingExchange
                  ?.rollingShadowStable ??
                false,
              rollingPaperStable:
                rollingExchange
                  ?.rollingPaperStable ??
                false,
              credentialsMonitored:
                credential !==
                undefined,
              credentialsConfigured:
                credential
                  ?.configured ??
                false,
              authenticatedReadFresh:
                Boolean(
                  authenticatedRead
                    ?.readOnlyVerificationFresh &&
                  authenticatedRead
                    .authenticationVerified &&
                  authenticatedRead
                    .exchangeApiReachable,
                ),
              clockMonitored:
                clock !==
                undefined,
              signedRequestAllowed:
                clock
                  ?.signedRequestAllowed ??
                false,
              liveAdapterRegistered:
                adapter
                  ?.adapterRegistered ??
                false,
              liveAdapterConnected:
                false,
              blockers: [
                ...new Set(
                  blockers,
                ),
              ],
            };
          },
        );

    const gates:
      FiveExchangeGoNoGoGate[] =
      [];

    this.addGate(
      gates,
      "ROLLING_FIVE_EXCHANGE_READINESS",
      "ROLLING_EVIDENCE",
      rolling.status ===
        "STABLE" &&
        rolling.allFiveRollingShadowStable &&
        rolling.allFiveRollingPaperStable,
      "All five exchanges have sustained paper and shadow readiness evidence.",
      rolling.blockers,
    );

    this.addGate(
      gates,
      "V18_HARDENING_ACCEPTED",
      "V18_HARDENING",
      v18.v18HardeningAccepted,
      "V18 production hardening is accepted.",
      v18.blockers
        .v18Acceptance,
    );

    this.addGate(
      gates,
      "V18_TINY_LIVE_OPERATIONAL_READINESS",
      "V18_HARDENING",
      v18.tinyLiveOperationalReady,
      "V18 Tiny-LIVE operational gates pass.",
      v18.blockers
        .tinyLive,
      false,
    );

    this.addGate(
      gates,
      "PRODUCTION_SAFETY_SAFE",
      "PRODUCTION_SAFETY",
      productionSafety.status ===
        "SAFE" &&
        productionSafety.blockers.length ===
          0 &&
        productionSafety.emergencyReasons.length ===
          0,
      "Production-safety controller reports SAFE with no blockers.",
      [
        ...productionSafety.blockers,
        ...productionSafety.emergencyReasons,
      ],
      false,
    );

    this.addGate(
      gates,
      "RESTART_RECOVERY_CLEAN",
      "RECOVERY",
      recovery.classification ===
        "CLEAN" &&
        recovery.allowNewLivePreparation,
      "Restart-recovery evidence is CLEAN.",
      recovery.blockers,
    );

    this.addGate(
      gates,
      "ALERT_HISTORY_CLEAR",
      "ALERTING",
      alerts.persistenceHealthy &&
        !alerts.livePromotionBlocked &&
        alerts.summary
          .unresolvedCritical ===
          0,
      "Persistent alert history is healthy with no unresolved CRITICAL blocker.",
      alerts.blockers,
    );

    this.addGate(
      gates,
      "FIVE_EXCHANGE_CREDENTIAL_SAFETY",
      "CREDENTIALS",
      exchanges.every(
        (exchange) =>
          exchange.credentialsMonitored &&
          exchange.credentialsConfigured,
      ) &&
        credentials.redaction
          .selfTestPassed,
      "All five exchanges have monitored credential configuration and healthy redaction.",
      exchanges
        .filter(
          (exchange) =>
            !exchange.credentialsMonitored ||
            !exchange.credentialsConfigured,
        )
        .map(
          (exchange) =>
            `${exchange.exchange}: credential monitoring/configuration is incomplete.`,
        ),
    );

    this.addGate(
      gates,
      "FIVE_EXCHANGE_AUTHENTICATED_READ",
      "AUTHENTICATED_READ",
      exchanges.every(
        (exchange) =>
          exchange.authenticatedReadFresh,
      ),
      "All five exchanges have fresh verified authenticated read-only access.",
      exchanges
        .filter(
          (exchange) =>
            !exchange.authenticatedReadFresh,
        )
        .map(
          (exchange) =>
            `${exchange.exchange}: authenticated read-only evidence is not fresh and verified.`,
        ),
    );

    this.addGate(
      gates,
      "FIVE_EXCHANGE_CLOCK_SAFETY",
      "CLOCK",
      exchanges.every(
        (exchange) =>
          exchange.clockMonitored &&
          exchange.signedRequestAllowed,
      ),
      "All five exchanges have monitored signed-request clock safety.",
      exchanges
        .filter(
          (exchange) =>
            !exchange.clockMonitored ||
            !exchange.signedRequestAllowed,
        )
        .map(
          (exchange) =>
            `${exchange.exchange}: signed-request clock safety is incomplete or blocked.`,
        ),
    );

    this.addGate(
      gates,
      "FIVE_EXCHANGE_LIVE_ADAPTER_FOUNDATION",
      "EXECUTION_ADAPTER",
      exchanges.every(
        (exchange) =>
          exchange.liveAdapterRegistered,
      ),
      "All five exchanges have a registered LIVE adapter foundation.",
      exchanges
        .filter(
          (exchange) =>
            !exchange.liveAdapterRegistered,
        )
        .map(
          (exchange) =>
            `${exchange.exchange}: LIVE adapter is not registered.`,
        ),
    );

    const blockedGates =
      gates
        .filter(
          (gate) =>
            gate.state ===
            "BLOCKED",
        );

    const requiredGates =
      gates.filter(
        (gate) =>
          gate.requiredForActivationReview,
      );

    const requiredBlockedGates =
      blockedGates.filter(
        (gate) =>
          gate.requiredForActivationReview,
      );

    const postActivationBlockedGates =
      blockedGates.filter(
        (gate) =>
          !gate.requiredForActivationReview,
      );

    const toBlockers =
      (
        source:
          readonly FiveExchangeGoNoGoGate[],
      ) =>
        source
        .flatMap(
          (gate) =>
            gate.reasons.length >
              0
              ? gate.reasons.map(
                  (reason) =>
                    `${gate.key}: ${reason}`,
                )
              : [
                  `${gate.key}: ${gate.message}`,
                ],
        );

    const blockers =
      toBlockers(
        requiredBlockedGates,
      );

    const postActivationBlockers =
      toBlockers(
        postActivationBlockedGates,
      );

    const activationReviewEligible =
      requiredBlockedGates.length ===
      0;

    return {
      generatedAt:
        this.now(),
      version:
        "19.35",
      mode:
        "FIVE_EXCHANGE_TINY_LIVE_GO_NO_GO",
      decision:
        activationReviewEligible
          ? "GO_FOR_AUDITED_ACTIVATION_REVIEW"
          : "NO_GO",
      activationReviewEligible,
      targetExchangeCount:
        5,
      liveTradingEnabled:
        false,
      liveSubmissionAllowed:
        false,
      automaticPromotionAllowed:
        false,
      orderSubmissionPerformed:
        false,
      capitalReserved:
        false,
      summary: {
        totalGates:
          gates.length,
        passed:
          gates.filter(
            (gate) =>
              gate.state ===
              "PASS",
          ).length,
        blocked:
          blockedGates.length,
        requiredGates:
          requiredGates.length,
        requiredPassed:
          requiredGates.length -
          requiredBlockedGates.length,
        requiredBlocked:
          requiredBlockedGates.length,
        postActivationBlocked:
          postActivationBlockedGates.length,
        exchangesWithoutBlockers:
          exchanges.filter(
            (exchange) =>
              exchange.blockers.length ===
              0,
          ).length,
      },
      gates,
      exchanges,
      blockers: [
        ...new Set(
          blockers,
        ),
      ],
      postActivationBlockers: [
        ...new Set(
          postActivationBlockers,
        ),
      ],
      sourceGeneratedAt: {
        rollingReadiness:
          rolling.generatedAt,
        v18Readiness:
          v18.generatedAt,
        productionSafety:
          productionSafety.generatedAt,
        restartRecovery:
          recovery.generatedAt,
        alertHistory:
          alerts.generatedAt,
        credentialSafety:
          credentials.generatedAt,
        clockSafety:
          clocks.generatedAt,
      },
      notes: [
        "GO_FOR_AUDITED_ACTIVATION_REVIEW is not LIVE authorization and cannot arm or promote trading.",
        "V18 operational readiness and full production-safety SAFE status are post-activation gates because both require explicit LIVE state and real execution evidence; they remain visible and fail-closed but cannot create a circular pre-activation dependency.",
        "Every post-activation gate must pass before scaling beyond the first explicitly authorized Tiny-LIVE evidence tier.",
        "NO_GO identifies current evidence gaps; it is not rewritten into a positive decision.",
        "Credential values are never included in this report.",
        "This evaluation submits no order, reserves no capital, and creates no LIVE session.",
        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }

  private addGate(
    gates:
      FiveExchangeGoNoGoGate[],
    key: string,
    category:
      FiveExchangeGoNoGoGate["category"],
    passed: boolean,
    message: string,
    reasons:
      readonly string[],
    requiredForActivationReview =
      true,
  ): void {
    gates.push({
      key,
      category,
      state:
        passed
          ? "PASS"
          : "BLOCKED",
      requiredForActivationReview:
        requiredForActivationReview,
      message,
      reasons:
        passed
          ? []
          : reasons.length >
              0
            ? [
                ...reasons,
              ]
            : [
                message,
              ],
    });
  }
}

export const fiveExchangeGoNoGoService =
  new FiveExchangeGoNoGoService();
