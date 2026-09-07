/*
 * Shared prefix for the safety-flag block every persistence/readiness
 * diagnostics route in this module reports. This was previously hand-copied
 * inline into at least five separate route handlers (executionValidationRoutes,
 * orderLifecycleRoutes, executionSettlementRoutes x2, v18ProductionReadinessRoutes)
 * - since liveTradingEnabled/liveSubmissionAllowed are safety-boundary
 * indicators rather than cosmetic metadata, a future change to either flag
 * (or the version string) previously required finding and editing every
 * copy by hand. Callers spread this and add their own endpoint-specific
 * fields (build number, and whatever else that endpoint reports) on top.
 */
export function executionSafetyMetadataPrefix(
  build: string,
): {
  generatedAt: number;
  version: string;
  build: string;
  liveTradingEnabled: false;
  liveSubmissionAllowed: false;
} {
  return {
    generatedAt:
      Date.now(),

    version:
      "18.0",

    build,

    liveTradingEnabled:
      false,

    liveSubmissionAllowed:
      false,
  };
}

/*
 * Shared reader for the confirmation-phrase gate every "authorize/execute/
 * activate/restore/clear" endpoint for Tiny-LIVE and Strategy #1 residual
 * recovery re-implemented inline (10+ call sites across
 * tinyLivePreflightRoutes.ts and executionRecoveryRoutes.ts, each retyping
 * `typeof request.body?.confirmation === "string" ? request.body.confirmation
 * : ""`). This is the sole operator-consent gate in front of endpoints that
 * submit real orders or move real funds - centralizing the extraction means
 * the safety property depends on one audited chokepoint instead of every
 * handler getting the same three lines right individually. The underlying
 * service methods still perform the actual phrase comparison; this only
 * standardizes how the raw field is read off the request body.
 */
export function readConfirmationPhrase(
  body: unknown,
  field = "confirmation",
): string {
  if (
    typeof body !== "object" ||
    body === null
  ) {
    return "";
  }

  const value =
    (
      body as Record<string, unknown>
    )[field];

  return typeof value === "string"
    ? value
    : "";
}
