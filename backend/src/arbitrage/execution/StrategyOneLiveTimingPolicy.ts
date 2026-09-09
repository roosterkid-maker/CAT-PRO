/**
 * Hard action-time quote limits shared by the LIVE funding, stress and
 * last-look boundaries.  This module is deliberately data-only so the
 * LIVE-only entrypoint never has to import historical PAPER evidence stores.
 */
export const STRATEGY_ONE_LIVE_MAXIMUM_BOOK_AGE_MS =
  560 as const;

export const STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS =
  500 as const;

export const STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS =
  500 as const;
