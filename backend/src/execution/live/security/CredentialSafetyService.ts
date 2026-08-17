import {
  sensitiveDataRedactor,
} from "../../../core/security/SensitiveDataRedactor";

import {
  binanceCredentialsProvider,
} from "../../../exchanges/binance/api/BinanceCredentialsProvider";

import {
  coinDCXCredentialsProvider,
} from "../../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

import {
  bybitCredentialsProvider,
} from "../../../exchanges/bybit/api/BybitCredentialsProvider";

import {
  coinSwitchCredentialsProvider,
} from "../../../exchanges/coinswitch/api/CoinSwitchCredentialsProvider";

import {
  unoCoinCredentialsProvider,
} from "../../../exchanges/unocoin/api/UnoCoinCredentialsProvider";

export interface ExchangeCredentialSafetyState {
  exchange:
    string;

  configured:
    boolean;

  secretValuesExposed:
    false;

  source:
    "ENVIRONMENT";

  requiredVariables:
    string[];
}

export interface CredentialSafetyReport {
  generatedAt:
    number;

  version:
    "18.0";

  build:
    "10";

  liveTradingEnabled:
    false;

  liveSubmissionAllowed:
    false;

  credentialValuesReturned:
    false;

  logRedactionEnabled:
    true;

  auditRedactionEnabled:
    true;

  exchanges:
    ExchangeCredentialSafetyState[];

  allConfigured:
    boolean;

  redaction:
    ReturnType<
      typeof sensitiveDataRedactor.getDiagnostics
    >;

  blockers:
    string[];

  notes:
    string[];
}

export class CredentialSafetyService {
  getReport():
    CredentialSafetyReport {
    const exchanges:
      ExchangeCredentialSafetyState[] = [
      {
        exchange:
          "binance",

        configured:
          binanceCredentialsProvider
            .isConfigured(),

        secretValuesExposed:
          false,

        source:
          "ENVIRONMENT",

        requiredVariables: [
          "BINANCE_API_KEY",
          "BINANCE_API_SECRET",
        ],
      },

      {
        exchange:
          "coindcx",

        configured:
          coinDCXCredentialsProvider
            .isConfigured(),

        secretValuesExposed:
          false,

        source:
          "ENVIRONMENT",

        requiredVariables: [
          "COINDCX_API_KEY",
          "COINDCX_API_SECRET",
        ],
      },

      {
        exchange:
          "bybit",

        configured:
          bybitCredentialsProvider
            .isConfigured(),

        secretValuesExposed:
          false,

        source:
          "ENVIRONMENT",

        requiredVariables: [
          "BYBIT_API_KEY",
          "BYBIT_API_SECRET",
        ],
      },

      {
        exchange:
          "coinswitch",

        configured:
          coinSwitchCredentialsProvider
            .isConfigured(),

        secretValuesExposed:
          false,

        source:
          "ENVIRONMENT",

        requiredVariables: [
          "COINSWITCH_API_KEY",
          "COINSWITCH_API_SECRET",
        ],
      },

      {
        exchange:
          "unocoin",

        configured:
          unoCoinCredentialsProvider
            .isConfigured(),

        secretValuesExposed:
          false,

        source:
          "ENVIRONMENT",

        requiredVariables: [
          "UNOCOIN_API_TOKEN",
        ],
      },
    ];

    const blockers =
      exchanges
        .filter(
          (
            exchange,
          ) =>
            !exchange.configured,
        )
        .map(
          (
            exchange,
          ) =>
            `${exchange.exchange} API credentials are not fully configured.`,
        );

    const redaction =
      sensitiveDataRedactor
        .getDiagnostics();

    if (
      !redaction
        .selfTestPassed
    ) {
      blockers.push(
        "Sensitive-data redaction self-test failed.",
      );
    }

    return {
      generatedAt:
        Date.now(),

      version:
        "18.0",

      build:
        "10",

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      credentialValuesReturned:
        false,

      logRedactionEnabled:
        true,

      auditRedactionEnabled:
        true,

      exchanges,

      allConfigured:
        exchanges.every(
          (
            exchange,
          ) =>
            exchange.configured,
        ),

      redaction,

      blockers,

      notes: [
        "Credential diagnostics expose configuration state and environment-variable names only; API key/secret values are never returned.",

        "Console errors are sanitized before printing unknown error objects.",

        "Execution audit message, metadata, request and result payloads pass through the sensitive-data redaction boundary.",

        "CoinDCX HTTP response errors are sanitized before being embedded in Error messages.",

        "Signed request values, authorization headers and configured secret environment values are redacted from log-safe output.",

        "CoinSwitch credentials support signed read-only fee evidence; no CoinSwitch order adapter is registered.",

        "UnoCoin uses a bearer token for the allowlisted account-status GET and the audited LIMIT adapter foundation; response details are discarded, and credential verification never grants LIVE or order authority.",

        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }
}

export const credentialSafetyService =
  new CredentialSafetyService();
