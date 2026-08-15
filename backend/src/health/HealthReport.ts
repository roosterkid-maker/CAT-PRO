import type {
  OpportunityDiagnostics,
} from "../arbitrage/engines/OpportunityEngine";

import type {
  CoinSwitchAdapterDiagnostics,
} from "../exchanges/coinswitch/CoinSwitchAdapter";

import type {
  UnoCoinAdapterDiagnostics,
} from "../exchanges/unocoin/UnoCoinAdapter";

import type {
  TradingReadiness,
} from "./models/TradingReadiness";

export interface ExchangeHealth {
  name:
    string;

  connected:
    boolean;
}

export interface ExchangeQuoteCount {
  exchange:
    string;

  totalQuotes:
    number;

  /**
   * Markets for which the runtime is actively obtaining quantity-bearing
   * depth. This is intentionally separate from the broad ticker catalog.
   */
  quoteBookTargets:
    number;

  executableQuotes:
    number;
}

export type FeedRecoveryPreflightState =
  | "HEALTHY"
  | "DEGRADED"
  | "BLOCKED"
  | "NO_DATA";

export interface CoinSwitchFeedHealth {
  state:
    FeedRecoveryPreflightState;

  connected:
    boolean;

  tickerMarkets:
    number;

  connectedVenues:
    number;

  subscribedMarkets:
    number;

  tickerRefreshes:
    number;

  socketSnapshots:
    number;

  rejectedSnapshots:
    number;

  subscriptionAcknowledgements:
    number;

  socketErrors:
    number;

  lastSnapshotAt:
    number | null;

  lastSnapshotAgeMs:
    number | null;

  cachedQuotes:
    number;

  executableQuotes:
    number;

  reasons:
    string[];

  diagnostics:
    CoinSwitchAdapterDiagnostics;
}

export interface UnoCoinFeedHealth {
  state:
    FeedRecoveryPreflightState;

  connected:
    boolean;

  pairsLoaded:
    number;

  tickersLoaded:
    number;

  subscribedMarkets:
    number;

  successfulPublicReads:
    number;

  failedPublicReads:
    number;

  validBooksPublished:
    number;

  rejectedBooks:
    number;

  quarantinedMarkets:
    number;

  lastSuccessfulReadAt:
    number | null;

  lastSuccessfulReadAgeMs:
    number | null;

  lastBookReceivedAt:
    number | null;

  lastBookReceivedAgeMs:
    number | null;

  lastBookSourceTimestamp:
    number | null;

  cachedQuotes:
    number;

  executableQuotes:
    number;

  reasons:
    string[];

  diagnostics:
    UnoCoinAdapterDiagnostics;
}

export interface ExchangeFeedRecoveryPreflight {
  generatedAt:
    number;

  version:
    "20.9";

  build:
    "4A";

  mode:
    "DIAGNOSTIC_ONLY";

  mutationAllowed:
    false;

  liveExecutionAllowed:
    false;

  coinswitch:
    CoinSwitchFeedHealth | null;

  unocoin:
    UnoCoinFeedHealth | null;

  observations:
    string[];
}

export interface SystemHealthReport {
  timestamp:
    number;

  exchanges:
    ExchangeHealth[];

  cache: {
    cachedQuotes:
      number;

    executableQuotes:
      number;

    quotesByExchange:
      ExchangeQuoteCount[];
  };

  engine: {
    markets:
      number;

    sharedMarkets:
      number;

    generatedPairs:
      number;

    opportunities:
      number;

    diagnostics:
      OpportunityDiagnostics;
  };

  feedRecoveryPreflight:
    ExchangeFeedRecoveryPreflight;

  process: {
    uptimeSeconds:
      number;

    memory: {
      rss:
        number;

      heapUsed:
        number;

      heapTotal:
        number;
    };
  };

  trading:
    TradingReadiness;
}
