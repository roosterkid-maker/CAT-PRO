import "dotenv/config";

import {
  liveExecutionService,
} from "../LiveExecutionService";

async function main(): Promise<void> {
  const exchanges = [
    "coindcx",
    "binance",
    "bybit",
    "coinswitch",
    "unocoin",
  ];

  console.log(
    "\n====================================",
  );

  console.log(
    "LIVE EXECUTION ADAPTER REGISTRATION",
  );

  console.log(
    "====================================",
  );

  const rows =
    exchanges.map(
      (exchange) => {
        const registered =
          liveExecutionService.hasAdapter(
            exchange,
          );

        const adapter =
          registered
            ? liveExecutionService.getAdapter(
                exchange,
              )
            : null;

        const status =
          liveExecutionService
            .getExchangeStatus(
              exchange,
            );

        return {
          Exchange:
            exchange,

          Registered:
            registered,

          AdapterName:
            adapter?.exchange ??
            "missing",

          SupportsPostOnly:
            status.capabilities
              ?.supportsPostOnly ??
            false,

          CredentialsConfigured:
            status
              .credentialsConfigured,

          VerificationState:
            status
              .verificationState,

          AuthenticationVerified:
            status
              .authenticationVerified,

          VerificationFresh:
            status
              .readOnlyVerificationFresh,

          ApiReachable:
            status
              .exchangeApiReachable,

          LiveExecutionEnabled:
            status
              .liveExecutionEnabled,

          StrictConnected:
            status
              .adapterConnected,
        };
      },
    );

  console.table(
    rows,
  );

  const allRegistered =
    rows.every(
      (row) =>
        row.Registered &&
        row.AdapterName ===
          row.Exchange,
    );

  const verificationIsFailClosed =
    rows.every(
      (row) =>
        row.VerificationState ===
        "VERIFIED"
          ? row.AuthenticationVerified &&
            row.ApiReachable &&
            row.VerificationFresh &&
            !row.LiveExecutionEnabled &&
            !row.StrictConnected
          : !row.StrictConnected,
    );

  const postOnlyCapabilityTruth =
    rows.every(
      (row) =>
        row.SupportsPostOnly ===
        (
          row.Exchange ===
            "binance" ||
          row.Exchange ===
            "bybit"
        ),
    );

  const fiveExchangeRegistrationTruth =
    liveExecutionService
      .getRegisteredExchanges()
      .length ===
        exchanges.length &&
    exchanges.every(
      (exchange) =>
        liveExecutionService
          .getMonitoredExchanges()
          .includes(
            exchange,
          ),
    );

  if (
    !allRegistered ||
    !verificationIsFailClosed ||
    !fiveExchangeRegistrationTruth ||
    !postOnlyCapabilityTruth
  ) {
    console.error(
      "\nADAPTER REGISTRATION TEST FAILED.",
    );

    if (
      !verificationIsFailClosed
    ) {
      console.error(
        "An unverified adapter was reported as strictly connected.",
      );
    }

    if (
      !fiveExchangeRegistrationTruth
    ) {
      console.error(
        "The audited five-exchange adapter registry is incomplete or inconsistent.",
      );
    }

    process.exitCode = 1;

    return;
  }

  console.log(
    "\nADAPTER REGISTRATION TEST PASSED.",
  );

  console.log(
    "No order was placed.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Adapter Registration Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);
