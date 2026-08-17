# CAT PRO Persistent Handoff

Last updated: 2026-08-17 02:25 IST (Asia/Kolkata)

## Current authoritative summary

This section is the current source of truth. The detailed build history below is retained for audit context; when an older statement conflicts with this section, use this section.

### V125 deployed — Tiny-LIVE runtime and first arm outcome

- V125 removes action-time dashboard clicking from the first Binance/Bybit Strategy #1 attempt. The operator can pre-arm one exact `market + BUY exchange + SELL exchange` route for 1–30 minutes; the dashboard default is 15 minutes.
- A pre-arm is durable route-bound consent, not exchange-order authority. It cannot reserve capital, transfer/withdraw money or submit an order when created.
- The active V2 policy remains the source of sizing and the hard backend boundary remains `₹100–₹500` per leg. The pre-arm cannot override the active policy amount.
- On an exact matching event-driven EXECUTE snapshot, CAT PRO reruns the complete action-time pilot preflight. Permissions, clocks, approved timing calibration, current two-leg balances, rules, FOK/private-fill contracts, depth, fees, stress profit and the coordinator's final last-look all remain mandatory.
- If and only if the fresh preflight passes, the arm is durably changed from `ARMED` to `CLAIMED` before the existing three-second one-time action authority is minted. The existing `ArbitrageExecutionCoordinator` remains the only two-leg execution owner.
- One arm permits one attempt. A claimed, completed or failed-safe arm can never retry automatically. Expiry and explicit disarm are durable. Automatic fund movement and withdrawals remain unavailable.
- The event hook is inside the already-deferred automation snapshot path. With no active arm it performs only an O(1) in-memory check; no preflight, persistence or exchange work is added to normal market-data ingest.
- The BOT page has an always-visible control showing exact route, `₹/leg`, expiry, `ARMED/TRIGGERING` status, latest outcome and disarm. It remains locked while the Strategy #1 LIVE runtime gate is OFF.
- Full local validation passed: script syntax, architecture boundaries, runtime policy, backend build, deterministic suite `184/184`, frontend lint and frontend production build. The V125 test covers wrong-route rejection, concurrent duplicate suppression, durable claim-before-authority, one execution only, no retry, restart restoration, expiry, disarm and runtime-off refusal. Fixtures only; no exchange request or order occurred.
- The original locally validated source artifact remains `.deploy/cat-pro-v125-paper-safe-20260817.tgz` with checksum `77BFB31D91E3308EDAF7FF669D377DEB8726DC51CD5FAEA8265BD12A6437AA22`. Deployment used the environment-excluding runtime artifact `.deploy/cat-pro-v125-runtime-sanitized-20260817.tgz` with checksum `2CA26C7939CADE9B119E6ADAF571354B02FC44A70B59B611F76E784591D8C488`; `.env`, logs, `node_modules` and compiled `dist` outputs were not copied from the Windows workspace.
- SSH access to `ubuntu@15.252.113.245` was restored and verified on 2026-08-17. Port 22 was reachable and the configured key successfully authenticated; no private-key contents were displayed or copied.
- V125 was deployed to `/opt/cat-pro` after creating `/opt/cat-pro/backups/v125-source-predeploy-20260817.tgz` and rollback image tags `cat-pro-backend:pre-v125` / `cat-pro-frontend:pre-v125`. The new backend image is `sha256:dadc8eadf7632c011ff90bc6b7fba4f9e0b68d98106adabe82211f7e7dcaca27`; the new frontend image is `sha256:7f5d104ab72610c56e74d5556656fd0a2a81fd9befdd2598b68526f2186e2690`.
- The exact V125 action-authority/pre-arm test, Strategy #1 pilot-preflight test and two-leg live-execution safety test passed inside the new production image with Docker networking disabled. The complete `184/184` suite remains the local source-tree validation because one architecture test intentionally scans `/app/src`, which the secure production image intentionally omits.
- Post-deployment backend, frontend, gateway and edge are healthy; backend/frontend restart counts are zero and the internal `/bot` route returns HTTP 200. V125 diagnostics report schema `125.0`, no active arm and no trigger in progress.
- The dedicated Tiny-LIVE Compose override is now active on the backend. The first explicitly confirmed `WALUSDT:bybit->binance` 15-minute pre-arm expired unused because no current opportunity passed every action-time gate. Runtime remains LIVE-capable but disarmed; automatic PAPER execution, automatic retry, transfer and withdrawal remain disabled. Recovery has zero open/critical incidents.

### V119 deployed dispatch-headroom and hot-path snapshot

- V119 is deployed on the AWS PAPER host. Backend, frontend and gateway are healthy; backend/frontend restart counts are `0`, and the internal `/bot` route responds successfully.
- The immutable Binance/Bybit pilot ceiling remains `250 ms`. V119 adds a separate `190 ms` dispatch-reserved admission boundary: `40 ms` target decision-to-start P99 + `10 ms` dispatch reserve + `10 ms` operating reserve remain outside the admitted book age.
- Books aged `191–250 ms` remain preserved in historical execution-grade evidence; they are not deleted or rewritten. They can no longer qualify Strategy #1 Binance/Bybit PAPER execution, pass the final PAPER stress gate, enter timing calibration or pass the current Tiny-LIVE preview.
- V119 keeps a new durable dispatch-reserved cohort with independent generation count, BUY/SELL age distributions and observation span. Migration restores all earlier V112/V114 history but initializes only this new readiness cohort from genuine post-V119 observations.
- Timing proposal/review now consumes only the dispatch-reserved cohort and remains blocked until it has at least `512` unique generations, `512` retained BUY and SELL samples and at least one real hour of observations. It still separately requires measured code-side dispatch plus another `10 ms` residual headroom inside `250 ms`.
- Pilot freshness distribution bookkeeping was moved after the sole PAPER execution handoff while retaining the original immutable snapshot and observation timestamp. This removes non-execution analytics from candidate qualification/queue/start latency; a `finally` path still records the evidence if the orchestrator fails.
- Post-deployment hot path is `PASS`: market update → decision P50/P95/P99 `3/10/14 ms`, scanner evaluation P99 `9.588 ms`, decision → queue P99 `6 ms`, candidate decision → execution start P99 `6 ms`, decision → PAPER completion P99 `10 ms`, pending snapshots `0`, dropped candidate snapshots `0`.
- At the verification snapshot, `WALUSDT:bybit->binance` preserved `330,210` unique historical generations and `191,847` historical execution-grade generations. The new cohort had `912` admitted generations over `85,854 ms`; BUY/SELL P99 was `153/186 ms`. It remained correctly blocked only because the new cohort had not yet reached one hour.
- Local full validation passed: scripts, architecture boundaries, backend build, deterministic suite `179/179`, frontend lint and frontend production build. Focused V119 tests also passed network-isolated inside the new backend image before container replacement.
- Deployment archive checksum: `80937af5f43148ad7993a9497fd972a961ba381f20adb608e2915a825ebc1721`. Rollback artifacts: `/opt/cat-pro/backups/v119-source-predeploy-20260816.tgz`, `cat-pro-backend:pre-v119`, `cat-pro-frontend:pre-v119`.
- Runtime remains BOT enabled in `PAPER_ONLY`; LIVE execution, order submission, automatic transfer and withdrawal remain false. No test/real order or fund movement occurred.

### V118.2 deployed permission-boundary snapshot

- V118.2 is deployed on the AWS PAPER host. Backend build and container startup passed; backend is healthy with restart count `0`.
- Local deterministic regression passed `179/179`. The three focused offline tests also passed inside the deployed container.
- The initial Binance/Bybit Tiny-LIVE lane now requires fresh signed permission evidence: reading enabled, spot trading enabled, withdrawals disabled, internal transfers disabled, an explicit IP allowlist and no unexpected permission outside the exact pilot contract. Evidence older than three minutes fails closed.
- Binance permission evidence is `READY`: reading ON, spot trading ON, withdrawals OFF and IP restriction ON.
- Bybit permission evidence is `READY`: reading ON, `SpotTrade` ON, withdrawals OFF, internal transfer OFF, one explicit bound IP and zero unexpected permissions are signed and verified.
- Bybit still reports `Derivatives:DerivativesTrade` as a system-managed Unified-account marker. Official Bybit documentation records the `Derivatives` update parameter as deprecated because it is auto-identified by the system, while the actual selectable derivative capabilities remain separate `ContractTrade` Order/Position and Options arrays. V118.2 keeps the marker visible as `systemManagedPermissions` but blocks any non-empty ContractTrade, Options, Wallet or unknown permission category.
- The original V118 parser inspected only Bybit `Spot` and `Wallet` categories and could therefore report false READY while another permission category remained non-empty. The first hardening then conservatively treated the system-managed marker as unexpected. V118.2 validates every category while distinguishing that documented marker from real selectable permissions; it exposes only sanitized permission names—never keys, secrets or exact bound IPs.
- V118.2 also makes `internalTransferEnabled === false` an explicit mandatory gate for both venues. A future Binance or Bybit transfer-permission drift now blocks readiness even if all other checks pass.
- Backend-only hardening archive checksum: `468fc60ee788dee67c3fb87ede04aa03b3123c86e7420f7fb2b5a68e3bcc94db`. VPS rollback artifacts: `/opt/cat-pro/backups/v118-permission-boundary-pre-hardening-20260816.tgz` and image tag `cat-pro-backend:pre-v118-permission-hardening`.
- V118.1 archive checksum: `61eef89b64be17caf877e2bcef68479b8ff37c5ab19ca8eee28769290a282675`. VPS rollback artifacts: `/opt/cat-pro/backups/v1181-bybit-unified-marker-predeploy-20260816.tgz` and image tag `cat-pro-backend:pre-v1181`.
- V118.2 archive checksum: `239c7708f41b4e52717cb0fe3bdd899dd0c70cf45353f1acd9098e8461b01e33`. VPS rollback artifacts: `/opt/cat-pro/backups/v1182-transfer-gate-predeploy-20260816.tgz` and image tag `cat-pro-backend:pre-v1182`.
- Latest authenticated balances at approximately 16:02 IST: Binance `34.20700545 USDT` available plus immaterial dust; Bybit `10.98 USDT` available and unlocked.
- The current `WALUSDT|bybit>binance` candidate is blocked while the new V119 dispatch-reserved cohort completes its honest one-hour span and because Binance does not hold the required WAL SELL inventory. Its permission blocker is resolved. Do not buy WAL until timing and every other current preflight gate pass.
- The SSH Security Group remains restricted to the operator's current single-IP `/32` rule; ports 80/443 were unchanged.
- Runtime remains PAPER, LIVE execution OFF, order submission OFF, automatic transfers/withdrawals OFF, and no real/test order or fund movement occurred in this build.

### Product goal and active scope

- CAT PRO is a private/self-use automated crypto trading bot.
- Current execution scope is Strategy #1 only: cross-exchange spot arbitrage.
- Strategies #2-#8 may have foundations or PAPER/SHADOW code in the repository, but they are not part of the first LIVE rollout and must not delay or contaminate Strategy #1.
- The current goal is one controlled, evidence-bound Tiny-LIVE attempt, followed by real-fill reconciliation and only then any further attempt or scaling.
- PAPER results, simulated fills and dashboard profit are evidence—not guaranteed LIVE profit.

### Current safety truth

- Personal bot control: ON.
- Trading account: enabled, emergency stop clear, open trades `0`.
- Runtime: `TRADING_MODE=live`, `LIVE_TRADING_ENABLED=true`, using `docker-compose.tiny-live.yml` without the PAPER overlay.
- Effective LIVE attempt authority: DISARMED; no active pre-arm or one-time authority exists.
- Exchange order-submission environment gate is enabled, but no order can be submitted without a new exact route-bound pre-arm and the complete fresh action-time preflight.
- Automatic retries after an unknown/partial submission: OFF.
- Automatic transfers and withdrawals: OFF.
- Tiny-LIVE runtime gate: true; active arm: none.
- Tiny-LIVE attempts: `0`.
- Active/blocking one-time authority: none.
- The first operator-confirmed arm created no authority, session or order and changed no exchange balance. Automatic transfer and withdrawal authority remain unavailable.

### AWS production host

- Region: `ap-south-1` (Mumbai).
- Instance ID: `i-051494474e664efe3` (`CAT-PRO-PAPER`).
- Instance type: `c7i.xlarge`, 4 vCPU, 8 GiB RAM.
- Elastic IP: `15.252.113.245`.
- Dashboard: `https://15-252-113-245.sslip.io/bot` with Basic Auth.
- Application directory: `/opt/cat-pro`.
- Persistent application data and PAPER evidence are EBS-backed.
- Public HTTPS: Caddy on ports 80/443.
- Internal gateway: Nginx on `127.0.0.1:8080`.
- Backend: port `5000` inside the Docker network.
- Frontend: Nginx port `80` inside the Docker network.
- Compose files: `docker-compose.yml`, `docker-compose.paper.yml`, `docker-compose.tiny-live.yml`, `docker-compose.https.yml`. Never combine the PAPER and Tiny-LIVE overrides.
- Latest check: backend, frontend and gateway healthy; edge running.

### V117 Trade Flow report

- Added a dedicated lazy-loaded `Trade Flow` sidebar page at `/trade-flow` plus read-only API `/api/strategies/strategy-one/trade-flow`.
- Rankings use only unique, credible, closed Strategy #1 PAPER settlements. Distorted fills, other strategies, unfinished trades and unattributed legacy evidence are excluded.
- The report provides Today, 7-day, 14-day and Lifetime windows; pair, exact directional route, BUY-exchange and SELL-exchange rankings; and per-exchange/per-asset inventory flow.
- BUY flow means base-asset inventory accumulated at the BUY venue; SELL flow means base-asset inventory consumed at the SELL venue. Different coin quantities are never summed as comparable value, and the report does not initiate transfers.
- Historical aggregation is cached by the terminal PaperTrade revision and authoritative IST day key. The frontend is lazy-loaded, polls every 15 seconds only while active, and does not run background polling in a hidden tab.
- Local backend/frontend builds and targeted frontend lint passed. Deterministic suite passed `178/178`; real exchange/order tests were not included.
- V117 was deployed from checksum `b38d59413881b0ed6ed57204b6d8066bf1b9395d0b095bba1ed13577a9ba43e5` after creating `/opt/cat-pro/backups/v117-source-predeploy-20260816.tgz` and image tags `cat-pro-backend:pre-v117` plus `cat-pro-frontend:pre-v117`.
- Post-deployment API evidence: 8,664 unique Strategy #1 settlements, 8,598 credible and 66 distorted settlements excluded. Today's window reported 2,042 credible settlements, with `BTCINR` first by count, CoinDCX first on BUY and UnoCoin first on SELL at the verification instant. This is PAPER evidence, not a LIVE-profit claim.
- Backend/frontend/gateway were healthy with restart count zero. Runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE/order submission false, hot path `PASS`, and pending/dropped snapshots `0/0`.
- V117 is reporting-only and did not alter Strategy #1 policy, economics, accounting, execution admission or safety gates; the existing PAPER evidence window remains intact.

### Latest Tiny-LIVE readiness build: V116

- Exchange-rule verification found the legacy `₹100` pilot was impossible on the audited Binance/Bybit USDT spot lane: Binance `WALUSDT` minimum notional was `5 USDT`, and Bybit minimum order amount was also `5 USDT`.
- V116 added versioned policy `strategy-one-execution-policy-v2-exchange-minimum` at the existing hard maximum of `₹500` per leg.
- The old V1 `₹100` definition and append-only activation history remain preserved.
- Pilot preview, exact funded-route evaluation, core preflight, capital-placement advice and one-time action authority now bind the amount from the active versioned policy instead of using inconsistent hard-coded amounts.
- V2 was activated only after briefly pausing the personal bot and proving a clean guard: zero open trades, sessions, locks, non-terminal orders and unresolved recovery incidents. The bot was then resumed in `PAPER_ONLY` mode.
- Active policy: `strategy-one-execution-policy-v2-exchange-minimum`, revision `2`.
- Active policy hash: `e98db3bfc7bf56ed9e1cdfe37f6293bf833bc45c705e9545ab8dcc9245b041e5`.
- Pilot amount: `₹500` per leg; nominal two-leg inventory used by one attempt: `₹1,000`.
- Local backend build passed, frontend production build passed, and deterministic suite passed `177/177`.
- Real exchange order tests were intentionally not run.
- Deployment archive checksum: `6b34d707d84f4dbffccc37d5af322a54b480be0f384c517bfe56b4995e0c607a`.
- VPS rollback artifacts: `/opt/cat-pro/backups/v116-source-predeploy-20260816.tgz`, `cat-pro-backend:pre-v116`, `cat-pro-frontend:pre-v116`.

### First Tiny-LIVE exchange and capital plan

- First Tiny-LIVE is restricted to exactly two exchanges: Binance and Bybit spot.
- Planned operator funding: approximately `₹1,000` equivalent on Binance and `₹1,000` equivalent on Bybit.
- Initial staging target: approximately `10 USDT` net visible on each exchange after any funding/network fee.
- One attempt may use at most `₹500` on the BUY leg and the same quantity worth approximately `₹500` on the SELL leg.
- Remaining value on each exchange is fee/rebalancing buffer, not additional order authority.
- Profit must not be calculated on `₹1,000` twice. The matched quantity is economically one `₹500` trade; for example, `0.50%` net on that matched quantity is approximately `₹2.50`.
- A failed/unknown single leg can temporarily expose roughly one leg's value. FOK, concurrent dispatch and recovery controls reduce but cannot eliminate this risk.
- Do not buy WAL or another base asset before the bot identifies a fresh timing-safe exact route.
- After a route is selected, the BUY exchange needs fresh quote asset (normally USDT), while the SELL exchange needs the exact selected base-asset quantity already pre-positioned.
- Initial inventory seeding is manual/advisory. CAT PRO must not automatically transfer or withdraw funds during Tiny-LIVE preparation.

### Current balance and route state

- All five configured venue balance snapshots were synchronized at the latest verification instant.
- Binance: `250.8489 WAL` plus `28.70791545 USDT` available and unlocked, with immaterial LDUSDT/SHIB/XRP dust.
- Bybit: `10.98 USDT` available and unlocked.
- CoinDCX: `₹195.28 INR` plus `8.10334732232714 USDT`; these balances are outside the initial Binance/Bybit pilot lane.
- Current pilot state: `WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY`; the latest preview had zero fresh executable Binance/Bybit routes.
- Pre-positioned route: `WALUSDT | Bybit BUY -> Binance SELL`. Bybit has quote inventory and Binance has WAL SELL inventory, but inventory alone is never order authority.
- Exact-route bootstrap calibration was explicitly approved at a `231 ms` maximum book age and was current during the first arm. Any later arm must re-check that the calibration is still current and every permission, clock, balance, rule, FOK/private-fill, depth, fee, freshness, skew and post-stress gate passes.
- Never lower the fixed `250 ms` absolute book-age ceiling or required `+10 ms` operating reserve merely to manufacture readiness.

### Tiny-LIVE execution architecture already built

- Initial LIVE lane accepts only audited Binance/Bybit spot contracts.
- Every attempt is bound to one exact current opportunity, route, quantity, policy, timing calibration and preflight hash.
- Current net return must be at least `0.50%` after configured fees, slippage, safety buffer and adverse-move stress.
- Current exchange rules, quantity increment, minimum notional, full two-leg depth and fresh authenticated balances must pass.
- Quantity normalization is round-down-only and may never increase exposure merely to satisfy an exchange minimum.
- Mature route timing must preserve dispatch budget and at least `10 ms` residual operating headroom inside the immutable `250 ms` ceiling.
- A current explicitly approved route timing calibration is required.
- Both leg requests use explicit FOK semantics and are dispatched concurrently.
- Pair/session evidence is journaled before exchange I/O; action authority is consumed before coordinator access and pair binding is durable before dispatch.
- Authenticated private fill streams are the authoritative fill source. PAPER/REST evidence cannot be treated as private fill timing.
- Unknown, partial or unequal outcomes forbid automatic retry and require evidence-backed reconciliation/recovery.
- The first authority is one-time, phrase-bound and expires after 3 seconds once authorized.
- Attempt two is blocked until the first attempt is fully reconciled and authenticated real-fill timing supports the next calibration.

### Four process-start LIVE gates

All four are currently disabled/empty and must remain so until the exact action-time activation step:

1. `TRADING_MODE=live`
2. `LIVE_TRADING_ENABLED=true`
3. `ARBITRAGE_LIVE_CONFIRMATION=ENABLE_CONFIRMED_ARBITRAGE_EXECUTION`
4. `STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION=ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME`

Changing these is a separate external-state decision. Policy activation, PAPER success, a passing preview or an approved timing calibration does not itself authorize an order.

### Readiness and performance evidence

- Global five-exchange closure previously reported `6/7` prerequisites complete (`85.71%`) and waited on 24-hour rolling evidence for Binance/CoinSwitch. That global report remains useful fleet evidence but must not be confused with an exact Binance/Bybit action-time pilot pass.
- Latest five-exchange snapshots were individually healthy, while rolling ratios still contained earlier unhealthy samples. Historical observations must age out naturally; do not reduce the `99%` threshold or fabricate history.
- V115 suppressed single-venue market updates that cannot create a cross-exchange route, preserving second-venue and destructive-event admission.
- Early V115 production snapshot: event decision P95/P99 around `10/14 ms`, backend CPU around `59.56%`, zero pending/dropped candidate snapshots. This is an operational snapshot, not guaranteed LIVE latency.
- Post-V119 production snapshot: update → decision P95/P99 `10/14 ms`, decision → queue P99 `6 ms`, candidate → start P99 `6 ms`, decision → PAPER completion P99 `10 ms`, pending/dropped candidate snapshots `0/0`.
- Current route timing is dominated by real exchange update cadence. More CPU or lower local timers cannot make a venue publish a fresh book sooner.

### PAPER evidence and accounting truth

- PAPER accounting uses authoritative `Asia/Kolkata` day boundaries and resets daily counters at 00:00 IST; lifetime P&L/history do not reset.
- Distorted fills are excluded from credible performance and shown separately.
- PAPER profit is separated from fees, TDS withholding and deployable cash estimates; it is never reported as safely withdrawable LIVE profit.
- A 14-day PAPER window was an evidence recommendation, not a guarantee and not a reason to ignore real-fill validation. The present plan advances only through exact Tiny-LIVE gates, not merely because a calendar period elapsed.
- Existing PAPER history and evidence remain persistent; do not reset them during Tiny-LIVE preparation.

### Personal Capital Manager status

- The Personal Capital Manager is currently advisory/read-only.
- It can read synchronized exchange balances, rank historical BUY/SELL venues/routes and show exact deficits for a selected one-cycle route.
- It does not transfer, withdraw, rebalance or claim safely withdrawable profit.
- Full automatic capital circulation across five exchanges is a later phase requiring reconciled LIVE fills, transfer/withdrawal policy, address/network allowlists, fee/TDS accounting, idempotent transfer journals and explicit limits. It must not be enabled for the first Tiny-LIVE attempt.

### Immediate next steps

1. Keep the V119 PAPER/timing collector running continuously. Review the current route only after its new dispatch-reserved cohort has at least `512` unique generations, `512` retained samples per side and one full hour of observations.
2. Keep Binance/Bybit API withdrawals and internal transfers disabled. Their latest signed permission boundary is READY: read + spot trade enabled, explicit IP restriction present and no unexpected selectable permission.
3. Re-run the read-only pilot preview after the cohort matures. It must still pass measured timing headroom, current `≤190 ms` BUY/SELL book age, minimum `0.50%` post-stress return, order rules, fees and exact two-leg funding.
4. Only if timing and every non-inventory check pass, use the selected route to recommend the exact SELL-side base asset and quantity. The operator manually pre-positions only that bounded inventory; do not pre-buy WAL now.
5. Refresh balances/rules/fees/depth and run the read-only pilot preview again. It must return `READY_FOR_OPERATOR_PREFLIGHT`.
6. Generate and explicitly approve the exact bounded timing calibration only when current route evidence fits the ceiling and reserve.
7. Run the core Tiny-LIVE preflight. No runtime LIVE gate should be changed until every preflight blocker is zero.
8. At action time, with the user present and monitoring, separately switch the four runtime gates, generate the exact one-time authority phrase and execute at most one `₹500`-per-leg attempt.
9. Reconcile both exchange orders, quantities, fees and resulting inventory before declaring success. Any unknown/unequal result stops further attempts.

### Important prohibitions

- Do not claim guaranteed profit or declare success from PAPER alone.
- Do not enable all eight strategies for the first LIVE rollout.
- Do not lower profit, freshness, timing, depth or order-rule gates just to obtain a pass.
- Do not enable automatic retry after possible submission.
- Do not enable API withdrawals or automatic exchange-to-exchange fund movement.
- Do not place a real order merely because an old opportunity or historical route was profitable.
- Do not expose passwords, API keys, exchange secrets, Basic Auth values or SSH private-key contents in source, logs, summaries or chat.

### Quick read-only verification

From the Windows workspace:

```powershell
ssh -i C:\Users\ROG\.ssh\cat-pro-paper-key ubuntu@15.252.113.245 "cd /opt/cat-pro && docker compose -f docker-compose.yml -f docker-compose.paper.yml -f docker-compose.https.yml ps"
```

From inside the VPS, current operator/runtime truth:

```bash
curl -sS http://127.0.0.1:8080/api/operator-settings | jq '{runtime:.data.runtime,account:.data.account,strategyOnePolicy:.data.strategyOnePolicy}'
curl -sS http://127.0.0.1:8080/api/portfolio/exchange-balances | jq '.data.exchanges[] | select(.exchange=="binance" or .exchange=="bybit")'
curl -sS http://127.0.0.1:8080/api/execution/tiny-live/strategy-one-pilot | jq '.data'
curl -sS http://127.0.0.1:8080/api/execution/tiny-live/strategy-one-action | jq '.data'
```

### Secret handling

- No passwords, Basic Auth secrets, exchange API secrets, OTPs, wallet seed phrases, deposit addresses or private-key contents are stored in this handoff.
- The SSH key path is recorded only as a local path; its contents must never be printed or copied into the repository.

## Break handoff — 2026-08-15 (V106)

- V106 Strategy #1 route/exchange timing evidence is deployed on the AWS PAPER host. It measures quote age and PAPER decision stages now, and already owns fail-closed hooks for future LIVE last-look, dispatch, gateway-result and authenticated private-event timing.
- Evidence is bounded and asynchronously checkpointed. Invalid observations and observer/persistence failures cannot change an execution result, and REST backfill is explicitly excluded from private transport calibration.
- Calibration requires at least 512 public route samples spanning at least one hour and at least 30 authenticated WebSocket fill samples per participating venue. Any derived quote-age value is advisory only; it is never auto-applied and cannot exceed the hard 250 ms review ceiling.
- Initial production evidence is correctly `COLLECTING_PUBLIC_TIMING`; no route TTL or LIVE readiness was manufactured. Real submission remains blocked until empirical calibration and every remaining execution-risk gate pass.
- V106 validation completed: backend build, architecture boundaries, frontend lint/build, focused timing/last-look/gateway tests and full deterministic regression `170/170`.
- Latest verified runtime is BOT ON, `PAPER_ONLY`, PAPER execution ON, LIVE OFF and exchange order submission OFF. The hot path is `PASS` with zero pending/dropped snapshots.
- Binance and Bybit authenticated private WebSocket sessions remain the V105 evidence sources. Private-fill latency cannot be inferred from PAPER or signed-REST backfill; it needs explicitly authorized real fill evidence later.
- One historical `CLOCK_UNSAFE_BYBIT` CRITICAL lifecycle record has recurred but its current condition is inactive and current Bybit clock evidence is healthy. It remains explicitly unresolved for operator review; active CRITICAL count is zero and LIVE promotion remains fail-closed.
- Backend/frontend/gateway remain healthy. V106 changed evidence instrumentation only, not Strategy #1 PAPER economics/accounting, so the existing PAPER soak was not reset.
- V101 Personal Capital Manager Phase A/B is deployed at `BOT → CAPITAL` on the AWS PAPER host.
- It uses authenticated five-exchange balance snapshots, keeps different native assets separate, exposes only an explicit INR subtotal, isolates PAPER accounting, and derives one-cycle inventory targets from the fresh Strategy #1 route.
- The latest verified production runtime was healthy: `READY_TO_EXECUTE_PAPER`, BOT ON, `PAPER_ONLY`, effective PAPER execution ON, LIVE OFF, order submission OFF, Capital Manager `ADVISORY_ONLY`, automatic funds/transfers/withdrawals OFF.
- Code-side hot path was `PASS` with zero pending snapshots and zero dropped candidate snapshots.
- V101 validation completed: backend build, frontend lint/build, focused manager tests, full deterministic regression `165/165`, and responsive QA at desktop 1440px, iPhone 390px and Android 412px.
- Tiny-LIVE readiness is `6/7` complete (`85.71%`). There is no code or operator action blocker; the only prerequisite is `ROLLING_SHADOW_PAPER_EVIDENCE`.
- The rolling policy is a 24-hour window, 30-second capture interval, at least 120 observations, at least one hour duration and at least 99% SHADOW plus PAPER availability per exchange.
- Snapshot at approximately 19:11 IST: CoinDCX 98.38%, Binance 96.95%, Bybit 98.27%, UnoCoin SHADOW 98.05% / PAPER 89.49%, and CoinSwitch 76.33%. The latest persisted observation itself showed all five exchanges currently SHADOW and PAPER available.
- Assuming every future 30-second observation remains healthy, the best-case final 5/5 rolling clearance is approximately `2026-08-16 17:28 IST`, with CoinSwitch expected to clear last. This is an estimate, not a guaranteed time.
- Current Strategy #1 pilot preview may show `WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY`; this is normal because its action-time window accepts only a fresh non-fallback EXECUTE candidate not older than 10 seconds.
- Next action after rolling evidence reaches 5/5: wait for a fresh matched Strategy #1 route, then run the explicit ₹100-per-leg preflight-only workflow. The preflight cannot reserve capital, create a LIVE session or submit an exchange order.
- Do not implement or activate Capital Manager Phase C transfers yet. The manager specification requires the preceding evidence phase and Tiny-LIVE evidence before transfer authority advances beyond `ADVISORY_ONLY`.

## Product goal

- Private/self-use automated crypto trading bot.
- Current execution focus is Strategy #1: Cross-Exchange Arbitrage.
- Optimize for truthful net-profit opportunities, deterministic PAPER evidence, and low code-side latency.
- Avoid unrelated modules/files and premature work on Strategies #2-#8.
- Never treat PAPER results as guaranteed LIVE profit.

## Safety state

- Personal BOT control: ON.
- Trading mode: PAPER_ONLY.
- Effective PAPER execution: enabled.
- LIVE execution: OFF.
- Exchange order submission: OFF.
- Current bot runtime recovered successfully after the EC2 resize.

## Active 14-day PAPER soak

- Authoritative soak start: `2026-08-15 01:12:56 IST` (post-c7i boot and backend start).
- Earliest 14-day completion: `2026-08-29 01:12:56 IST`.
- The window requires continuous PAPER-only operation; a material outage, manual PAPER-data reset, strategy-policy change, or execution-path deployment must be recorded and may require restarting the acceptance window. Normal 00:00 IST daily rollover does not restart the soak.
- Ordinary PC shutdown does not interrupt the soak because CAT PRO runs independently on AWS.
- Do not enable LIVE execution or exchange order submission during this window.
- Runtime check at `2026-08-15 08:43 IST`: all containers healthy, BOT ON, PAPER execution enabled, 1,142/5,000 daily attempts settled, accounting balanced, hot path PASS, and zero dropped candidate snapshots.

## AWS production host

- Region: ap-south-1 (Mumbai).
- Instance ID: `i-051494474e664efe3` (`CAT-PRO-PAPER`).
- Instance type: `c7i.xlarge`.
- Capacity: 4 vCPU, 8 GiB RAM (Linux reports approximately 7.6 GiB).
- Previous type: `t3.medium`; it was resized in place, so no old instance exists.
- Elastic IP: `15.252.113.245` (`CAT-PRO-PAPER-EIP`).
- Dashboard: `https://15-252-113-245.sslip.io/bot` (Basic Auth protected).
- Application directory: `/opt/cat-pro`.
- Root/storage is EBS-backed and persisted through the resize.
- AWS console showed c7i.xlarge Linux On-Demand compute at approximately `$0.1785/hour`; EBS, public IPv4 and tax are separate.

## Runtime layout

- Public HTTPS: Caddy edge on ports 80/443.
- Internal gateway: Nginx on `127.0.0.1:8080`.
- Backend service: port `5000` inside the Docker network.
- Frontend: Nginx container on port 80 inside the Docker network.
- Compose stack:
  - `docker-compose.yml`
  - `docker-compose.paper.yml`
  - `docker-compose.https.yml`
- Containers verified healthy after resize:
  - `cat-pro-backend`
  - `cat-pro-frontend`
  - `cat-pro-gateway`
  - `cat-pro-edge`

## Daily accounting fix

Root cause found on 2026-08-15:

- The hourly dashboard used fixed `Asia/Kolkata` buckets.
- Daily account and ledger keys used the VPS local timezone.
- The AWS host runs in UTC, so the daily attempt counter would reset at 05:30 IST instead of 00:00 IST.

Implemented fix:

- Added one authoritative `Asia/Kolkata` PAPER-accounting date key.
- Trading account rollover and ledger reconstruction now use the same IST date key.
- Daily attempts, today profit/loss, and daily safety accounting roll over at 00:00 IST.
- Lifetime P&L, lifetime credible executions, and historical PAPER settlements intentionally do not reset.
- The fix was built, tested and deployed to the VPS backend.
- Deterministic suite result: `159/159` passed.

Relevant files:

- `backend/src/trading/account/TradingAccount.ts`
- `backend/src/trading/account/TradingAccountService.ts`
- `backend/src/trading/account/TradingAccountLedgerService.ts`
- `backend/src/trading/account/tests/testTradingAccountOperatorControls.ts`

## Post-upgrade performance snapshot

Captured shortly after c7i.xlarge startup with a 512-sample rolling window:

- Hot path: PASS.
- Market update to decision: P50 2 ms, P95 6 ms, P99 10 ms, max 42 ms.
- Scanner evaluation: P50 1.475 ms, P95 2.3 ms, P99 7.948 ms.
- Decision to PAPER queue: P95 3 ms, P99 4 ms.
- Candidate decision to execution start: P95 3 ms, P99 4 ms.
- Decision to PAPER completion: P99 6 ms.
- Pending snapshots: 0.
- Candidate snapshots dropped: 0.
- Minimum event scan interval: 20 ms.

This is an early post-restart snapshot, not a long-duration performance claim.

## PAPER limits and accounting

- Operator-configurable daily attempt safety cap supports 1-5000.
- Current configured daily attempt limit: 5000.
- Counter semantics: capital-reserved attempts, reconciled as settled + dry-run + other/unlinked.
- PAPER capital/history is stored on the persistent EBS-backed deployment.
- Do not manually clear PAPER history unless the operator explicitly requests a reset.

## Current success verdict and PAPER P&L meaning

- CAT PRO Strategy #1 has achieved engineering/PAPER-execution progress and promising simulated profitability evidence.
- It has **not** yet demonstrated profitable LIVE execution or scalable profitability. Do not describe the overall bot as financially successful until LIVE evidence exists.
- A displayed `Credible PAPER P&L` is fee-adjusted PAPER profit from credible closed settlements; it is not automatically withdrawable after-tax cash.
- Current implementation calculates VDA TDS withholding separately as `deployableCashProfit = netProfit - tdsWithheld`, while the BOT headline P&L sums stored `actualProfit = netProfit`.
- Income tax is not deducted from the headline PAPER P&L.
- Automated PAPER execution uses revalidated depth/VWAP prices, but real exchange fill probability, queue position, adverse latency, partial-leg recovery and market impact remain unproven.
- The observed example of approximately `₹12,000` PAPER P&L on `₹100,000` capital must be treated as an upper-bound PAPER observation, not a guaranteed daily LIVE return.

### Credibility-adjusted portfolio correction (2026-08-15)

- The Dashboard portfolio summary now excludes Strategy #1 settlements whose executed buy/sell price ratio breaches the authoritative cross-venue credibility limit.
- Historical records and the append-only account ledger are preserved for audit; nothing was deleted or rewritten.
- The Dashboard labels the ratio as `Accepted Settlement Rate`, explicitly not a LIVE win rate.
- Post-deployment production snapshot: 4,014 stored closed PAPER records, 3,955 credible closes, 59 distorted fills excluded, and ₹12,454.49 excluded P&L.
- At that snapshot the credibility-adjusted capital was ₹1,28,744.29 and credibility-adjusted realized PAPER P&L was ₹28,728.41; the raw ledger capital remained ₹1,41,198.79 for reconciliation.
- Backend/frontend builds passed and the deterministic suite passed `161/161`.
- Post-deployment safety verification remained `PAPER_ONLY`, BOT enabled, PAPER enabled, LIVE execution false, order submission false, and hot path PASS.

### Immediate Tiny-LIVE gate snapshot (2026-08-15)

- Readiness closure was 50%: 4/8 prerequisites complete, 2 operator/code actions required, and 2 evidence actions waiting.
- P0 operator action: review and explicitly resolve seven cleared-but-unresolved CRITICAL alert histories; never auto-resolve or delete them.
- P1 code action: five-exchange LIVE adapter foundation is 4/5 because UnoCoin has no audited order adapter.
- Current candidate funding was not LIVE-ready. Example `COTIUSDT CoinDCX -> Binance` required CoinDCX USDT plus pre-positioned Binance COTI, but the authenticated balances were absent.
- Tiny-LIVE remains preflight-only with a hard ₹100–₹500 range. It submitted no order, reserved no capital and created no LIVE session.

## Tiny-LIVE validation decision

- The first Tiny-LIVE order cap remains `₹100`, subject to both exchanges' current minimum-order/notional rules. If a market requires more than the approved cap, the route must remain blocked; the bot must not silently raise the limit.
- One successful `₹100` trade proves only the order pipeline.
- Tiny-LIVE stage success requires at least 100 separately accounted attempts across multiple periods, including failures, with:
  - positive cumulative realized net P&L after actual fees and live costs;
  - correct TDS evidence/reconciliation;
  - zero unresolved/orphan legs;
  - bounded drawdown;
  - no duplicate orders or balance/accounting mismatch.
- Passing Tiny-LIVE validates only the tested amount tier. Higher capital must be unlocked through staged tiers rather than jumping directly to large capital.
- The operator is considering initially depositing about `₹1,000` on each of five exchanges, but exchange/asset placement and the final smallest valid per-trade amount will be decided later from evidence.
- Equal INR balances alone are not sufficient for cross-exchange arbitrage: the BUY venue needs quote funds and the SELL venue needs pre-positioned base-coin inventory.

## Implemented Exchange Capital Placement Report (V91, 2026-08-15)

- The Strategy #1 BOT page now includes a durable historical BUY-venue, SELL-venue and directional-route ranking based only on unique, credible, closed, attributed PAPER settlements.
- Stored evidence is deduplicated by settlement ID and distorted cross-venue fills are excluded without deleting or rewriting history.
- Ranking is deterministic: unique settlement count first, then deployable cash P&L, realized P&L, average return and stable key order. The UI exposes the underlying counts, fees, TDS and confidence instead of an opaque score.
- Directional routes remain separate, for example `CoinDCX -> UnoCoin` and `UnoCoin -> CoinDCX`.
- Post-deployment evidence: 4,082 stored/unique Strategy #1 settlements, 4,023 credible settlements, 59 distorted settlements excluded and zero duplicate IDs.
- Historical BUY ranks began with CoinDCX (2,895), Binance (641), Bybit (463), UnoCoin (24). Historical SELL ranks began with Binance (1,428), UnoCoin (1,425), CoinDCX (816), Bybit (354).
- The highest-count route was `BTCINR CoinDCX -> UnoCoin` with 1,393 settlements, but it is not a Tiny-LIVE candidate because UnoCoin still has no audited order adapter.
- The strongest adapter-ready historical pilot candidate was `COTIUSDT CoinDCX -> Binance` with 625 credible settlements. This is historical evidence, not a current opportunity or funding instruction.
- The pilot report remains preflight-only at `₹100` per leg (`₹200` minimum two-leg inventory). Current depth, rules, fees and authenticated two-leg balances are deliberately marked unverified until action time.
- The report is advisory-only: no transfer, withdrawal, balance mutation, LIVE execution or order submission is permitted.
- Local backend/frontend builds passed and the deterministic suite passed `162/162`.
- AWS backend/frontend were rebuilt; the gateway was recreated after its upstream addresses changed, and backend, frontend and gateway health/reachability checks passed.

## Implemented Strategy #1 Action-Time Pilot Gate (V92, 2026-08-15)

- The BOT page now intersects fresh, non-fallback `EXECUTE` opportunities with V91 durable historical directional routes.
- A route must have at least the V91 minimum credible settlement sample, positive deployable PAPER cash P&L and registered order-adapter foundations on both venues.
- The pilot is fixed at `₹100` per leg (`₹200` minimum two-leg inventory) and rejects any safely reduced result below the hard ₹100 tier.
- Current fee-adjusted net return must meet the centralized `0.50%` Tiny-LIVE threshold.
- Exact sizing reuses the existing Strategy #1 funded-route service: current depth, fresh authenticated BUY quote balance, fresh authenticated SELL base inventory, market rules, minimum notional and quantity normalization all fail closed.
- Exact quantity then reuses the existing post-stress book gate for freshness, pair skew, full two-leg depth, taker fees, slippage, safety buffer and adverse-move reserve.
- The BOT panel refreshes the read-only preview and requires a fresh route-bound operator checkbox/button before the existing core Tiny-LIVE preflight can run.
- Opportunity ID binding prevents a stale candidate from being silently substituted between preview and confirmation.
- Even a core preflight PASS is activation-review evidence only. It cannot enable LIVE, reserve capital, move funds, create a LIVE session or submit an order.
- Initial production snapshot: 1 fresh EXECUTE opportunity, 27 historically eligible adapter-ready routes, zero exact current matches; state correctly remained `WAITING_FOR_HISTORICAL_MATCH`.
- Local backend/frontend builds passed and the deterministic suite passed `163/163`.
- AWS backend, frontend and gateway were rebuilt/recreated and verified healthy. Runtime remained BOT enabled, `PAPER_ONLY`, PAPER execution enabled, LIVE execution false, order submission false and hot path PASS.

## Implemented P0 Alert Closure Console (V93, 2026-08-15)

- The Alerts page now separates current CRITICAL conditions from persisted unresolved CRITICAL history in a dedicated V93 P0 closure queue.
- Each cleared record displays current source evidence beside the original persisted metadata before operator resolution is possible.
- The operator can insert a deterministic evidence-note draft, but must still review the exact record, check the evidence-review confirmation and explicitly submit the resolution. No bulk, automatic or silent resolution was added.
- Resolution remains locked while the underlying condition is active. Recording an alert lifecycle resolution never submits, cancels, resumes, hedges or unwinds an exchange order.
- Production audit after deployment showed zero active CRITICAL conditions, seven cleared-but-unresolved CRITICAL records, healthy alert-history persistence and a `CLEAN` restart-recovery gate with zero findings.
- The seven pending lifecycle records are `CLOCK_UNSAFE_BYBIT`, `CLOCK_UNSAFE_COINSWITCH`, `CLOCK_UNSAFE_BINANCE`, `DUPLICATE_ORDER_RISK`, `RESTART_RECOVERY_POSSIBLE_EXPOSURE`, `EXECUTION_HEALTH_UNHEALTHY` and `CREDENTIAL_SAFETY_BLOCKED`.
- No alert was acknowledged or resolved during deployment verification; the historical evidence remains intact for explicit operator review.
- Frontend lint/build passed and the complete deterministic backend suite remained `163/163`.
- AWS frontend and gateway were rebuilt/recreated and verified healthy. Runtime remained BOT enabled, `PAPER_ONLY`, PAPER execution enabled, LIVE execution false and order submission false.

## Implemented Clock-Safety Stabilization And P0 Closure (V94, 2026-08-15)

- Production evidence showed the Binance, Bybit and CoinSwitch clock records repeatedly becoming stale because authoritative clock refresh depended indirectly on slower authenticated-balance synchronization. The hard `60,000 ms` evidence expiry was correct and was not widened.
- Added a dedicated public server-time synchronization runner with a `20,000 ms` refresh interval, `60,000 ms` maximum evidence age, `40,000 ms` refresh margin, immediate startup refresh and overlap coalescing.
- The runner is independent of authenticated balance reads, exposes its lifecycle/attempt/error status through the existing clock endpoint, starts with the backend and stops cleanly during shutdown. It performs server-time reads only and cannot submit or cancel orders.
- Four production observations spanning longer than one hard expiry window kept all authoritative clocks healthy. The later post-closure snapshot showed 19 attempts, zero failed refreshes, zero overlap skips, fresh Binance/Bybit/CoinSwitch evidence and no error.
- After source evidence was verified clear, the operator authorized explicit source-specific lifecycle resolution of the seven inactive historical CRITICAL records. No history was deleted or rewritten.
- Post-resolution alert history returned HTTP 200 with 7 resolved records, 2 open non-critical records, zero unresolved CRITICAL records, zero active CRITICAL records, healthy persistence and `livePromotionBlocked: false`.
- The remaining open records are truthful current limitations: `EXECUTION_HEALTH_NO_DATA` (WARNING) and `CLOCK_LOCAL_ONLY_COINDCX` (INFO). The execution-health resolution explicitly does not claim LIVE execution evidence.
- Tiny-LIVE readiness advanced from 50% to 62.5% (5/8 prerequisites complete). The next blocker is `LIVE_ORDER_ADAPTER_FOUNDATION`: 4/5 target adapters are registered because UnoCoin still lacks an audited order adapter.
- Local backend build, focused runner test and the complete deterministic suite passed `164/164`. AWS backend and gateway were rebuilt/recreated and verified healthy.
- Final runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false.

## Implemented Five-Exchange Adapter Completion And Restart-Safe Clock Alerts (V95, 2026-08-15)

- Added the fifth audited spot order-adapter foundation for UnoCoin from the official bearer-token API contract. The adapter is LIMIT-only, does not invent post-only or client-order-ID behavior, uses bounded pair-history polling, requires transaction-level fill evidence for completed/partial fills and confirms an accepted cancellation through subsequent status reads.
- UnoCoin order transport and adapter tests use isolated fixtures only. No external order request, balance mutation, capital reservation, LIVE enablement or exchange order occurred.
- UnoCoin now registers with the shared execution adapter registry. Production reports `5/5` registered adapters and fresh authenticated read verification for all five exchanges; every adapter remains disconnected with `liveExecutionEnabled: false`.
- A production restart exposed a separate alert-lifecycle race: the alert-history monitor was starting during route import before the first asynchronous authoritative clock synchronization completed. This reopened three cleared historical clock alerts once per backend restart even though the clocks became healthy immediately afterward.
- Clock-runner startup is now awaitable. The backend waits for the first authoritative synchronization before enabling persisted alert monitoring, API reads cannot mutate alert history before monitoring is enabled, and both services stop explicitly during shutdown.
- A controlled production backend restart plus observation beyond the full 60-second hard clock-evidence expiry left Binance, Bybit and CoinSwitch continuously healthy. Their occurrence counts stayed exactly `592`, `3111` and `2842`, and alert-history persistence recorded zero restart-race writes.
- The three inactive false startup-clock records were then explicitly resolved with exchange-specific V95 evidence notes. Nothing was deleted or rewritten. Final alert history has 7 resolved records, 2 open non-critical records, zero unresolved CRITICAL records, zero active CRITICAL records and `livePromotionBlocked: false`.
- Tiny-LIVE readiness advanced from 62.5% to 75%: 6/8 prerequisites are complete, zero code/operator actions are currently required, two evidence gates are waiting and final activation remains deferred.
- The next truthful blocker is rolling SHADOW/PAPER stability plus audited execution-health evidence. These gates must accumulate real runtime evidence; their thresholds must not be weakened or populated with synthetic claims.
- Local backend build, focused startup-order test and the complete deterministic suite passed `165/165`. AWS backend and gateway were rebuilt/recreated and verified healthy.
- Final runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false.
- Official contract reference: <https://unocoin.com/in/support/api-documentation/>.

## Implemented Non-Circular Tiny-LIVE Readiness Staging (V96, 2026-08-15)

- Audited the persisted rolling five-exchange readiness collector before changing any gate. The collector was healthy with 2,709 real observations in the 24-hour window, and the point-in-time report showed all five exchanges currently SHADOW-available and PAPER-available.
- The rolling gate remains truthfully blocked because earlier feed/rule downtime is still inside the 24-hour window. The minimum 120 observations, one-hour duration and 99% availability thresholds were not lowered, and no historical evidence was fabricated or rewritten.
- Found a genuine circular dependency in the first Tiny-LIVE activation path: execution-health metrics are produced only by real LIVE adapters, while the pre-activation closure required healthy LIVE execution evidence; the V18 operational and full production-safety gates also require LIVE account state.
- Split the gates by stage without deleting them. The eight pre-activation-review gates now cover rolling readiness, hardening, recovery, alerts, credentials, authenticated reads, clock safety and adapter foundations. V18 operational readiness and full production-safety SAFE remain visible post-activation gates and must pass before any scale increase.
- Real execution health remains mandatory after the first explicitly authorized Tiny-LIVE attempt. SHADOW, PAPER, dry-run, synthetic and unattributed records are explicitly prohibited from satisfying it.
- Production readiness closure is now 85.71%: 6/7 prerequisites complete, one genuine evidence wait (`ROLLING_SHADOW_PAPER_EVIDENCE`) and two deferred actions (real execution health and final activation review).
- Production go/no-go reports 8 required gates with 7 passing and 1 blocked. Its activation blockers contain only rolling five-exchange readiness; V18 operational readiness and production-safety SAFE are separately reported as two post-activation waits.
- This staging change creates no LIVE authority. The route-specific V92 preflight, exact two-leg funding, current rules/depth/fees, account controls and fresh explicit operator confirmation remain mandatory for the first Tiny-LIVE attempt.
- Local backend build, frontend lint/build, focused readiness tests and the complete deterministic suite passed `165/165`. AWS backend/frontend/gateway were rebuilt/recreated and verified healthy.
- Post-deployment clocks remained healthy, resolved clock occurrence counts stayed exactly Binance `592`, Bybit `3111`, CoinSwitch `2842`, and alert history remained 7 resolved, 2 open non-critical, zero unresolved CRITICAL.
- Final runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false.

## Implemented Futuristic Dark-Neon Frontend System (V97, 2026-08-15)

- Restyled the existing CAT PRO application shell without adding a page, module, data source or trading behavior.
- The palette now uses deeper black/navy surfaces with cyan, blue, violet and emerald neon accents while preserving warning/danger semantics and readable terminal contrast.
- Added a lightweight grid/radial ambient background, glass-like header and status bar, neon scrollbar, luminous active-navigation rail and restrained card-edge glow.
- The existing `HOPUN HFT BOT` header identity retains its clockwise dual-color border lights and scanline. Reduced-motion preferences still disable nonessential animation.
- The BOT hero is now a cohesive command-deck surface with subtle scanlines and responsive metric-edge accents. All values remain sourced from the existing truthful backend responses.
- Styling uses local CSS/system fonts only; no external font, bitmap, video, UI framework or runtime data dependency was added. The production CSS remains about `15.33 kB` gzip.
- Frontend lint and production build passed. The desktop layout was visually checked for header hierarchy, dark-grid contrast, active navigation, scrolling and unavailable-state legibility.
- Only the frontend and gateway were recreated on AWS; the backend was not restarted, so V96 rolling evidence collection continued uninterrupted.
- Backend, frontend and gateway remained healthy. Final runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false.

## Implemented BOT Focus Cockpit (V98, 2026-08-15)

- The existing `/bot` page now opens in `FOCUS` mode and exposes a one-click `DEEP AUDIT` switch. Deep Audit preserves the complete pre-existing evidence dashboard; no page or sidebar module was added.
- FOCUS renders a native SVG 24-hour IST chart with successful credible PAPER settlements as bars and hourly net PAPER P&L as the trace. The current clock-hour bucket is highlighted and every visual value comes from the existing BOT report.
- Added three compact native SVG evidence rings for daily attempt-cap use, accepted-settlement rate and PAPER soak gate. The settlement ring is explicitly labelled credible PAPER and not LIVE.
- Added a real-time accepted-opportunity constellation, latest credible settlement core, route beam and compact code-side P95/P99 lightning rail. Missing evidence remains visibly empty/NO DATA rather than inferred.
- FOCUS keeps the permanent safety strip visible: PAPER simulation only, current scanner state and `LIVE OFF · 0 submitted` exchange-order status.
- Both views reuse the same existing BOT query. No API, polling interval, WebSocket, backend service, execution path, package, chart library, font, image or canvas dependency was added.
- Incremental visual cost is small: the BOT chunk is about `19.62 kB` gzip and the global CSS is about `16.57 kB` gzip. Native SVG/CSS visuals do not run in the scanner or execution process.
- Frontend lint/build passed. Real production-shaped BOT data was used through a temporary local-only SSH tunnel for visual QA; FOCUS and DEEP AUDIT switching both worked, graphs/rings were readable at the desktop viewport and browser console errors/warnings were zero.
- Only frontend and gateway containers were recreated on AWS. The backend was not restarted and the rolling readiness collector continued uninterrupted.
- Post-deployment backend, frontend and gateway were healthy. Runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false.

## Added Glowing Om and Swastik Header Identity (V98.2, 2026-08-15)

- Added compact `ॐ` and auspicious `卐` emblems inside the left and right sides of the existing `HOPUN HFT BOT` header identity.
- Both emblems use matching warm-gold cores, cyan outer halos and a slow restrained breathing glow that complements the existing clockwise border-light animation.
- The implementation is Unicode plus CSS only: no image, package, request, timer or trading-process work was added. Global CSS remains approximately `16.83 kB` gzip.
- Both emblems scale down with the existing header breakpoint, are hidden from assistive technology as decorative identity, and stop animating when reduced motion is requested.
- Frontend lint/build and visual QA passed. Only frontend and gateway were recreated on AWS; backend evidence collection remained uninterrupted.
- Post-deployment backend, frontend and gateway were healthy. Runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false.

## Implemented Mobile Command Deck (V99, 2026-08-15)

- Made the existing frontend shell responsive without adding an API, page, package or backend behavior.
- Added iPhone safe-area/modern viewport support, compact mobile header controls and a full-width mobile `HOPUN HFT BOT` identity that retains the glowing Om, swastik and border animation.
- Below 1024px the desktop sidebar becomes a touch-sized, horizontally swipeable bottom command dock; every existing module remains reachable. The compact status bar stays below it and the main content receives matching safe-area clearance.
- The BOT hero uses a readable two-column metric deck on normal phones, full-width FOCUS/DEEP AUDIT and BOT controls, compact three-ring telemetry and an independently swipeable 24-hour chart rather than shrinking its labels into unreadable text.
- Wide evidence tables keep their truthful full column structure inside horizontal scroll containers. Inputs use a mobile-safe font size to prevent unwanted iOS zoom, and touch targets are at least 44px where interaction matters.
- Verified with real PAPER data at iPhone `390×844` and Android `412×915` viewport overrides. Both had zero page-level horizontal overflow; the chart and command dock exposed only intentional horizontal scrolling.
- Frontend lint/build passed. Incremental bundle cost remained small: global CSS approximately `17.86 kB` gzip and BOT chunk approximately `19.69 kB` gzip.
- Only frontend and gateway containers were recreated on AWS; the backend was not restarted and rolling PAPER evidence collection remained uninterrupted.
- Post-deployment backend, frontend and gateway were healthy. Runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false.

## Resolved Cleared Bybit Clock Alert (2026-08-15)

- The persisted `CLOCK_UNSAFE_BYBIT` CRITICAL record was reviewed only after its underlying condition reported `conditionActive=false`.
- Current authoritative clock evidence showed Bybit `HEALTHY`, server-synchronized, fresh, signed requests allowed and a `7 ms` offset against the `2000 ms` limit with no clock blocker.
- The operator explicitly resolved the historical alert with an audit note recording that evidence and stating that resolution does not enable LIVE or order submission.
- Alert persistence remained healthy: 9 total records, 7 resolved, 2 open non-critical, zero unresolved/active CRITICAL records and `livePromotionBlocked=false`. The Bybit occurrence count is now `3112` after the later genuine 2012 ms recurrence that cleared before resolution.
- Tiny-LIVE readiness closure improved from 5/7 to 6/7 completed prerequisites (`85.71%`). No operator action remains; the sole pre-activation wait is the unchanged rolling five-exchange SHADOW/PAPER evidence gate.
- Final runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false.

## Implemented PAPER Execution Replay and Mission Control (V100, 2026-08-15)

- Added a six-stage animated replay to the existing BOT FOCUS cockpit: SIGNAL, QUALIFIED, BUY LEG, SELL LEG, RECONCILED and SETTLED.
- Every replay value comes from the latest persisted closed Strategy #1 PAPER settlement: market, route, quantity, buy/sell prices, capital, fees plus TDS, net P&L and final completion time. No intermediate timestamp or execution claim is fabricated.
- The replay is permanently labelled `PAPER REPLAY · NOT LIVE` and `NO EXCHANGE ORDER SUBMITTED`.
- Added a `MISSION` button to the existing BOT hero. It opens a full-screen dark-neon PAPER Mission Control with today P&L, credible settlement count, fresh accepted opportunities, lightning-path status, the six-stage replay, top PAPER target, safety boundary and latency rail.
- Mission Control permanently displays `PAPER · LIVE OFF`, order count `0` and a simulation-only footer. It introduces no execution control or LIVE authority.
- Mission Control uses the existing personal-BOT response and refresh cycle. No API, polling interval, backend path, package, chart library, image or new module/file was added.
- The overlay locks background scrolling while open, closes from a 44px touch target, supports Escape through its React keyboard handler, respects mobile safe areas and disables new animation under reduced-motion preference.
- Frontend lint/build passed. Real PAPER data was visually verified at desktop `1440×1000`, iPhone `390×844` and Android `412×915`; all three had zero page-level horizontal overflow. The replay track intentionally supports horizontal swipe on phones.
- Production sizes after V100 were approximately `19.00 kB` gzip for global CSS and `21.68 kB` gzip for the BOT chunk.
- Only frontend and gateway containers were recreated on AWS. The backend was not restarted and remained healthy throughout.
- Post-deployment frontend and gateway were healthy. Runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false.

## Implemented Personal Capital Manager V100.1 (2026-08-15)

- Added `CAPITAL` as a third view inside the existing BOT page; no new sidebar module, polling loop or unrelated package was added.
- The manager is explicitly `ADVISORY_ONLY`. It reads the existing five-exchange authenticated balance snapshot, current Strategy #1 inventory plan and durable route ranking, then names the next operator action.
- Initial Tiny-LIVE policy is displayed as a `₹3,000` recommended bankroll: maximum `₹2,000` combined exchange exposure, `₹1,000` off-exchange bank reserve, `₹100` per leg and `₹200` two-leg minimum. This is a safety policy, not a profit claim or automatic allocation.
- The manager reports the current BUY wallet and SELL inventory requirements in native units, shows positive assets for all five venues without adding unlike currencies, and distinguishes current route evidence from historical rank.
- Missing or stale evidence remains fail-closed. Historical route ranking can never authorize funding by itself.
- Every generated action has `automaticExecutionAllowed=false`. Automatic fund movement, transfer initiation, withdrawal initiation, balance mutation, LIVE execution, exchange order submission and bank withdrawal are all disabled.
- PAPER capital/accounting is isolated and the manager has no dependency on transfer, withdrawal, order or PAPER command paths.
- Backend build, frontend lint/build, focused manager tests and the full deterministic suite passed (`165/165`). Real exchange APIs and confirmation-sensitive order tests were not part of that deterministic suite.
- Production UI was checked against real AWS report data at desktop `1440×1000`, iPhone `390×844` and Android `412×915`; all widths had zero page-level horizontal overflow.
- The reporting-only backend/frontend deployment caused a brief planned container restart around `2026-08-15 18:45 IST`. Persistent PAPER ledger data was retained, execution semantics were unchanged and this was not treated as a reset of the active soak window.
- Final runtime was healthy: BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false, exchange order submission false and Capital Manager automatic fund movement false.
- Future authority, if pursued after genuine LIVE evidence, must progress separately through `MANUAL_APPROVAL`, capped/allowlisted auto-rebalancing and `EMERGENCY_FREEZE`; no such authority exists in V100.1.

## Personal Capital Manager Phase A/B V101 (2026-08-15)

- Extended the existing BOT → CAPITAL view and `PersonalCapitalManagerService`; no duplicate manager, transfer worker, new polling loop, sidebar module or unrelated package/file was added.
- Phase A now reconciles fresh authenticated balances into per-asset native totals. Explicit INR balances form a verified INR subtotal; BTC, USDT and every other positive asset remain unvalued until authoritative conversion evidence exists.
- `allAssetPortfolioValueInr` is deliberately `null` when positive non-INR assets lack conversion evidence. Missing/stale balance evidence remains `NO DATA`, never an inferred zero.
- PAPER budget/equity stays in a separately labelled isolated ledger and is never included in authenticated LIVE balance totals.
- PAPER profit is separated into reconstructed gross trading profit, trading fees, economic net P&L, TDS withheld, deployable cash P&L and realized losses. Safely withdrawable profit and tax reserve remain `null` until a reconciled LIVE ledger exists; PAPER profit is never reported as withdrawable money.
- Phase B uses the exact fresh Strategy #1 route requirements for BUY quote and SELL base inventory targets. It reports current, target, deficit/surplus and estimated operating cycles in native units.
- Static equal allocation is prohibited. Durable PAPER settlement demand ranks venues, but historical evidence alone cannot create a target, scale capital or move funds.
- The current stage is `SINGLE_CYCLE_TINY_LIVE_ADVISORY`: target, minimum and maximum remain one exact route cycle. Scaling remains locked until reconciled Tiny-LIVE evidence and a later explicit authority phase.
- The deployed real-data snapshot correctly kept `₹1,000` explicit INR separate from SHIB, USDT and XRP, so the all-asset INR portfolio value stayed `NO DATA`. A live-changing route produced exact dynamic deficits without a transfer action.
- Tests cover INR-versus-USDT separation, stale balance rejection, missing-value handling, PAPER/LIVE isolation, dynamic target generation and zero fund-movement authority. Frontend lint/build and full deterministic regression passed (`165/165`).
- Real-data responsive QA passed at desktop `1440×1000`, iPhone `390×844` and Android `412×915`, with zero page-level horizontal overflow.
- Post-deployment hot path remained `PASS`, with zero pending snapshots and zero dropped candidates. Runtime remained BOT enabled, `PAPER_ONLY`, PAPER execution enabled, LIVE execution false, order submission false and transfer authority `ADVISORY_ONLY`.
- Phase C manual-approved transfers, Phase D capped automatic rebalancing and Phase E conversational/withdrawal recommendations remain unimplemented and locked. They must not be activated before their preceding evidence phase is accepted.

## Strategy #1 Versioned Execution Policy V102 (2026-08-15)

- Added one immutable, code-registered Strategy #1 policy definition with separate discovery, qualification, PAPER and Tiny-LIVE-preflight stages. The active V1 preserves the currently proven thresholds; it does not silently tune policy during a trade.
- Every policy has a stable ID, positive revision and SHA-256 hash over all execution-critical values and safety invariants. Unknown, malformed or hash-mismatched policies fail before registration.
- Policy activation is append-only and fail-closed. A different registered version requires the exact confirmation, a paused personal bot, zero account open trades, zero active execution sessions/locks, zero non-terminal lifecycle orders and zero unresolved recovery incidents.
- The activation event is persisted before the in-memory active pointer changes. Restart restoration and explicit rollback use the same registered ID/revision/hash check; a failed persistence write cannot change the active policy.
- Newly created Strategy #1 execution plans now carry the active policy ID, revision and hash inside their validation hash. The identity propagates through primary/recovery order lifecycles, fill summaries, settlement records and execution audit records.
- Operator Settings now separates `Discovery & Legacy Defaults` from the authoritative versioned Strategy #1 policy card. The card shows all four stages, active revision/hash, activation-guard state and the still-unimplemented order-time last-look gate.
- A bounded activation API exists only for code-registered policies. It cannot accept arbitrary thresholds and no registered policy can enable LIVE orders, automatic fund movement or mid-trade mutation.
- Tiny-LIVE remains `PREFLIGHT_ONLY`, one trade at a time and `₹100` per leg. LIVE execution and exchange order submission remain OFF.
- Backend/frontend builds, frontend lint, architecture boundaries and the complete deterministic suite passed (`166/166`). Real exchange API and confirmation-sensitive order tests were not part of the deterministic suite.
- V102 was deployed to AWS from a checksum-verified 17-file archive after creating a source backup and `pre-v102` backend/frontend image tags. Backend, frontend and gateway rebuilt/recreated successfully and all returned healthy.
- The deployed operator-settings report returned active policy `strategy-one-execution-policy-v1`, revision `1`, hash `9b1bb50c7d8e199167507c5e758299dc644ae18ff08d670c1b516badf38682a3`, order-time TTL uncalibrated and LIVE order authority false.
- Post-deployment runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and order submission false. The activation guard correctly remained blocked only because the BOT was running.
- The separate pre-existing inactive `CLOCK_UNSAFE_BINANCE` record was explicitly reviewed and resolved after current authoritative clock evidence stayed healthy. Alert history now has 7 resolved records, 2 open non-critical records, zero unresolved CRITICAL and zero active CRITICAL records; no history was deleted or rewritten.

## Strategy #1 Order-Time Last-Look And Two-Leg Safety V103 (2026-08-15)

- Added one synchronous final Strategy #1 decision immediately before the only legacy arbitrage adapter boundary. It re-reads the exact BUY and SELL books, validates millisecond ages and cross-book skew, walks full requested depth, derives worst consumed limit prices, reads taker fees and recomputes post-slippage/post-buffer net profit.
- A blocked decision returns before `getAdapter()` or `execute()` is called. Missing books, stale/future timestamps, partial depth, missing fees, eroded profit, missing per-venue TTL, missing FOK mapping or missing authenticated fill confirmation all produce zero exchange-order calls.
- Explicit `timeInForce` now flows through the shared live request. Binance and Bybit preserve a tested explicit `FOK` mapping. CoinDCX, UnoCoin and the current CoinSwitch spot adapter reject a supplied TIF before signed I/O because their audited spot contracts do not yet provide the required mapping; they never silently ignore it or substitute GTC.
- The production venue registry is intentionally fail-closed: Binance/Bybit documentation proves IOC/FOK exists, but order-submission quote TTLs remain `null` and authenticated websocket fill confirmation is not yet owned by CAT PRO. No route is therefore real-order-ready from V103 alone.
- Approved isolated fixtures prove adjacent concurrent leg invocation with refreshed limit prices and record code-side dispatch skew. This is not a claim that two independent exchanges receive or fill orders atomically.
- Unequal fills stage one immutable `LIVE` residual recovery intent with exact source hash, route, direction, quantity and reference price. The intent has no capital reservation, automatic execution or order-submission authority.
- Deterministic fault tests cover approved fresh/full-depth evidence, stale BUY depth, missing FOK, zero adapter access on block, concurrent invocation, unequal fills and non-executable recovery staging. Binance/Bybit mapping fixtures also prove explicit FOK reaches the signed payload boundary.
- Local backend build and the complete deterministic suite passed `167/167`; architecture boundaries, frontend lint and frontend production build also passed. Real exchange APIs and confirmation-sensitive order tests were not used.
- Final V103 was deployed from checksum `89e49a427d4bc5a9c1b73f28bc93db7f43fbd5f73b84a9f498dcce2a4c74a449` after creating `/opt/cat-pro/backups/v103-source-predeploy-20260815.tgz` plus the monotonic-timing patch backup and `pre-v103` image tags. The built image passed its isolated V103 test before the running backend was replaced.
- Post-deployment backend, frontend and gateway are healthy. Runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and order submission false. The brief planned restart changed only the disabled LIVE submission boundary and did not change Strategy #1 PAPER policy/accounting, so the existing PAPER soak start was retained and the deployment is recorded here.
- Post-deployment clock runner was healthy with three attempts, zero overlap skips, no last error and `lastAllServerClocksHealthy=true`. Alert history was healthy with 7 resolved, 2 open non-critical, zero unresolved CRITICAL and `livePromotionBlocked=false`.

## Authenticated Private Fill-Event Owner V104 (2026-08-15)

- Added one Strategy #1-oriented owner for authenticated Binance and Bybit SPOT private order/fill events. It exposes no order-submission, cancellation, transfer, withdrawal or balance-mutation method.
- Binance `executionReport` acknowledgement/status evidence and `TRADE` fills are separated. A REST/WebSocket acknowledgement with zero executed quantity is never treated as fill proof.
- Bybit `execution.spot` is the fill source and `order.spot` is the cumulative status source. The owner preserves every execution ID, trading fee currency/amount and Bybit `extraFees` component such as India GST rather than silently dropping it.
- Every order must first have an immutable CAT PRO lifecycle/client-order identity. An exchange order ID may be learned from the first exact client-order event after an unknown acknowledgement, but an unknown external order is never auto-created, adopted, retried or submitted.
- Private events require the exact current authenticated account fingerprint, connection ID, increasing reconnect generation, unexpired session evidence and required subscribed topics. Old-generation events fail closed; sessions are intentionally not restored as authenticated after process restart.
- Accepted bindings/events are written to an append-only JSONL journal before in-memory state mutation. Restart replay reconstructs fills without exchange I/O. A full journal refuses the event before changing state.
- Fill idempotency is based on venue, non-secret account fingerprint, market and exchange execution ID. Unique delayed fills are still accumulated even when they arrive behind a newer terminal status; older status-only messages are journaled but cannot regress state.
- A final order is authoritative only when execution-event quantity, cumulative order quantity and remaining quantity reconcile. Bybit's documented duplicate `Filled` cancel race therefore cannot manufacture or remove a fill.
- Strategy #1 order-time venue contracts now read authenticated private-fill readiness from this owner instead of a static claim. Both Binance and Bybit remain `false` in production because an actual authenticated private WebSocket transport has not yet opened/subscribed a session; route-specific quote TTLs also remain uncalibrated.
- Deterministic fixtures cover acknowledgement-not-fill, unknown order, unknown acknowledgement binding, exact duplicate, delayed/out-of-order fill, old reconnect generation, new-generation replay, Bybit multiple event streams, additional fees, duplicate Filled/cancel race, journal capacity and restart reconstruction.
- Architecture boundaries passed; backend and frontend builds, frontend lint and the complete deterministic suite passed `168/168`. Real exchange APIs and confirmation-sensitive order tests were not used.
- V104 was deployed backend-only from checksum `8a64bd5fb753f2e1889eab185d2252f4c013f7e58b741795f642e5ce1bfb4142` after creating `/opt/cat-pro/backups/v104-source-predeploy-20260815.tgz` and image tag `cat-pro-backend:pre-v104`. The final image passed its isolated V104 test before the running backend was replaced.
- Post-deployment backend/frontend/gateway were healthy. Runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and exchange order submission false. Clock synchronization was healthy; alert history remained 7 resolved, 2 open non-critical, zero unresolved/active CRITICAL and `livePromotionBlocked=false`.
- The freshly restarted 512-sample hot-path window had zero pending/dropped candidate snapshots, but still reported `MISS` because market-update P99 was `48 ms` and decision-to-PAPER-completion P99 was `65 ms`. This early window is evidence to investigate, not a LIVE-speed claim and not proof of a V104 regression; the new private-fill owner is outside the scanner decision path.

## Authenticated Private Fill Transports And Durable Order Identity V105 (2026-08-15)

- Added actual authenticated Binance and Bybit private WebSocket transports for the existing V104 owner. No new UI, sidebar module, transfer path or unrelated package was introduced.
- Binance uses a signed WebSocket API user-data subscription and consumes `executionReport` events. Bybit authenticates the private stream and requires subscription acknowledgement for `execution.spot` and `order.spot`.
- A venue becomes ready only after authentication acknowledgement, required topic acknowledgement and a bounded signed-REST gap backfill. Socket construction or TCP/WebSocket connection alone can never claim readiness.
- Heartbeat expiry, authentication/subscription rejection, reconnect, stale generation and shutdown revoke the V104 session immediately. Old-generation messages cannot renew or mutate the current session.
- Reconnect uses bounded exponential backoff. Pre-ready event buffering, REST backfill candidates and log output are bounded; authentication secrets and raw signatures are never returned by diagnostics.
- The central Binance/Bybit gateway now persists an immutable owner binding before exchange I/O, supplies a deterministic client order ID when missing and attaches the acknowledged exchange order ID afterward. A persistence failure prevents I/O; an unknown acknowledgement remains evidence-incomplete and no-retry.
- The transport service exposes fill observation only. It has no order, cancellation, transfer, withdrawal or balance-mutation method, and the production central gateway remains constructed with `enabled=false`.
- Deterministic fixtures cover Binance auth/subscription, Bybit auth/topic acknowledgements, REST gap backfill before readiness, heartbeat/reconnect generation isolation, secret-safe diagnostics and durable binding before exchange I/O.
- Backend build, architecture boundaries, frontend lint/build and the complete deterministic suite passed `169/169`.
- V105 was deployed backend-only from checksum `7E68A800FE16BCC044838AE32CE75F838911CC187FD886E69A28CC4008438411` after creating `/opt/cat-pro/backups/v105-source-predeploy-20260815.tgz`, `/opt/cat-pro/backups/v105-root-env-predeploy-20260815` and image tag `cat-pro-backend:pre-v105`.
- Production diagnostics proved both real authenticated sessions `READY`: Binance subscription ID `0` and Bybit authenticated connection/topic acknowledgements were present. Both remained ready after a later 60+ second observation; no prior LIVE order existed, so the bounded backfill correctly found zero orders and zero fills.
- Post-deployment runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and order submission false. The 512-sample hot path was `PASS`: market-update P95/P99 `9/19 ms`, decision-to-queue `4/7 ms`, decision-to-start `4/7 ms`, completion P99 `13 ms`, pending `0`, dropped `0`. This is a current snapshot, not a guaranteed LIVE latency.
- Current clock evidence was healthy: Binance `+17 ms`, Bybit `-1 ms`, CoinSwitch `+6 ms`, CoinDCX locally corroborated within `17 ms`, and UnoCoin has no authoritative clock endpoint. A historical Bybit clock CRITICAL lifecycle record recurred while the underlying condition is now inactive; it was not silently auto-resolved. Active CRITICAL is zero, but explicit lifecycle review continues to block LIVE promotion.

## Strategy #1 Route And Venue Timing Evidence V106 (2026-08-15)

- Added a single bounded Strategy #1 timing-evidence owner. It samples fresh, non-fallback `EXECUTE` opportunities only and attributes evidence by exact market, BUY venue and SELL venue.
- Route evidence includes BUY/SELL quote age, decision-to-pipeline, decision-to-PAPER-queue, decision-to-PAPER-start/completion, final last-look duration and last-look-to-each-leg dispatch. Venue evidence includes quote age, adapter-result duration, private order-event transport and private fill-event transport.
- The central gateway and authenticated private-fill owner use optional observer ports. Observer failure is caught and recorded; it cannot turn a successful adapter/fill outcome into a failure or create order authority.
- REST backfill events are never admitted as private WebSocket transport evidence. PAPER completion is never represented as a real private fill.
- Evidence retention is bounded to 128 routes, 512 samples per metric and two persisted snapshots. Route samples are throttled to one per five seconds and persistence checkpoints run every five minutes.
- Calibration fails closed until each route has at least 512 public samples over at least one hour and both venues have at least 30 authenticated WebSocket fill samples. The output is an advisory maximum book age only, clamped to the fixed 25–250 ms review range, with `automaticallyApplied=false`.
- Added a read-only diagnostic endpoint at `/api/debug/diagnostics/strategy-one-execution-timing`; no frontend module or unrelated file was added.
- Backend build, architecture boundaries, frontend lint/build, focused timing/last-look/gateway fixtures and the complete deterministic suite passed `170/170`.
- V106 was deployed backend-only from checksum `EA96E7D2B02C1BC2D2232C144240CB3B0D5437AEEB0FDE17BB505EF2ED34D9E9` after creating `/opt/cat-pro/backups/v106-source-predeploy-20260815.tgz` and image tag `cat-pro-backend:pre-v106`. The built image passed isolated V106 timing and central-gateway tests before the backend/gateway containers were recreated.
- Initial production diagnostics retained evidence for all five venues with zero invalid samples and zero observer failures. Representative early route quote-age P99 values were already above the 250 ms ceiling, confirming why no TTL was auto-created from an immature sample window.
- Post-deployment backend/frontend/gateway are healthy. Runtime remained BOT enabled, `PAPER_ONLY`, effective PAPER execution enabled, LIVE execution false and order submission false. Hot-path P95/P99 was `3/4 ms` to PAPER queue, `3/4 ms` to execution start and `7/8 ms` to PAPER completion, with zero pending/dropped snapshots. This is a current snapshot, not guaranteed LIVE latency.
- The instrumentation-only backend restart did not alter PAPER policy, capital, economics or accounting, so the existing PAPER soak start remains valid and the deployment is recorded here.

## Strategy #1 LIVE Contract, Fault Safety And One-Time Authority V107–V111 (2026-08-15)

- V107 added one immutable official-contract registry for the first Strategy #1 SPOT LIVE lane. Binance and Bybit are the only initial candidates because the implemented contracts support explicit FOK semantics, deterministic client-order identity and authoritative private fill evidence. CoinDCX, CoinSwitch and UnoCoin are explicitly excluded from Strategy #1 LIVE; market-data/read-only support does not imply safe order support.
- V108 added one durable two-leg owner for the Binance/Bybit lane. It persists PREPARED and DISPATCHING evidence before gateway I/O, submits both FOK legs concurrently, uses stable idempotency keys, never retries an unknown submission, and classifies unequal/unknown outcomes as possible exposure requiring reconciliation.
- V109 added restart recovery over the same pair journal. Non-terminal or possible-exposure sessions block new submissions, reconciliation always uses `allowNewSubmission=false`, and the block clears only after durable terminal balanced evidence or an explicit evidence-backed resolution. Recovery has no automatic order authority.
- V110 added route-specific timing calibration. Public evidence must be clean and mature; calibration is PROPOSED first, requires an exact operator approval phrase, expires in at most one hour and can be revoked. The first-attempt bootstrap scope cannot authorize a second attempt without authenticated real-fill timing evidence. A calibration never grants order authority.
- V111 added the only one-time Strategy #1 Tiny-LIVE action authority. It binds the exact opportunity, route, approved calibration, action-time preflight hash, funded quantity and fixed `₹100` per leg. The exact `AUTHORIZE <authority-id>` phrase is required, authority expires after three seconds, consumption is journaled before coordinator access, pair binding is journaled before pair dispatch, daily attempts are capped at three and concurrency is one.
- The V111 authority journal validates every restored record and state transition. Invalid or mutated immutable lineage fails startup instead of restoring usable authority. Automatic retry, transfer, withdrawal and fund movement remain prohibited.
- LIVE runtime capability now requires all four exact process-start gates: `TRADING_MODE=live`, `LIVE_TRADING_ENABLED=true`, `ARBITRAGE_LIVE_CONFIRMATION=ENABLE_CONFIRMED_ARBITRAGE_EXECUTION`, and `STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION=ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME`. The committed Compose and example environment keep the new gate empty, so deployment remains fail-closed.
- Deterministic tests prove contract exclusion, journal-before-I/O, concurrent dispatch, no-retry unknown outcomes, restart reconciliation, timing proposal/approval/expiry/revocation, exact one-use authority and restart restoration without making an external exchange request or order.
- Backend build, frontend production build, architecture boundaries, diff hygiene and the complete deterministic suite passed `175/175`. The suite explicitly excludes real exchange API and confirmation-sensitive real-order testing.
- V107–V111 were deployed backend-only from checksum `6f57abd32694181919fc88ee74dd554d3b2242d58bfbaab06e3c05eeda39d363` after creating `/opt/cat-pro/backups/v111-source-predeploy-20260815.tgz` and image tag `cat-pro-backend:pre-v111`. The new image passed isolated V109, V111 and central-gateway tests before replacement.
- Post-deployment backend/frontend/gateway are healthy with backend restart count zero. Runtime remains BOT enabled, `PAPER_ONLY`, PAPER execution enabled, `LIVE_TRADING_ENABLED=false`, both confirmation variables empty, LIVE execution false and order submission false. Binance and Bybit authenticated private streams returned `READY`; the pair-recovery gate returned `CLEAN` with zero sessions/exposure.
- The inactive recurrent `CLOCK_UNSAFE_BYBIT` alert was resolved only after current authoritative evidence reported Bybit healthy, synchronized, signed requests allowed and `1 ms` offset against the `2000 ms` limit. Alert history now has zero unresolved/active CRITICAL records and `livePromotionBlocked=false`; history was preserved.
- The first full one-hour V106 sample window truthfully rejected `WALUSDT:bybit->binance`: code-side decision-to-execution-start was fast (`P50 1 ms`, `P95 5 ms`, `P99 13 ms`), but BUY/SELL quote-age P99 was `2047/2206 ms`, so no value fit the immutable `250 ms` advisory ceiling. No V110 proposal or approval was manufactured.
- Deployment therefore remains PAPER-safe and engineering-complete, but not empirically LIVE-ready. These builds create a controlled path but do not activate it. A clean eligible Binance/Bybit route timing window, exact two-leg inventory, current action-time checks, explicit bounded timing approval and a separate action-time Tiny-LIVE decision are still required before the first order attempt.

## Strategy #1 Pilot-Equivalent PAPER Freshness V112 (2026-08-15)

- V112 separates broad five-exchange research PAPER results from the exact first Strategy #1 LIVE pilot lane. Only Binance↔Bybit SPOT routes can enter the pilot-equivalent cohort; CoinDCX, CoinSwitch and UnoCoin remain useful for PAPER research but cannot provide this LIVE-readiness evidence.
- Binance↔Bybit qualification now requires both exact quote timestamps to be no more than `250 ms` old, no more than `250 ms` apart, executable, non-fallback and already classified `EXECUTE`. The check uses the actual qualification time rather than the earlier snapshot timestamp.
- The final PAPER stress gate independently re-reads both full books and applies the same immutable `250 ms` age/skew ceiling to Binance↔Bybit. The existing seconds-wide venue policy continues only for non-pilot research routes.
- A new bounded evidence owner observes the authoritative snapshot before qualification. It stores at most 128 routes and 4,096 recent generation keys per route, uses an O(1) in-memory generation index and never counts the same BUY/SELL timestamp pair twice.
- Each unique generation is classified as execution-grade or rejected with exact reasons: stale BUY, stale SELL, cross-book skew, invalid timestamp, fallback, non-executable quote or non-EXECUTE decision. Calibration readiness requires at least 512 unique execution-grade generations across at least one hour.
- V110 timing proposal generation is now additionally restricted to the exact Binance/Bybit lane and refuses a proposal until the V112 unique-generation cohort is mature and its persistence/observer health is clean. No stale/repeated legacy timing window can create a proposal.
- Added a read-only diagnostic endpoint at `/api/debug/diagnostics/strategy-one-pilot-equivalent-paper`. It has no LIVE, order, transfer, withdrawal or fund-movement method.
- Local backend/frontend builds, frontend lint, architecture boundaries, diff hygiene and the complete deterministic suite passed `176/176`. Real exchange API and confirmation-sensitive order tests remain excluded.
- V112 was deployed backend-only from checksum `863c546115f451652ac4569463a5ed4ae0a3203134aed30f591be9bb059b5c19` after creating `/opt/cat-pro/backups/v112-source-predeploy-20260815.tgz` and image tag `cat-pro-backend:pre-v112`. The built image passed isolated V112 freshness, V110 calibration and final PAPER stress tests before replacement.
- Post-deployment backend/frontend/gateway/edge are healthy and backend restart count is zero. Runtime remains BOT enabled, `PAPER_ONLY`, PAPER execution enabled, LIVE false and order submission false. Binance and Bybit authenticated private streams are both `READY`; two-leg LIVE sessions and in-flight submissions are zero.
- The first production V112 sample found `WALUSDT:bybit->binance`: 13 unique generations, 8 execution-grade and 5 rejected for stale SELL plus cross-book skew. This early sample is not mature; it proves the new classifier is working, not that the route is LIVE-ready.

## Exact Pilot Preview And Headroom-Aware Calibration V113-V114 (2026-08-15)

- V113 removed the remaining preview mismatch: Strategy #1 Tiny-LIVE preflight now considers only the audited Binance↔Bybit SPOT lane. CoinDCX, CoinSwitch and UnoCoin can still contribute research PAPER evidence, but are counted as excluded and can never appear as a Tiny-LIVE alternative.
- The V113 preview reports the immutable `250 ms` maximum execution-grade book age and cross-book skew, includes an explicit `AUDITED_LIVE_VENUE_CONTRACT` check, and identifies how many current and historical non-pilot routes were excluded.
- The first production V113 preview selected only `WALUSDT:bybit->binance`; one current and 31 historical non-pilot routes were excluded. Its remaining blockers were real two-leg inventory: fresh Bybit USDT BUY funds and fresh Binance WAL SELL inventory were unavailable.
- V114 adds bounded BUY and SELL execution-grade quote-age distributions to the V112 evidence owner. Each route retains at most 512 samples per side and reports P50/P95/P99/max without weakening the unique-generation, persistence or one-hour maturity requirements.
- Existing V112 checkpoints migrate fail-closed: prior unique-generation counts and rejection evidence restore, but absent timing distributions start empty and must collect 512 fresh retained samples per side before calibration readiness.
- V110 no longer derives a candidate TTL from the seconds-stale broad V106 quote-age cohort. It now requires the exact V112 route to be mature, reads its execution-grade BUY/SELL P99, and reserves `ceil(V106 decision-to-execution-start P99 + 10 ms)` inside the immutable `250 ms` ceiling.
- A proposal is refused when the execution-grade quote P99 cannot fit inside that post-dispatch budget. The derived TTL remains bounded to `25–250 ms`, must still be explicitly approved, expires within one hour, grants no order authority and cannot bypass the V111 action-time last look.
- Local backend build, frontend lint/build, architecture boundaries, diff hygiene and the complete deterministic suite passed `176/176`. Real exchange API and confirmation-sensitive order tests remain excluded.
- V114 was deployed backend-only from checksum `b96ad8e3b469df8c057289e81092de6ac3826fe38d635ef6fac77286b2458ec4` after creating `/opt/cat-pro/backups/v114-source-predeploy-20260815.tgz` and image tag `cat-pro-backend:pre-v114`. The built image passed isolated V112 evidence, V110 calibration, V113 preflight and V111 authority tests before replacement.
- The post-deployment V112 checkpoint restored as one valid record with zero malformed records. `WALUSDT:bybit->binance` retained 512 fresh samples per side: BUY P99 `174 ms`, SELL P99 `234 ms`; V106 decision-to-execution-start P99 was `10 ms`, so V114 would reserve a `20 ms` dispatch budget and could not approve a TTL above `230 ms`. The current SELL P99 therefore does not fit and no proposal is created.
- The first V114 production checkpoint then persisted successfully (`writes=1`, `writeFailures=0`, sequence `2`) with both bounded 512-sample distributions present. The later snapshot remained fail-closed at BUY/SELL P99 `196/233 ms` against the same `230 ms` headroom-safe maximum.
- The route also remained immature at about 23 minutes of execution-grade span versus the required one hour. This is an empirical waiting condition, not unfinished code and not a reason to relax the ceiling.
- Post-deployment backend/frontend/gateway/edge are healthy with backend restart count zero. Runtime is BOT enabled, `PAPER_ONLY`, PAPER execution enabled, all four LIVE/order gates fail closed, both authenticated private streams are `READY`, active CRITICAL alerts are zero, two-leg LIVE sessions are zero and Tiny-LIVE attempts are zero.

## Strategy #1 Route Headroom And Scanner Admission V115 (2026-08-16)

- Production tracing separated code latency from venue cadence. The existing scanner showed latest-update-to-decision P99 around `17 ms`, while a temporary isolated 30-second direct Binance WALUSDT WebSocket probe observed sparse actual depth arrivals: 61 intervals with P50 `300 ms`, P95 `1,400 ms` and P99/max `2,701 ms`. The route cannot be made fresh by merely lowering a local timer or quote-age gate.
- The production scanner had received more than 4.6 million executable updates while holding only 477 executable quotes across 2,353 cached quotes; the Node backend was using about one full CPU core. Most updates belonged to markets present on only one executable venue and therefore could not form a cross-exchange route.
- Market cache now maintains one synchronous O(1) `market → executable venues` index. An executable UPSERT wakes the Strategy #1 scanner only when the same market currently exists on at least two distinct venues. The second venue is never suppressed, and every invalidation, removal or clear still wakes the scanner so stale opportunities are removed immediately.
- Diagnostics now expose `singleVenueUpdatesSuppressed`. The optimization changes admission work only; it does not change quote timestamps, market coverage, liquidity, fees, profitability, execution policy, PAPER accounting or LIVE/order authority.
- Added a read-only V115 timing-headroom review for each exact Binance/Bybit pilot route. It preserves the immutable `250 ms` ceiling, reserves `ceil(V106 decision-to-execution-start P99 + 10 ms)` for dispatch and requires at least another `10 ms` of residual operating headroom beyond the worst V112/V114 execution-grade BUY/SELL P99.
- A V110 proposal is now blocked when the route only barely fits the mathematical ceiling. The timing review cannot relax thresholds, auto-propose, auto-approve, create one-time authority or submit an order.
- The Tiny-LIVE preview now includes `PILOT_TIMING_HEADROOM`, reports the exact residual in milliseconds and ranks mature candidates by READY state plus residual headroom before historical PAPER rank. A slow route is therefore rejected before any funding recommendation.
- Deterministic boundary tests prove that single-venue noise is suppressed, the second venue is admitted, destructive cache events are always admitted, a route with only `6 ms` residual remains blocked and a route with `206 ms` residual is review-ready.
- Local backend and frontend production builds plus focused timing/preflight/authority/freshness tests passed. The complete deterministic suite passed `177/177`; real exchange API and confirmation-sensitive real-order tests remain intentionally excluded.
- V115 was deployed to AWS from checksum `4c0ad6b2ab39f9eba9c485c7dbf1d92cf291bfc5a4ce9163e22ce782c5e3df46` after creating `/opt/cat-pro/backups/v115-source-predeploy-20260816.tgz` and image tags `cat-pro-backend:pre-v115` plus `cat-pro-frontend:pre-v115`. Both newly built images passed isolated admission, timing, pilot-preflight and one-time-authority tests before container replacement.
- Post-deployment backend/frontend/gateway/edge are healthy with backend/frontend restart count zero. Binance and Bybit authenticated private streams are `READY`; central and Strategy #1 pair restart recovery are `CLEAN`; two-leg sessions and in-flight submissions are zero; alert history has zero active/unresolved CRITICAL records.
- Early post-restart evidence recorded 36,750 single-venue suppressions out of 127,669 executable updates. Event latest-update-to-decision P95/P99 was `10/14 ms`; backend CPU was `59.56%` versus the pre-change snapshot around `101.66%`. These are short operational snapshots, not a guaranteed latency or CPU claim.
- The final V115 checkpoint selected `WALUSDT:bybit->binance` only for review and blocked it: V106 dispatch budget `17 ms`, maximum allowed book age `233 ms`, execution-grade BUY/SELL P99 `211/246 ms`, residual headroom `-13 ms` versus the required `+10 ms`. Funding was also blocked and no proposal, approval, authority, session or order was created.
- Runtime remains BOT enabled, `TRADING_MODE=paper`, `LIVE_TRADING_ENABLED=false`, both LIVE confirmation values empty, LIVE execution false, exchange-order submission false and automatic fund movement false.

## Exchange-Executable Tiny-LIVE Policy V116 (2026-08-16)

- Public exchange-rule verification found that current `WALUSDT` requires at least `5 USDT` notional on Binance and at least `5 USDT` order amount on Bybit. The legacy fixed `₹100` pilot is only about `1.01 USDT` and therefore cannot become an exchange-valid order on this audited lane.
- Added versioned policy `strategy-one-execution-policy-v2-exchange-minimum` with the existing hard ceiling of `₹500` per leg. The legacy V1 policy and its append-only history remain unchanged.
- Strategy #1 pilot funding, core preflight, capital placement and one-time action authority now bind the amount from the active versioned policy instead of independently hard-coding `₹100`.
- Current order rules, INR/quote conversion, round-down-only shared quantity normalization, fresh balances, timing headroom, minimum `0.50%` net return, post-stress economics and one-time authority still fail closed. The policy never rounds exposure upward to force an exchange minimum.
- Local backend build, frontend production build and the complete deterministic suite passed `177/177`. Real exchange API order submission and confirmation-sensitive tests remain excluded.
- V116 was deployed from checksum `6b34d707d84f4dbffccc37d5af322a54b480be0f384c517bfe56b4995e0c607a` after creating `/opt/cat-pro/backups/v116-source-predeploy-20260816.tgz` and image tags `cat-pro-backend:pre-v116` plus `cat-pro-frontend:pre-v116`. Focused policy, pilot-preflight, one-time-authority, capital-placement and order-time-safety tests passed inside the new backend image before replacement.
- Post-deployment backend/frontend/gateway/edge are healthy. Runtime remains `TRADING_MODE=paper`, `LIVE_TRADING_ENABLED=false`, account `PAPER`, Tiny-LIVE runtime gate false, zero Tiny-LIVE attempts and no blocking authority.
- After the operator selected `₹1,000` equivalent on each of the first two pilot exchanges, the personal bot was briefly paused, the activation guard proved zero open trades/sessions/locks/non-terminal orders/recovery incidents, and V2 was activated with the exact versioned-policy confirmation. The bot was then resumed in `PAPER_ONLY` mode.
- Active policy is now `strategy-one-execution-policy-v2-exchange-minimum`, revision `2`, hash `e98db3bfc7bf56ed9e1cdfe37f6293bf833bc45c705e9545ab8dcc9245b041e5`, with `₹500` per leg and `₹1,000` nominal two-leg inventory. LIVE runtime and order submission remain false.
- Initial Tiny-LIVE funding scope is Binance plus Bybit only. The operator plans `₹1,000` equivalent per exchange; only `₹500` per leg may be used by one pilot attempt, leaving the remainder for fee/rebalancing buffer. Exact quote/base allocation must wait for a fresh timing-safe route and current order-rule/funding preflight.

### Latest operator handoff snapshot

- All four deployment containers are running; backend, frontend and gateway are healthy. Runtime is `paper`, account mode `PAPER`, bot/account enabled, emergency stop clear and open trades `0`.
- Active Strategy #1 policy is V2 at `₹500` per leg. Tiny-LIVE runtime gate is false, attempts today `0`, blocking one-time authority absent and all LIVE/order/fund-movement flags remain false.
- Current pilot state is `WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY`; no fresh executable Binance/Bybit route is selected. This is a market wait, not permission to bypass timing, order-rule, funding or post-stress checks.
- Funding has not yet arrived. Binance currently reports `0.20700545 USDT` plus immaterial SHIB/XRP dust; Bybit reports no assets. The operator intends to add approximately `10 USDT` net to each exchange as staging inventory.
- Do not pre-buy WAL or another base asset until a fresh timing-safe route is selected. After staging balances synchronize, refresh balances read-only, select the exact route, and convert only the SELL venue's required reserve to the selected base asset. Keep exchange API withdrawal permission disabled.
- The first real attempt remains a separate action-time operation: exact route preflight, approved timing calibration, trade-enabled Binance/Bybit keys, fresh balances/rules/fees/depth, at least `0.50%` post-stress net return, explicit one-time authority and live monitoring are all required.

## Capital sizing principle

- Current PAPER defaults are `₹100,000` budget, `₹100` minimum/trade, `₹1,000` maximum/trade, `₹100` step and `₹3,000` maximum batch capital, unless runtime operator settings override them.
- PAPER allocation is adaptive within the configured bounds and considers available capital, candidate quality, route history, execution simulation, exchange exposure and batch headroom.
- Actual route quantity is further capped by two-leg depth, both balances, fees and exchange order rules.
- Increasing total capital does not automatically raise the per-trade safety ceiling.
- Future LIVE sizing must remain the minimum of operator cap, available capital, route depth, both funded balances, exposure limits, TDS headroom and optimizer output.

## Next focused work

1. Keep Strategy #1 PAPER plus the V106/V112/V114/V115 timing and freshness collectors running. Review only a route with at least 512 unique execution-grade generations, 512 retained BUY and SELL age samples, at least one hour of evidence and at least `10 ms` residual operational headroom; never lower the fixed `250 ms` ceiling or auto-approve a derived TTL.
2. Resolve any active CRITICAL alert, restart-recovery exposure or persisted duplicate-order risk through its evidence-backed operator workflow. Never rewrite or silently clear history.
3. Confirm both Binance and Bybit authenticated private streams are currently READY, clocks are safe, API keys are trade-enabled without withdrawal permission, and the exact candidate route has fresh rules, fees, depth and two-leg inventory.
4. Generate a V110 timing proposal only after the exact Binance/Bybit route is mature in V106/V114 and V115 reports READY; verify that its quote-age P99, measured dispatch budget and `10 ms` residual operating reserve fit inside `250 ms`, then approve it only with the exact bounded phrase. Approval is not order authority.
5. Run the V111 read-only preview for one exact current opportunity. It must bind the active V2 policy amount of exactly `₹500` per leg and return no blocker before any action-time decision is requested.
6. Do not change the four runtime variables or call the execute endpoint automatically. Starting the first Tiny-LIVE attempt remains a separate action-time operator decision and must be performed while watching private fills, pair journal, recovery and the kill switch.
7. After an explicitly authorized first attempt, reconcile both exchange orders and fees before declaring success. Any unknown or unequal outcome blocks further submissions and requires manual evidence-backed recovery resolution.
8. Do not permit attempt two until authenticated real-fill timing supports a continuous V110 calibration. Do not scale beyond the active `₹500` per-leg V2 ceiling until a later evidence-backed policy change; PAPER results cannot substitute for LIVE fill evidence.

## Atomic inventory, read-only rebalancing and measured hot-path release V121–V124 (2026-08-16)

- V121 added one authoritative normalized five-exchange inventory snapshot. Native asset units remain separate, current USDT valuations are explicit, PAPER accounting is never mixed into wallet capital, and exchange/asset reservations are subtracted from available inventory.
- Strategy #1 now reserves the exact BUY quote requirement plus fee headroom and the exact SELL base quantity atomically before the two-leg dispatch boundary. A conflict rejects the complete reservation; no partial hold or double-spend is possible. Release, commit, expiry and uncertain-exposure retention are deterministic.
- V122 added centralized configurable target/minimum/maximum allocations and fail-closed imbalance detection. `transferableSurplusUsdt` is capped by both surplus above target and the reservation/emergency/minimum-safe capacity, so a balanced or underfunded venue never appears as a source.
- V123 reuses the existing credible Strategy #1 settlement-flow report to detect natural reverse routes. Its maximum `5 bps` bonus is rank-only: actual expected/realized profit, qualification thresholds, accounting and LIVE eligibility are never modified.
- V124 added a read-only direct route planner. It produces the smallest useful no-loop source/destination analysis, blocks while execution recovery or settlement reconciliation is pending, and exposes no order, transfer, withdrawal, address or network-selection authority.
- Read-only diagnostics are available at `GET /api/portfolio/rebalancing-inventory` and `GET /api/portfolio/rebalancing-status`. Production currently returns `BLOCKED_EVIDENCE` because Binance has unvalued positive dust and UnoCoin has a stale SHIB valuation; unknown asset value is not silently treated as zero.
- The final measured speed pass added a trusted normalized quote-grouping path and removed candidate-by-flow map rebuilding from the rebalance ranker. On the same local synthetic workload, 200 groupings of 5,000 quotes improved from `199.461 ms` to `60.541 ms` (about `3.3x`), and a 5,002-flow/1,000-candidate cold rebalance pass improved from `1,313.252 ms` to `5.754 ms` (about `228x`). These are code microbenchmarks, not exchange-latency or profit guarantees.
- Architecture checks, script policy tests, backend build, frontend lint/build and the complete deterministic suite passed `184/184`. Real exchange APIs and confirmation-sensitive real-order tests remain intentionally excluded.
- AWS deployment used checksum `59094ddc3fd70daeb458428fbd5c86158c391045ffe5aaa84427413e6729a45b`, source backup `/opt/cat-pro/backups/v124-source-predeploy-20260816.tgz`, rollback image `cat-pro-backend:pre-v124`, and final backend image `sha256:3a0c171f45d0341b605eba5c0058576770fabc4b929b3d9b4651bf21c1b929df`.
- Post-deployment backend/frontend/gateway/edge are healthy; backend restart count is zero. Runtime remains `PAPER_ONLY`, PAPER execution enabled, LIVE execution false, order submission false, transfer/withdrawal submission false, and Strategy #1 two-leg recovery is `CLEAN` with zero unresolved sessions.
- Binance and Bybit signed API permission evidence is `READY`: read plus spot trading are verified, withdrawals/internal transfers are disabled, and explicit IP restriction is present. No key, secret, signature or bound IP value is exposed by the report.
- The fresh production hot-path window is `PASS`: market-update-to-decision P95/P99 `10/13 ms`, decision-to-PAPER-queue P95/P99 `4/5 ms`, candidate-decision-to-start P95/P99 `4/5 ms`, completion P99 `6 ms`, and dropped candidate snapshots `0`. This is a post-restart operational snapshot, not a guaranteed LIVE latency.
- Tiny-LIVE closure remains truthfully `BLOCKED` at `5/7` prerequisites (`71.43%`). Two clock alerts (`CLOCK_UNSAFE_COINSWITCH`, `CLOCK_UNSAFE_BINANCE`) are cleared but require explicit operator resolution; CoinSwitch and UnoCoin still need rolling SHADOW/PAPER stability evidence. These conditions were not auto-resolved or bypassed.
- Current pilot preview is `WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY`: zero fresh Binance/Bybit EXECUTE routes, seven historical adapter-ready routes, active V2 amount `₹500` per leg, no selection, no authority and no order. The next attempt must wait for a real current route and pass timing, funding, rules, fees, depth, post-stress economics and the separate exact one-time authorization.

## First operator-confirmed Tiny-LIVE arm V125 (2026-08-17)

- V125 is deployed on AWS. The backend image is `sha256:dadc8eadf7632c011ff90bc6b7fba4f9e0b68d98106adabe82211f7e7dcaca27`; the frontend image is `sha256:7f5d104ab72610c56e74d5556656fd0a2a81fd9befdd2598b68526f2186e2690`. Rollback tags are `cat-pro-backend:pre-v125` and `cat-pro-frontend:pre-v125`.
- `docker-compose.tiny-live.yml` is the dedicated runtime override. The PAPER overlay must not be combined with it. LIVE execution remains restricted by the exact route-bound durable one-shot pre-arm; automatic retry, transfer and withdrawal authority remain disabled.
- Binance and Bybit signed permissions were READY with read plus spot trading enabled, withdrawals/internal transfers disabled and IP restriction present. The operator manually pre-positioned WAL on Binance before arming.
- Exact-route bootstrap timing calibration `timing-34bc50d4e297b6749f6e620817520f13` for `WALUSDT:bybit->binance` was explicitly approved with a `231 ms` maximum book age. Calibration approval alone did not authorize an order.
- The operator explicitly armed `WALUSDT`, Bybit BUY to Binance SELL, at `₹500` per leg for 15 minutes. Durable pre-arm ID: `tiny-live-prearm-5e148553100c2eaa88f7aad62c7612f6`.
- No fresh executable Binance/Bybit Strategy #1 opportunity met the current action-time gates during the arm window. The arm expired unused with no claim, authority, session or exchange order. Attempts today remained `0`; this was a safe no-trade outcome, not LIVE fill evidence.
- Final signed balance reconciliation was unchanged: Binance `250.8489 WAL` plus `28.70791545 USDT`; Bybit `10.98 USDT`; all reported unlocked and synchronized. Order lifecycle totals, two-leg LIVE sessions and in-flight submissions were all zero. Recovery was running with zero open/critical incidents and automatic emergency submission disabled.
- Runtime remains Tiny-LIVE-capable but disarmed. A later attempt requires a current approved calibration and a new exact operator pre-arm confirmation. Do not claim Tiny-LIVE trading success until authenticated real fills settle and both legs plus fees reconcile.

## Quick verification commands

From the Windows workspace, use the configured SSH key without copying any credential into this file:

```powershell
ssh -i C:\Users\ROG\.ssh\cat-pro-paper-key ubuntu@15.252.113.245 "nproc; free -h; cd /opt/cat-pro && docker compose -f docker-compose.yml -f docker-compose.paper.yml -f docker-compose.https.yml ps"
```

Read-only BOT truth from inside the VPS:

```bash
curl -sS http://127.0.0.1:8080/api/strategies/personal-bot | jq '{state:.data.state,control:.data.control,dailyActivity:.data.paper.dailyActivity,hotPath:.data.hotPath}'
```

## Secret-handling note

- No passwords, API keys, exchange secrets, Basic Auth secrets or private-key contents are stored in this handoff.
- Do not paste secrets into source code, documentation, chat summaries or command output.
