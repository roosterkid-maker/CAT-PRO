# CAT PRO LIVE-only runtime

This deployment profile retires PAPER automation, Shadow strategy workers and
Tiny-LIVE arm/lease controls from the production entrypoint. It does not erase
the source history or the immutable journals required to reconcile real orders,
fills, settlements, recovery incidents and capital movements.

## Activation boundary

The backend refuses to start unless all of these values are exact:

```dotenv
CAT_PRO_RUNTIME_PROFILE=live-only
TRADING_MODE=live
TRADING_EXECUTION_MODE=live
LIVE_TRADING_ENABLED=true
ARBITRAGE_LIVE_CONFIRMATION=ENABLE_CONFIRMED_ARBITRAGE_EXECUTION
CAT_PRO_LIVE_ONLY_CONFIRMATION=ENABLE_CAT_PRO_LIVE_ONLY_RUNTIME
```

Use `docker-compose.live-only.yml` as an overlay. Never set these values on the
old staged/PAPER deployment accidentally; the dedicated server entrypoint also
checks the runtime profile before it initializes exchange services.

## Automatic trade policy

- USDT Spot routes between Binance, Bybit and CoinDCX only.
- Current fee-adjusted net starts at `1.50%` and may step down only through the
  route-study ladder `1.50% → 1.40% → 1.30%`; it never drops below `1.30%`.
- Exact post-stress economic net and immediately reusable cash net after TDS
  must each remain at least `1.30%` after exact taker fees, venue fee
  surcharges, a `0.075%` adverse reserve per leg and a `0.05%` safety buffer.
  TDS stays separately reported as a recoverable tax-credit cash lock, not a
  fabricated trading loss.
- Capital is at least `₹600`, defaults to `₹600`, and is hard-capped at
  `₹1,000` per leg. Change only `CAT_PRO_LIVE_TRADE_CAPITAL_INR`; code rejects
  values outside this range.
- Discovery snapshots must be no more than `2,000 ms` old. Both action-time
  quote ages must be no more than `500 ms`, timestamp skew no
  more than `500 ms`, and the final execution-grade ceiling remains `560 ms`.
- A gross spread from `0.80%` is treated as suspicious and needs all `25`
  independent route-study samples. The absolute cross-exchange price-ratio
  ceiling remains `1.05x`; a fixed `1.01x` ceiling cannot coexist with a
  `1.30%` post-stress floor because it would reject every route before costs.
- Exact current depth must fill the normalized quantity on both legs.
- One trade may be in flight. A route has a five-second cooldown. The same
  opportunity ID is never retried.
- Every attempt receives a durable three-second, exact-opportunity authority.
- A partial result, failed result, recovery requirement or possible exposure
  halts the runner until authoritative reconciliation.

PAPER history and Shadow evidence cannot authorize or block this runtime. A
fresh current preflight still requires exact spot rules, fees, authenticated
balances, API permission evidence, healthy signed-request clocks, connected
execution adapters, a clean recovery state and no unresolved relevant critical
alert. Final last-look and journal-before-I/O remain mandatory.

## Capital Manager

The live-only compose overlay enables the Capital Manager master switch and its
same-exchange and cross-exchange lanes. Defaults are deliberately small:

- `10 USDT` maximum per movement.
- `60 USDT/day` same-exchange maximum.
- `60 USDT/day` cross-exchange maximum.

Cross-exchange movement remains fail-closed until dedicated rebalancer
credentials and the exact destination whitelist are present in `backend/.env`.
The execution service also refuses movement when its authoritative safety
context is missing, emergency stop is active, recovery is pending or settlement
reconciliation is pending. Never reuse a broad withdrawal-enabled trading key.

## Retiring non-LIVE runtime data

Preview the exact selection first:

```powershell
npm run retire:non-live-data -- --logs=C:\absolute\path\to\backend\logs
```

Apply only after stopping the backend:

```powershell
npm run retire:non-live-data -- --logs=C:\absolute\path\to\backend\logs --apply --confirm=RETIRE_NON_LIVE_RUNTIME_DATA
```

The command moves PAPER, Shadow and Tiny-LIVE material under
`logs/retired/non-live-<timestamp>/` and writes a SHA-256 manifest. It does not
select LIVE order, fill, settlement, recovery or capital-movement journals.

## Deployment verification

1. Stop the backend and run the non-LIVE retirement dry run.
2. Back up the current checkout and active logs.
3. Deploy the exact reviewed commit with the live-only compose overlay.
4. Confirm `/health/ready` and `/api/live-only` report the exact commit/profile,
   runner running and not halted, and no recovery/settlement blocker.
5. Confirm all exchange clocks and authenticated balances are fresh.
6. Confirm rebalancer credentials/whitelist/caps without printing secrets.
7. Keep the prior image/commit available for rollback. Rollback must preserve
   all LIVE journals generated after activation.
