import {
  executionAdapterVerificationService,
  ExecutionAdapterVerificationService,
} from "../verification/ExecutionAdapterVerificationService";

import {
  liveExecutionService,
} from "../LiveExecutionService";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

async function main():
  Promise<void> {
  let now =
    1_000_000;

  const service =
    new ExecutionAdapterVerificationService(
      {
        verificationTtlMs:
          30_000,
      },
      () => now,
    );

  const unverified =
    service.getReadiness(
      "coindcx",
      true,
    );

  assertCondition(
    unverified.verificationState ===
      "CONFIGURED_UNVERIFIED" &&
      !unverified.authenticationVerified &&
      !unverified.exchangeApiReachable,
    "Configured credentials must remain unverified without authenticated read evidence.",
  );

  service.recordSuccess(
    "coindcx",
    "SIGNED_BALANCE_READ",
    now,
  );

  const verified =
    service.getReadiness(
      "coindcx",
      true,
    );

  assertCondition(
    verified.verificationState ===
      "VERIFIED" &&
      verified.authenticationVerified &&
      verified.exchangeApiReachable &&
      verified.readOnlyVerificationFresh &&
      verified.lastVerifiedAt ===
        now &&
      verified.verificationExpiresAt ===
        now +
          30_000,
    "Successful signed read evidence must produce bounded VERIFIED readiness.",
  );

  now +=
    30_001;

  const stale =
    service.getReadiness(
      "coindcx",
      true,
    );

  assertCondition(
    stale.verificationState ===
      "VERIFICATION_STALE" &&
      !stale.authenticationVerified &&
      !stale.exchangeApiReachable &&
      !stale.readOnlyVerificationFresh,
    "Expired verification evidence must fail closed.",
  );

  const syntheticSecret =
    "verification-test-secret";

  process.env
    .VERIFICATION_TEST_API_SECRET =
    syntheticSecret;

  service.recordFailure(
    "binance",
    "SIGNED_BALANCE_READ",
    new Error(
      `Synthetic failure containing ${syntheticSecret}.`,
    ),
    now,
  );

  const failed =
    service.getReadiness(
      "binance",
      true,
    );

  delete process.env
    .VERIFICATION_TEST_API_SECRET;

  assertCondition(
    failed.verificationState ===
      "CONFIGURED_UNVERIFIED" &&
      !failed.authenticationVerified &&
      !failed.exchangeApiReachable &&
      failed.lastVerificationError
        ?.includes(
          "[REDACTED]",
        ) ===
        true &&
      !failed.lastVerificationError
        ?.includes(
          syntheticSecret,
        ),
    "Failed verification must remain unverified and redact configured secrets.",
  );

  service.recordNotConfigured(
    "coindcx",
  );

  const notConfigured =
    service.getReadiness(
      "coindcx",
      false,
    );

  assertCondition(
    notConfigured.verificationState ===
      "NOT_CONFIGURED" &&
      notConfigured.lastVerifiedAt ===
        null &&
      notConfigured.lastVerificationAttemptAt ===
        null,
    "Removing credentials must clear retained verification evidence.",
  );

  const originalCoinDCXApiKey =
    process.env
      .COINDCX_API_KEY;

  const originalCoinDCXApiSecret =
    process.env
      .COINDCX_API_SECRET;

  try {
    process.env
      .COINDCX_API_KEY =
      "synthetic-verification-key";

    process.env
      .COINDCX_API_SECRET =
      "synthetic-verification-secret";

    executionAdapterVerificationService
      .recordSuccess(
        "coindcx",
        "SIGNED_BALANCE_READ",
      );

    const liveStatus =
      liveExecutionService
        .getExchangeStatus(
          "coindcx",
        );

    assertCondition(
      liveStatus.verificationState ===
        "VERIFIED" &&
        liveStatus.authenticationVerified &&
        liveStatus.exchangeApiReachable &&
        !liveStatus.liveExecutionEnabled &&
        !liveStatus.adapterConnected,
      "Fresh authenticated read evidence must not enable LIVE execution capability.",
    );
  } finally {
    executionAdapterVerificationService
      .reset();

    restoreEnvironmentValue(
      "COINDCX_API_KEY",
      originalCoinDCXApiKey,
    );

    restoreEnvironmentValue(
      "COINDCX_API_SECRET",
      originalCoinDCXApiSecret,
    );
  }

  console.log(
    "EXECUTION ADAPTER VERIFICATION TEST PASSED.",
  );

  console.log(
    "No exchange request or order was submitted.",
  );
}

function restoreEnvironmentValue(
  name: string,
  value:
    | string
    | undefined,
): void {
  if (
    value ===
    undefined
  ) {
    delete process.env[
      name
    ];

    return;
  }

  process.env[
    name
  ] =
    value;
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[Execution Adapter Verification Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
