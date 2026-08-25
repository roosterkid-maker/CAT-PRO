import type {
  StrategyOneDynamicCandidate,
  StrategyOneDynamicDecisionReport,
} from "./StrategyOneDynamicExecutionDecisionManager";

import {
  strategyOneDynamicExecutionDecisionManager,
} from "./StrategyOneDynamicExecutionDecisionManager";

export interface StrategyOneCanonicalPreflightRequest {
  readonly candidate: StrategyOneDynamicCandidate;
  readonly liveRuntimeEnabled: boolean;
  readonly accountModeLive: boolean;
  readonly personalStrategyOneBotEnabled: boolean;
  readonly operatorPreflightConfirmed: boolean;
}

export interface StrategyOneCanonicalPreflightGate {
  readonly code: string;
  readonly passed: boolean;
  readonly reason: string;
}

export interface StrategyOneCanonicalPreflightReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly opportunityId: string;
  readonly routeKey: string;
  readonly approvedForOneTimeArm: boolean;
  readonly dynamicRecommendation: StrategyOneDynamicDecisionReport;
  readonly gates: readonly StrategyOneCanonicalPreflightGate[];
  readonly blockers: readonly string[];
  readonly orderSubmitted: false;
  readonly authorityGranted: false;
}

export class StrategyOneCanonicalLivePreflightService {
  run(
    request: StrategyOneCanonicalPreflightRequest,
  ): StrategyOneCanonicalPreflightReport {
    const recommendation =
      strategyOneDynamicExecutionDecisionManager
        .evaluate(
          request.candidate,
        );

    const executableRecommendation =
      recommendation.decision ===
        "EXECUTE_NOW" ||
      recommendation.decision ===
        "REDUCE_QUANTITY";

    const gates:
      StrategyOneCanonicalPreflightGate[] = [
      gate(
        "LIVE_RUNTIME_ENABLED",
        request.liveRuntimeEnabled,
        "Global LIVE runtime is explicitly enabled.",
      ),
      gate(
        "ACCOUNT_MODE_LIVE",
        request.accountModeLive,
        "Trading account mode is LIVE.",
      ),
      gate(
        "PERSONAL_STRATEGY_ONE_BOT_ENABLED",
        request.personalStrategyOneBotEnabled,
        "Personal Strategy #1 bot is enabled.",
      ),
      gate(
        "OPERATOR_PREFLIGHT_CONFIRMED",
        request.operatorPreflightConfirmed,
        "Exact operator preflight confirmation is present.",
      ),
      gate(
        "EMERGENCY_STOP_CLEAR",
        !request.candidate.emergencyStop,
        "Emergency stop is clear.",
      ),
      gate(
        "DYNAMIC_RECOMMENDATION_EXECUTABLE",
        executableRecommendation,
        executableRecommendation
          ? "Dynamic manager found a current executable quantity; it did not grant authority."
          : `Dynamic manager returned ${recommendation.decision}.`,
      ),
    ];

    const blockers = [
      ...gates
        .filter(
          (item) =>
            !item.passed,
        )
        .map(
          (item) =>
            item.code,
        ),
      ...recommendation.blockers,
    ];

    return Object.freeze({
      schemaVersion:
        "1.0" as const,
      generatedAt:
        request.candidate.now,
      opportunityId:
        request.candidate.opportunityId,
      routeKey:
        recommendation.routeKey,
      approvedForOneTimeArm:
        blockers.length === 0,
      dynamicRecommendation:
        recommendation,
      gates,
      blockers: [
        ...new Set(
          blockers,
        ),
      ],
      orderSubmitted:
        false as const,
      authorityGranted:
        false as const,
    });
  }
}

function gate(
  code: string,
  passed: boolean,
  reason: string,
): StrategyOneCanonicalPreflightGate {
  return Object.freeze({
    code,
    passed,
    reason,
  });
}

export const strategyOneCanonicalLivePreflightService =
  new StrategyOneCanonicalLivePreflightService();
