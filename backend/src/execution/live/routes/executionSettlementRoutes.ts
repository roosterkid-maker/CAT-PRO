import {
  Router,
} from "express";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  tradingAccountLedgerService,
} from "../../../trading/account/TradingAccountLedgerService";

import {
  executionSettlementAccountingPersistenceService,
} from "../settlement/ExecutionSettlementAccountingPersistenceService";

import {
  persistentExecutionSettlementService,
} from "../settlement/PersistentExecutionSettlementService";

const router =
  Router();

router.get(
  "/",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        persistentExecutionSettlementService
          .getDiagnostics(),
    });
  },
);

router.get(
  "/persistence",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data: {
        generatedAt:
          Date.now(),

        version:
          "18.0",

        build:
          "6",

        liveTradingEnabled:
          false,

        liveSubmissionAllowed:
          false,

        automaticAccountingReplayAllowed:
          false,

        persistence:
          executionSettlementAccountingPersistenceService
            .getDiagnostics(),
      },
    });
  },
);

/*
 * VERSION 18 BUILD 7
 *
 * GET /api/execution/settlement/account-ledger
 *
 * Persistent internal trading-account state.
 *
 * Exchange balance snapshots are intentionally
 * excluded because they must remain fresh.
 */
router.get(
  "/account-ledger",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data: {
        generatedAt:
          Date.now(),

        version:
          "18.0",

        build:
          "7",

        liveTradingEnabled:
          false,

        liveSubmissionAllowed:
          false,

        persistentAccountReconstruction:
          true,

        settlementAccountingIdempotency:
          true,

        exchangeBalancesRestored:
          false,

        account:
          tradingAccountService
            .getAccount(),

        ledger:
          tradingAccountLedgerService
            .getDiagnostics(),

        notes: [
          "Trading-account state is reconstructed from the append-only account ledger after restart.",

          "Exchange balance snapshots are deliberately not restored; exchanges must be synchronized again.",

          "Settlement accounting uses deterministic settlement:<sessionId> transaction IDs.",

          "A previously applied settlement accounting transaction is not applied to account PnL twice.",

          "LIVE trading and LIVE order submission remain disabled.",
        ],
      },
    });
  },
);

router.post(
  "/:sessionId",
  (
    request,
    response,
  ) => {
    try {
      const settlement =
        persistentExecutionSettlementService
          .settle(
            request.params
              .sessionId,
          );

      response
        .status(
          settlement.status ===
          "SETTLED"
            ? 200
            : 409,
        )
        .json({
          success:
            settlement.status ===
            "SETTLED",

          data:
            settlement,

          accountingTransactionApplied:
            persistentExecutionSettlementService
              .hasPersistentAccountingTransaction(
                request.params
                  .sessionId,
              ),
        });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          400,
        )
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "Unable to settle live execution session.",
        });
    }
  },
);

router.get(
  "/:sessionId",
  (
    request,
    response,
  ) => {
    const settlement =
      persistentExecutionSettlementService
        .getSettlement(
          request.params
            .sessionId,
        );

    if (
      !settlement
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Execution settlement not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        settlement,

      accountingTransactionApplied:
        persistentExecutionSettlementService
          .hasPersistentAccountingTransaction(
            request.params
              .sessionId,
          ),
    });
  },
);

router.get(
  "/:sessionId/audit",
  (
    request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          persistentExecutionSettlementService
            .getAudit(
              request.params
                .sessionId,
            ),
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "Unable to generate execution audit.",
        });
    }
  },
);

export default router;