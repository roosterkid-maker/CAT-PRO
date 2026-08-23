# CAT PRO Persistent Handoff

Last updated: 2026-08-22 12:48 IST (Asia/Kolkata)

## Current authoritative summary

This section is the current source of truth. The detailed build history below is retained for audit context; when an older statement conflicts with this section, use this section.

### V190 Bybit action-time basket refresh deployed — 2026-08-22 12:48 IST

- Root cause of a real seven-coin pilot gap was confirmed: the immutable basket includes CoinDCX/Bybit directions, but the final action-time public-book refresh service only refreshed CoinDCX and Binance. Those Bybit directions could therefore reach the pilot boundary with stale/not-refreshed Bybit books and fail before order submission.
- `BybitAdapter` now owns a bounded action-time REST depth refresh, validates and normalizes the returned snapshot, applies it to the canonical shared order-book cache, and reports exact request/receive timestamps. The Strategy #1 refresh service now refreshes the exact two exchanges on each approved basket direction, including CoinDCX/Bybit, rather than assuming CoinDCX/Binance.
- No profit, fee, TDS, inventory, capital, timing, freshness, skew or risk threshold changed. No evidence/history was reset or deleted. The patch does not fabricate an opportunity and does not guarantee a successful fill; it only closes the missing Bybit refresh path so a genuine qualified CoinDCX/Bybit candidate can reach the existing final gates.
- Local backend TypeScript build, focused Bybit action-time regression and complete deterministic suite passed `206/206`. Real exchange APIs and confirmation-sensitive order tests were not included.
- AWS deployment used only the backend source patch; frontend, gateway, edge, balances, API permissions and credentials were untouched. Post-deploy production bundle contains `refreshBybit`; backend/frontend/gateway are healthy, backend restart count is `0`, gateway returns HTTP `200`, and the recent fatal/unhandled scan is empty.
- A post-deploy read-only AWS smoke test fetched the real Bybit `GPSUSDT` depth successfully: `50` bids, `50` asks, accepted snapshot and approximately `118 ms` round trip inside the unchanged `190 ms` action-time read timeout. This proves the deployed public refresh path and network call, not an exchange order or profitable fill.
- Durable post-deploy truth remains safely unarmed: `activeArm=null`, trigger inactive, account mode `PAPER`, and `activeLease=null`. The Tiny-LIVE-capable runtime environment remains present, but this deployment neither armed the basket nor submitted an exchange order.
- Sanitized artifact: `.deploy/cat-pro-v190-bybit-action-refresh-20260822.tgz`, SHA-256 `05BF42F3D820A688E138BF2A7DFEDDEB6FC2F3F43989571CFF55A9700D486D2B`. AWS rollback source: `/opt/cat-pro/.deploy/pre-v190-bybit-action-refresh-20260822.tgz`. Deployed backend image: `sha256:44021a23ae2f60c8fff8656c7f6e2ab51a98d2e95e50afbf86b1ba80dc6444da`.

### Strategy #1 seven-coin Tiny-LIVE runtime enabled, still unarmed — 2026-08-22 07:10 IST

- The operator supplied the exact confirmation `ENABLE STRATEGY ONE TINY-LIVE RUNTIME FOR 7-COIN PILOT ONLY`. Only `cat-pro-backend` was recreated with the dedicated base + `docker-compose.tiny-live.yml` + HTTPS profile; the PAPER and Tiny-LIVE overrides were not combined.
- Post-switch runtime flags are `TRADING_MODE=live`, `TRADING_EXECUTION_MODE=live`, `LIVE_TRADING_ENABLED=true` with all required exact runtime/order confirmation values present. Backend health is `healthy`, restart count `0`, OOM false, and Strategy #1 restart recovery is `CLEAN` with zero unresolved or possible-exposure sessions.
- This switch did not arm the basket or submit an order. Authoritative post-switch state is: runtime gate `true`, active arm `null`, trigger idle, durable account mode `PAPER`, active account-mode lease `null`, blocking action authority `false`, Tiny-LIVE attempts today `0`, automatic transfer/withdrawal disabled.
- The immutable pilot remains seven coins / eleven directions at `₹500` per leg, maximum ten attempts over 180 minutes, stopping the batch on the first non-clean result. Current action-time audit was still `WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY` with zero fully preflightable current matches; runtime enablement alone is not an execution or profit claim.

### V189 paused-PAPER truth and seven-coin basket routing fix deployed — 2026-08-22 03:37 IST

- The BOT hero no longer labels current-hour historical settlements as active `Successful trades / hour` while PAPER automation is OFF. With PAPER ON it says `Successful PAPER trades / hour`; with PAPER OFF it says `PAPER closes this IST hour` and explicitly marks them `settled before pause · automation OFF`. At verification the stored 03:00-04:00 IST bucket contained `10` credible PAPER closes while the BOT was `PAUSED`; the number is preserved evidence, not ongoing execution.
- The current Tiny-LIVE audit and timing-review UI no longer falls back to a historical COTI route when there are zero fully preflightable routes. It reports `NO QUALIFIED ROUTE`, states that all seven approved coins/eleven directions are being scanned, and visually lists COTI, BB, HEMI, TREE, NEXO, PYBOBO and GPS. The basket arm remains the immutable seven-coin/eleven-direction contract; COTI is not pinned.
- The bootstrap action-authority quota is now exact-route scoped. Attempts already consumed by one basket direction cannot incorrectly exhaust the first/two-attempt allowance for another approved direction. The independent global ten-attempt batch/day safety cap is unchanged.
- No profit, fee, TDS, depth, freshness, timing, inventory, capital or risk threshold changed. No evidence/history was reset or deleted. Local frontend lint/build, backend build and the full deterministic suite passed `206/206`; the focused authority regression and both frontend markers passed again against the AWS-built images.
- Production backend/frontend/gateway are healthy with restart count `0` and OOM false. Runtime remains `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`; BOT control is OFF/PAUSED, effective PAPER execution is false, account mode is PAPER, and active Tiny-LIVE arm, account lease and action authority are absent.
- Sanitized artifact: `.deploy/cat-pro-v189-paper-basket-truth-20260822.tgz`, SHA-256 `5E8775E595AF9327EDDB87C15B69B58BDBFE3907B4A85B5D053AD8863FC68251`. AWS rollback source: `/opt/cat-pro/backups/v189-paper-basket-truth-20260822/source-before-v189.tgz`; rollback images: `cat-pro-backend:pre-v189-paper-basket-truth` and `cat-pro-frontend:pre-v189-paper-basket-truth`. Deployed backend image: `sha256:9526b3818ce36974b704d3b6da966f005592c33209e6ee948b97829634c6c569`; frontend image: `sha256:fcb107022b3df33de01c8248afeafeaac91c0a6edcc5e67003d4f66b5efba7a8`.

### V184 COTI Binance feed-resilience pin deployed — 2026-08-21 20:35 IST

- The audited `COTIUSDT` Strategy #1 route is now a protected Binance public market-data subscription. Activity/catalog reranking cannot silently evict COTI from the bounded 200-market websocket universe; production startup confirmed `protected=1`. This is subscription membership only and grants no order, LIVE, transfer or withdrawal authority.
- Current decision code was not the reported bottleneck: the pre-deploy global scheduler snapshot was about `5 ms` P99 from candidate decision to execution start. The negative UI headroom came from the persistent route-specific rolling window plus intermittent book gaps. That evidence was not reset or rewritten. During warm-up the exact COTI controlled-batch headroom improved from the earlier approximately `-39 ms` to `+6 ms`, then genuine newer observations moved it to `READY`: decision-to-start P99 `42 ms`, worst execution-grade book-age P99 `187 ms`, maximum derived book age `198 ms`, and residual headroom `+11 ms` versus required `+10 ms`, with no timing blocker. Timing readiness alone grants no LIVE authority.
- No timing, freshness, skew, fee, profit or risk threshold changed. The absolute book-age ceiling remains `250 ms`, action-time public-read timeout remains `190 ms`, dispatch safety remains `10 ms`, and required operational headroom remains `+10 ms`.
- Local TypeScript build and the complete deterministic suite passed `205/205`; the isolated selection regression also passed inside the AWS-built image. Production backend/frontend/gateway are healthy with restart count `0`; frontend was not rebuilt. Runtime remains `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`, account mode `PAPER`, active Tiny-LIVE arm `null`, active lease `null`, LIVE/order submission disabled.
- Sanitized four-file artifact: `.deploy/cat-pro-v184-coti-feed-pin-20260821.tgz`, SHA-256 `6707EEE5BF5B798117223D013A3FFAFC535FBB6454F44604AD3FE644F0D5270A`. AWS rollback source: `/opt/cat-pro/backups/v184-coti-feed-pin-20260821/source-before-v184.tgz`; rollback image: `cat-pro-backend:pre-v184-coti-feed-pin` (`sha256:8c72401e83c8f55adcf7fc306955135e037e58930adb57ee42888d2fc9233cf9`). Deployed backend image: `sha256:b0095ac7363c68ff81cfccbf369cc05267b96f16b263ada10eb4a30153331160`.

### V183 seven-coin controlled Tiny-LIVE pilot basket deployed — 2026-08-21 19:01 IST

- The former single-COTI controlled-batch surface is now the immutable `strategy-one-seven-coin-inventory-v1` pilot basket. It covers seven markets and exactly eleven report-backed directions: COTI CoinDCX->Binance; BB CoinDCX->Binance, Binance->CoinDCX and Bybit->CoinDCX; HEMI CoinDCX->Binance and Binance->CoinDCX; TREE Bybit->CoinDCX; NEXO Binance->CoinDCX and Bybit->CoinDCX; PYBOBO CoinDCX->Bybit; GPS CoinDCX->Bybit. No generic any-coin or reversed route is implicitly allowed.
- The displayed sell-inventory plan exactly matches the operator request: Binance COTI INR 1,000, BB INR 500 and HEMI INR 500; CoinDCX BB/TREE/HEMI/NEXO INR 500 each; Bybit PYBOBO/GPS INR 500 each; CoinSwitch, UnoCoin and ZebPay receive INR 0 for this pilot. Total target inventory is INR 5,000. This build records/displays the plan; it did not move funds or buy inventory.
- The controlled batch remains INR 500 per leg, maximum ten attempts over 180 minutes, with an unconditional stop on the first non-clean, partial, unknown or exposed result. Each attempt independently earns current route timing approval, fresh books, inventory/balance, exact rules, minimum order, fee, depth, stress-net and last-look acceptance. One route's approval cannot authorize another route. There is no automatic retry, transfer or withdrawal.
- CoinDCX basket legs use the existing bounded GTC-with-cancel contract; Binance and Bybit legs remain FOK. Protected REST book refresh was generalized only to approved CoinDCX/Binance basket directions. CoinDCX/Bybit directions still require naturally fresh exchange books and fail closed when stale.
- The durable activation phrase is `ARM PILOT-BASKET SEVEN-COIN INR500 ATTEMPTS10 MINUTES180`. A basket account lease is not pre-bound to one route; exact route calibration and action authority are derived per attempt. The BOT dashboard V183 panel shows the basket, inventory, route-specific candidate/timing evidence and actual execution result lineage.
- Deployment did not activate the pilot. Production truth is `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`, every LIVE/order confirmation is empty, durable account mode is `PAPER`, runtime LIVE gate is false, active arm and active account lease are both `null`, and basket order/transfer/withdrawal authority flags are false.
- Verification passed backend/frontend production builds, frontend ESLint, focused basket/lease/contract/execution/book-refresh regressions and the complete deterministic suite `205/205`. Real exchange APIs and confirmation-sensitive order tests were not included. Backend/frontend/gateway are healthy with restart count `0`, OOM false and recent critical-log scan empty. Public `/bot` returns the expected HTTP `401` without Basic Auth, confirming the protected HTTPS edge is reachable.
- Sanitized artifact: `.deploy/cat-pro-v183-seven-coin-pilot-basket-20260821.tgz`, SHA-256 `0F99158738CB1695EFC14C80C65BE8C872F644DF2429B93E2058262215B35619`. AWS rollback source: `/opt/cat-pro/backups/v183-seven-coin-pilot-basket-20260821/source-before-v183.tgz`; rollback images: `cat-pro-backend:pre-v183-seven-coin-basket` and `cat-pro-frontend:pre-v183-seven-coin-basket`. Deployed images: backend `sha256:8c72401e83c8f55adcf7fc306955135e037e58930adb57ee42888d2fc9233cf9`; frontend `sha256:997eb4d3512cc25095d5c4a16dffc0187374dbb3b6ca23e87cf69db2a4811ac0`.

### V181 unified ZebPay PAPER fleet presentation deployed — 2026-08-21 16:39 IST

- The header exchange menu no longer renders ZebPay under the legacy `OBSERVATION ONLY · EXCLUDED FROM EXECUTION READINESS` section. All six exchanges now appear in one `Six-exchange PAPER fleet`; ZebPay keeps its evidence-derived `PAPER eligible/PAPER blocked`, market-data and authenticated-read status in the normal fleet list.
- The menu footer now truthfully counts fresh authenticated reads across all six displayed exchanges rather than showing the core-five denominator. This is a presentation/readiness correction only: the backend PAPER qualification gates are unchanged, ZebPay is not silently promoted to LIVE dispatch, and no trading policy, threshold, balance, credential, API permission, order, transfer, withdrawal, evidence or history changed.
- Frontend ESLint and production build passed locally and again inside the AWS image. Only `cat-pro-frontend` was rebuilt/recreated; backend, gateway and edge were not replaced. The deployed bundle contains `Six-exchange PAPER fleet`, `/bot` returns HTTP `200`, frontend/backend/gateway are healthy, all restart counts are `0`, and OOM flags are false.
- Runtime verification remained `PAPER_ONLY` with the Personal BOT enabled for effective PAPER execution; `liveExecutionAllowed=false` and `orderSubmissionAllowed=false`. Rollback source is `/opt/cat-pro/backups/v181-zebpay-six-exchange-paper-ui-20260821/ExchangeFleetMenu.tsx.before`; rollback image is `cat-pro-frontend:pre-v181-zebpay-six-exchange-paper-ui`; deployed frontend image is `sha256:958dbb40d53a0b530fd64f8274af0e01990eda87e7e0bc26fe2615afeae71ea2`.

### V180-V180.3 Strategy #3 ACLA SHADOW vertical slice deployed — 2026-08-21 15:45 IST

- Existing Strategy `#3 triangular-arbitrage` now owns the `ADAPTIVE_CLOSED_LOOP_ARBITRAGE` (`ACLA`) implementation. It remains one of exactly eight registered CAT PRO strategies; no ninth strategy, second bot, duplicate market cache, risk engine, order gateway or accounting system was created.
- The controller builds same-exchange three-leg closed spot cycles from the shared dynamic-discovery topology, indexes market-to-route dependencies, recalculates only affected routes, applies a `0.40%` gross fast screen before depth reads, then performs direction-correct full-depth VWAP, per-leg output propagation/quantization, explicit fees, slippage/adverse/safety reserves, dust, TDS working-capital lock, `0.25%` minimum net, `₹15` absolute net, book age/skew and stressed-positive qualification.
- A restart-safe strategy-scoped ACLA capital loop now owns the requested `₹10,000` conceptual SHADOW subledger: `₹8,500` active, `₹1,000` protected recovery reserve and `₹500` fee/TDS/dust reserve. It supports atomic/idempotent one-cycle reservation, exact sequential three-leg lineage, pre-trade abort, exposure and bounded direct/two-leg recovery states, reconciliation, dust by asset, persistent TDS lock with explicit verified-credit release, FIXED/COMPOUND/HYBRID compounding, profit sweep accounting and capital invariants.
- V180.3 closed the safety/accounting gaps found during final audit: fresh full-depth requalification now runs before reservation and immediately before Leg 1; TDS is no longer released merely because a cycle settles; recovery reserve usage is explicit; limits are `₹30` maximum cycle loss, `₹150` daily loss, `3` consecutive failed cycles, `₹7,500` capital protection, `₹30` maximum recovery loss, `3` recovery attempts and `2,000 ms` maximum unconverted duration. Any breach trips new-cycle admission while recovery remains separately owned.
- ACLA is deliberately `SHADOW` only. PAPER support is implemented but remains OFF pending genuine SHADOW acceptance; ACLA LIVE and exchange order submission are hard false. The shared Personal Strategy #1 BOT remains independently `PAPER_ONLY`, enabled with effective PAPER execution true. Durable account mode is `PAPER`; active Tiny-LIVE pre-arm and active account-mode lease are both absent.
- The existing Strategy dashboard exposes ACLA route economics, exact legs, blockers, capital buckets, recovery/TDS/dust state, circuit breaker, daily/consecutive loss status, lifecycle outcomes and performance counters. Production point-in-time evidence after V180.3 showed `172` indexed genuine paths, `14` raw gross-positive paths, `0` net-positive/qualified paths and no admitted cycle. This is truthful waiting-market evidence, not a fabricated win or a broken controller.
- The event fast lane rejected `603,878` affected route candidates before expensive depth simulation while only `4` reached exact event-lane evaluation in the captured post-restart window. Latest ACLA evaluation was about `1.50 ms`. Strategy #1 hot-path remains `PASS`: market-update-to-decision P95/P99 `9/13 ms`, decision-to-queue P95/P99 `2/5 ms`, completion P99 `6 ms`, pending snapshots `0` and dropped candidate snapshots `0`. Docker sampled the backend at roughly `1.02-1.34` CPU cores of the available `4`; this is load utilization, not decision latency or profit evidence.
- Verification passed backend and frontend production builds, frontend ESLint, architecture boundaries and complete deterministic suite `203/203`. Deterministic ACLA fixtures prove a positive closed cycle, unprofitable fast rejection, stale-book rejection, multi-level VWAP, atomic duplicate prevention, restart restore, HYBRID compounding/sweep, persistent TDS lock/release, exposed recovery and consecutive-failure circuit breaking. These fixtures are not genuine market performance evidence. Real exchange APIs and confirmation-sensitive order tests were not included.
- Production backend/frontend/gateway are healthy, edge is running, all restart counts are `0`, internal `/strategies` returns HTTP `200`, and recent logs contain no fatal/unhandled/ACLA persistence error. Deployed images: backend `sha256:7c9bae7054db239597cb3d1c0f57565e2a0d98c166917499c386a85cc6748eb8`; frontend `sha256:4a09c5a6b82835027c458a1bea8b74a798a8978b3ade8b55c3aaa6bae531a1df`.
- Final artifact: `.deploy/cat-pro-v1803-acla-safety-accounting-20260821.tgz`, SHA-256 `D6DAC66F7B4707D15991D56D90D135364FDA98E465A35C0B53EC28FCA8814F3B`. AWS rollback sources are under `/opt/cat-pro/backups/v1803-acla-safety-accounting-20260821`; rollback image tags are `cat-pro-backend:pre-v1803-acla-safety-accounting` and `cat-pro-frontend:pre-v1803-acla-safety-accounting`.

### V179-V179.1 ZebPay Exchange Health and PAPER-extension eligibility deployed — 2026-08-21 14:10 IST

- Root cause was presentation plus a fee-evidence warm-up race, not missing ZebPay public markets. The backend already held roughly `85` ZebPay market rows and several current executable books, while Exchange Health rendered only the authoritative core-five cards and hardcoded ZebPay as execution-blocked. The signed balance card's `Fetched 403` means `403` returned asset rows; it is not an HTTP `403` error and is unrelated to market coverage.
- Exchange Health now renders ZebPay as a sixth, explicitly labelled `PAPER EXTENSION` card with current market, executable-book, capability, rule and fee-evidence counts. The header fleet menu now reports `PAPER eligible` or the exact PAPER blocker instead of hardcoding `Execution blocked`. The core-five LIVE/readiness denominator remains unchanged.
- `ExchangeFleetRegistry` now derives ZebPay PAPER eligibility from current executable books, enabled Spot capabilities, complete limit-order rules and current side-aware fee evidence. `FiveExchangePaperShadowReadinessService` exposes the result in a separate optional PAPER-extension contract, so ZebPay cannot silently become a sixth LIVE adapter or alter the established five-exchange safety gate.
- V179.1 fixed a genuine startup race in authenticated fee discovery: if executable ZebPay books appear after the initial fee refresh, newly executable markets now trigger an immediate fee refresh even while the older fee snapshot is still inside its TTL. No fee value, threshold or economics rule was relaxed or fabricated.
- Captured production truth after warm-up: ZebPay market data connected, authenticated read fresh/verified, `85` public market rows, `4` point-in-time executable/PAPER-eligible markets and `7` authenticated fee-evidence markets. These are live observation counts and can fluctuate. The sampled eligible set was `SHIB-INR`, `SOL-INR`, `TRX-INR`, `WIF-INR`.
- Safety remains fail-closed: ZebPay LIVE order adapter is still not registered, `liveExecutionEnabled=false`, global LIVE submission is false, account mode is `PAPER`, and active LIVE sessions/locks are `0`. This build changed no balance, credential, permission, fund, order, transfer, withdrawal, policy threshold, evidence or history.
- Verification passed backend/frontend production builds, frontend ESLint, focused fleet/PAPER-extension and ZebPay fee warm-up regressions, architecture checks and the complete deterministic suite `200/200`. Backend/frontend/gateway are healthy with restart counts `0`; edge is running.
- V179 artifact: `.deploy/cat-pro-v179-zebpay-paper-health-20260821.tgz`, SHA-256 `6A5013330C39EA16BDC014119FB257A164EBF333DE2DD1D587DFE55600C61665`. V179.1 artifact: `.deploy/cat-pro-v1791-zebpay-fee-warmup-20260821.tgz`, SHA-256 `2284A1F706ADA22B7D242999505A07641FBE0BC63FB4D724ED9D3B19B7124CEC`. AWS rollback sources: `/opt/cat-pro/backups/v179-zebpay-paper-health-20260821/source-before.tgz` and `/opt/cat-pro/backups/v1791-zebpay-fee-warmup-20260821/source-before.tgz`; rollback image tags `cat-pro-backend:pre-v179-zebpay-paper-health`, `cat-pro-frontend:pre-v179-zebpay-paper-health`, and `cat-pro-backend:pre-v1791-zebpay-fee-warmup`. Deployed backend image `sha256:dd339f9d76d9d294537f664a6608cf1e89071f430cf9d975346d474b576348c0`; frontend image `sha256:ac25b6723b4ef1568e308dff8a1cc1f54e1e5c0443327faffcbf0be3ab7e7912`.

### V178-V178.3 lightning read-path and strategy-runtime optimization deployed — 2026-08-21 13:04 IST

- A full production-source scan found no duplicate strategy tree, second backend entrypoint or confirmed dead production module. Runtime JSONL evidence, rollback archives, dependencies and generated deployment material are intentional; none was deleted merely to make the repository look smaller. The architecture boundary remains exactly eight registered strategies, one backend entrypoint and canonical ports `5000/5173`.
- Strategy #4's repeated Spot/Perpetual evaluation now reuses order books, derivative depth, capability and explicit fee evidence within each immutable evaluation pass. VWAP accepts readonly depth directly, removing defensive spread copies from Strategies #4, #5, #6 and #8 without changing economics, thresholds, fees, funding, slippage, safety buffers or qualification outcomes.
- Strategy attribution/performance reads now use independent revision-aware caches for archived SHADOW, runtime SHADOW and PAPER evidence. Frequent runtime samples no longer force a clone of the unchanged `13k+` PAPER ledger. Analytics receives lightweight immutable outcome projections without nested per-tick sample arrays; revisions still invalidate immediately when the aggregate evidence consumed by the report changes.
- The Strategy page keeps its initial render light by lazy-loading nine heavy strategy panels. The Strategy route chunk fell from `232.86 kB` to `95.02 kB` raw (about `59%` smaller). Its summary now distinguishes `Market Snapshots Processed` from `Qualified Signals Emitted`, so a truthful zero qualified signal is not confused with an inactive observer.
- Production Strategy #4 full-detail response improved from repeated `1.14-1.55 s` samples to `71.9-90.7 ms` across ten immediate HTTP-200 samples, roughly `14-20x` faster. This is API/read-path latency, not exchange round-trip latency, execution speed or profit proof.
- Final verification passed architecture/runtime-policy checks, backend build, frontend ESLint/build, evidence-retention and attribution regressions, and the complete deterministic suite `200/200`. Real exchange APIs and confirmation-sensitive order tests were not included. Backend/frontend/gateway are healthy, edge is running, and every restart count is `0`.
- Durable safety truth remained unchanged: Personal BOT is paused (`enabled=false`, `PAPER_ONLY`), effective PAPER execution is false, LIVE/order submission is false, account mode is `PAPER`, active Tiny-LIVE arm/lease/action authority are absent, trigger-in-progress is false, and restart recovery is `CLEAN` with zero findings/exposure. No policy, threshold, fee/TDS rule, balance, credential, API permission, fund, order, transfer, withdrawal, evidence or history was changed.
- Final sanitized artifact: `.deploy/cat-pro-v1783-lightweight-strategy-analytics-20260821.tgz`, SHA-256 `1418F7B218AC9F5C4649F9308006E4640770B9BCA3DBA090FABB0AC39FE050F4`. Earlier V178 aggregate artifact remains `.deploy/cat-pro-v178-lightning-strategy-runtime-20260821.tgz`, SHA-256 `F931FC03F0DA2C0B589D40793A9F7D33AAD6847E6C24F3AC2A7B89FA04EF6A27`. AWS source rollback: `/opt/cat-pro/backups/v1783-lightweight-analytics-20260821/source-before.tgz`; rollback image: `cat-pro-backend:pre-v1783-lightweight-analytics`. Deployed images: backend `sha256:b18e78983a465686386fc686ad5097368e3f68c8d12f664e19bb16322fecd949`, frontend `sha256:642915d2f71cd1b963a324c37e16cb74f237470fd7e9ca57b3143051c8955be0`.

### V177 COTI protected-feed timing headroom deployed — 2026-08-21 11:28 IST

- The apparently inactive `Generate fresh timing review` control was confirmed to be reaching the backend; production returned HTTP `409` because genuine route timing did not leave the required operating margin inside the unchanged absolute `250 ms` book-age ceiling. Before this build the retained COTI route had decision-to-execution-start P99 `74 ms`, dispatch-reserved worst-book P99 `188 ms`, and residual operating headroom `-22 ms` versus the required `+10 ms`. The failure was safety enforcement, not a dead button.
- `COTIUSDT` is now a default protected CoinDCX public WebSocket market. Its book no longer depends on a temporary demand subscription being opened only after an opportunity is discovered. This is public-data prioritization only; it adds no credentials, account access, order, transfer, withdrawal, threshold relaxation or LIVE authority. Production logs confirm continuous `COTIUSDT` 20-bid/20-ask cache updates and a protected base universe of at least two markets.
- The existing timing-calibration GET response now includes the exact read-only COTI controlled-batch headroom review. `BOT -> DEEP AUDIT -> ACTION-TIME TIMING REVIEW` displays decision-to-start P99, worst fresh-book P99, residual and required headroom before the operator clicks. While evidence is blocked, the button says `Waiting for timing headroom`; any backend failure is rendered inline instead of only at the bottom of the large panel.
- The safety contract is unchanged: `250 ms` absolute ceiling, `10 ms` dispatch margin, `10 ms` required operating headroom, current economics/fees/stress checks and explicit approval remain mandatory. Historical evidence was neither reset nor filtered. The first post-restart truth improved slightly to worst-book P99 `185 ms` and residual headroom `-19 ms`, but remains correctly `BLOCKED`; it must turn `READY` naturally from genuine fresh evidence before a proposal can be created.
- Post-deploy engine latency remains healthy: rolling 512 candidate samples show snapshot-to-pipeline-start P50/P95/P99 `1/3/6 ms`, decision-to-queue `1/4/6 ms`, candidate decision-to-execution-start `1/4/6 ms`, completion P99 `7 ms`, pending snapshots `0`, high-water `1`, dropped candidate snapshots `0`, last error `null`.
- Verification passed: backend/frontend production builds, frontend ESLint, focused COTI-selection/timing regressions and the complete deterministic suite `200/200`. Backend and frontend are healthy with restart counts `0`; gateway is healthy and edge remains running. Durable account mode is `PAPER`, active Tiny-LIVE pre-arm `null`, active account-mode lease `null` and trigger-in-progress false. The persisted PAPER bot is currently paused, so the automation report is `SHADOW`, `paperExecutionAllowed=false`, `liveExecutionAllowed=false`; V177 changed no mode/control state, policy, balance, credential, exchange permission, evidence or history and submitted no order.
- Sanitized artifact: `.deploy/cat-pro-v177-coti-timing-headroom-20260821.tgz`, SHA-256 `D7F1ADB847AB877DBA0A2EEF9128BBBCDE8C448CA54E33FFE7C40D03EA6905BE`. AWS rollback source: `/opt/cat-pro/backups/v177-coti-timing-20260821/source-before.tgz`, SHA-256 `f3391e5693c2d00b3702273c19a615501938cb742dc046c3882d171a3adf70fe`. Deployed images: backend `sha256:345020c58e81019b857647c0a9c4855029e89bb6aeb0e7f4ef776d000ad1e8b3`, frontend `sha256:727f0bc121e3b4b3a7ff3d5485e7708a094a46dd1fbec694e146139140af5374`.

### V167-V176 complete Spot-Perpetual venue expansion deployed — 2026-08-21 08:44 IST

- Strategy #4 remains the existing `spot-perpetual-basis-arbitrage` controller; no second bot, scheduler, ledger or order authority was created. The operator-provided Hummingbot concepts are retained as cash-and-carry only: BUY Spot and SELL linear Perpetual, matched quantity, full-depth VWAP, independently configured Spot/Perpetual venues, one-times leverage, close at absolute basis `<=0.10%`, and a `120-second` route re-open delay. Reverse-basis Spot shorting remains unsupported and fail-closed.
- The immutable venue topology now covers six Spot venues (`coindcx`, `binance`, `bybit`, `unocoin`, `coinswitch`, `zebpay`) and five Perpetual venues (`binance`, `bybit`, `coindcx`, `coinswitch`, `zebpay`). This is `30` combinations per shared market: `5` same-venue/intra-exchange plus `25` cross-exchange. The bounded default market set is `BTCUSDT`, `ETHUSDT`, `SOLUSDT` and `COTIUSDT`, with a hard maximum of `20` configured markets.
- Qualification remains intentionally conservative. It requires exact common market identity, two-sided executable depth, market/order rules, opening and closing taker fees, `0.05%` adverse Spot slippage, `0.05%` adverse Perpetual slippage, a `0.10%` safety buffer, and adverse funding. Positive predicted funding is displayed but never credited to admission. Only candidates whose expected net remains at least `0.30%` after these costs may qualify; this is a predicted PAPER admission rule, not a guarantee that every realized trade will be positive.
- Added bounded public derivative evidence providers for CoinDCX, CoinSwitch and ZebPay and read-only authenticated derivative account evidence providers for CoinDCX, CoinSwitch and ZebPay. Missing, malformed, stale, permission-denied or unsupported evidence blocks the affected route; no fee, balance, margin, funding rate, timestamp or signal is inferred or fabricated.
- Production V176 truth is healthy but safely blocked for Strategy #4: controller running, topology `6 x 5`, `48` currently observable route rows, `16` economically evaluable, `0` gross-positive, `0` net-positive and `0` qualified at the captured instant. Binance USD-M credentials are absent; Bybit authenticated reads are healthy but about `10.97 USD` is below the unchanged `1000 USDT` evidence target; CoinDCX, CoinSwitch and ZebPay derivative private evidence is unavailable. Therefore `paperEvidenceReadyVenues=0` and the state is `DERIVATIVE_EVIDENCE_BLOCKED` rather than a fabricated success.
- Strategy #4 safety remains explicit: read-only aggregation true, authenticated reads only, balance/margin inference false, fees/rules required, threshold unchanged, fabricated signals false, PAPER execution not triggered by reads, LIVE execution false and order submission false. The host's existing Tiny-LIVE-capable environment was preserved, but durable current truth has account mode `PAPER`, active Strategy #1 pre-arm `null`, active account-mode lease `null`, trigger in progress false and no blocking/action authority. No order, balance, fund, exchange permission, transfer, withdrawal, threshold, evidence or history was changed by V167-V176.
- Verification passed: backend/frontend production builds, frontend ESLint, architecture boundaries, focused venue-expansion regression and a hermetic network-disabled complete deterministic suite `200/200`. Real exchange APIs and confirmation-sensitive order tests were not included. Post-deploy backend/frontend/gateway are healthy, edge is running, restart counts are `0`, OOM flags are false; recent Strategy #1 scan duration is generally sub-`2 ms` with bounded observed bursts below `9 ms`.
- Sanitized artifact: `.deploy/cat-pro-v167-v176-spot-perpetual-expansion-20260821.tgz`, SHA-256 `C10496815C8775BAE651AC454774746730538D384C1431EF2ADF9D47EC51C228`. AWS rollback source: `/opt/cat-pro/backups/v176-spot-perpetual-expansion-20260821/source-installed-v176.tgz`; rollback images: `cat-pro-backend:pre-v176-spot-perpetual-expansion` and `cat-pro-frontend:pre-v176-spot-perpetual-expansion`. Deployed images are backend `sha256:137e4aff8292df5eaae6c39577d7a644d701b8ece0160580037bd80c8a04af36` and frontend `sha256:6be7e8ce765a952e9bfa951abc7df75df898bcc387e572013a0ee87884eec06b`.

### V166 Binance USD-M credential boundary deployed — 2026-08-21 06:48 IST

- Root cause of Strategy #4's Binance USD-M `401/-2015` was isolated: every signed Futures balance, position, order and fill-fee path silently reused the Binance Spot credential provider. Production Spot authenticated reads were healthy from the same AWS host, so this was product permission/credential scope rather than general network or IP connectivity.
- Added a dedicated fail-closed `BINANCE_USDM_API_KEY` / `BINANCE_USDM_API_SECRET` provider and routed all Binance USD-M authenticated account-read, derivative-order readiness/API and perpetual fill-fee evidence through it. Spot reads, Spot orders and Spot fills remain on `BINANCE_API_KEY` / `BINANCE_API_SECRET`; there is deliberately no implicit Spot-key fallback.
- Missing or partially configured USD-M credentials now stop before signed exchange I/O with an exact non-secret configuration blocker. The production Strategy #4 report truthfully changed from an exchange `401` to `BINANCE_USDM_API_KEY environment variable is missing.` Binance therefore remains `NO_DATA`; Bybit read evidence remains healthy but approximately `10.98 USD` does not cover the unchanged `1000 USDT` target.
- No Futures permission, exchange API key, central PAPER allowlist, Strategy #4 operator confirmation, threshold, fee, funding, capital target, LIVE authority or order state was changed. Strategy #4 remains SHADOW/read-only with `12` evaluated routes, `0` qualified routes and `liveExecutionAllowed=false` / `orderSubmissionAllowed=false`.
- Local backend build and complete deterministic suite passed `199/199`. Real exchange APIs and confirmation-sensitive order tests were not included. Sanitized artifact: `.deploy/cat-pro-v166-binance-usdm-credential-boundary-20260821.tgz`, SHA-256 `B255A56E58D56E4610F8D864012E9925CBB4DDC37E96D80898DE928AA9295311`.
- AWS rollback source is `/opt/cat-pro/backups/v166-binance-usdm-credential-boundary-20260821/source-before-v166.tgz`; rollback image is `cat-pro-backend:pre-v166-binance-usdm`. Deployed backend image is `sha256:3cddee8b39f1721de13269060f71171903bbc27c942bb2bfe9169de08e088c25`; backend is healthy with restart count `0`, and frontend/gateway/edge were not recreated.
- The host remains Tiny-LIVE-capable at the environment layer, but durable truth is safe: account mode `PAPER`, PAPER bot ON/effective, active Tiny-LIVE arm `null`, active account-mode lease `null`, and Personal BOT reports `liveExecutionAllowed=false` / `orderSubmissionAllowed=false`. Existing history, balances and evidence were preserved.

### V165.2 Strategy evidence read-path latency fix deployed — 2026-08-21 06:00 IST

- The `/strategies` screenshots showing `Loading strategy evidence`, `Strategy evidence unavailable` and eventually `OFFLINE / Execution Unhealthy` were a read-path timeout, not a dead market-data or execution engine. The heavyweight `/api/strategies/eight-strategy-paper-readiness` request took approximately `19.18 seconds`; the frontend cancels requests after about `10 seconds`, producing browser HTTP `499` cancellations and occasional queued gateway `504` responses.
- Root cause was the readiness aggregator calling the full per-strategy detail model for all eight strategies. Each detail call performed attribution/performance work over more than `14,000` PAPER settlements and obtained repeated defensive deep clones of that history, monopolizing the Node.js event loop and queuing unrelated requests.
- Fleet readiness now uses a controller-owned blocker-only diagnostic method that intentionally skips attribution, performance, lifecycle, intent and full detail history. Internal attribution analytics now reads the existing immutable `PaperTradeStore.getAllForReadOnlyAggregation()` snapshot instead of cloning the entire ledger. The Strategy page no longer mounts an unused duplicate eight-strategy readiness poll; the actual readiness panel still owns its authoritative query when displayed.
- Production improvement: `/api/strategies/eight-strategy-paper-readiness` fell from about `19.18 seconds` to `136.56 ms` inside the backend and `126.53 ms` through the gateway. `/api/strategies` returned in `93.07 ms`; the Strategy #4 full detail remained bounded at about `1.97 seconds`, below the frontend timeout. The five minutes after deployment contained `0` gateway `499/504` responses and `0` fatal/unhandled/OOM backend errors.
- Verification passed: backend TypeScript build, frontend TypeScript/Vite production build, frontend ESLint, focused lightweight-diagnostics isolation regression and complete deterministic suite `198/198`. Sanitized artifact: `.deploy/cat-pro-v1652-strategy-evidence-latency-20260821.tgz`, SHA-256 `793CD276A95B133DC54651F4D615019B6072DF8C75C9C6185177FF7FB96053A5`. AWS source rollback: `/opt/cat-pro/backups/pre-v1652-strategy-evidence-latency-20260821.tgz`, SHA-256 `3B2FE9D57CFC147B0579114D13D8995B9D8FA8B6CEB7092072F46143B8CD57A4`; rollback image tags are `cat-pro-backend:pre-v1652-strategy-evidence-latency` and `cat-pro-frontend:pre-v1652-strategy-evidence-latency`.
- Deployed images are backend `sha256:8a05be8e77fe240e2632f0a1e8f684a9d528257ec0dc4c07e9ece213f9ac30b4` and frontend `sha256:428744c9c157e55ebdd8d7f8e25babe03d4d9d21b9b3e949219303a00c057b2e`. Backend/frontend/gateway are healthy, edge is running and all restart counts are `0`.
- Trading truth was preserved: BOT state `OBSERVING_OPPORTUNITY`, durable account mode `PAPER`, PAPER bot ON from `DASHBOARD`, effective PAPER execution enabled, LIVE execution allowed false, order submission allowed false, and active Tiny-LIVE arm/lease/action authority all null. This release changed no policy, threshold, fee/TDS rule, capital, balance, credential, API permission, order, transfer, withdrawal, evidence or history.

### V165.1 BOT control-plane payload recovery deployed — 2026-08-21 05:20 IST

- The screenshot-level `BOT control plane unavailable` incident was not a dead backend. After the V165 recreation, the first `/api/strategies/personal-bot` aggregation reached approximately `350 KB` and about `20 seconds`; browser requests were cancelled as HTTP `499` while the backend, gateway and market-data engine remained alive.
- Root cause was unbounded presentation data in the one BOT response: Capital Placement returned all `457` historical route aggregates although the UI renders only its top rows, and all credibility exclusions were serialized although their authoritative total already exists separately.
- The API now retains the complete immutable placement/exclusion evidence internally but sends only the top `25` ranked routes and latest `20` exclusion details. It adds a truthful `totalRoutes` count, so the dashboard still displays all `457` known routes rather than confusing the bounded presentation window with the historical total. No ledger/evidence row was deleted or rewritten.
- Production response size fell from approximately `350 KB` to `87 KB` (about `75%` smaller). Five immediate post-restart checks returned HTTP `200` in `0.20–0.45 seconds`; `/bot` also returned `200`. This is a dashboard/read-path optimization, not exchange-network or execution latency.
- Verification passed: backend/frontend production builds, frontend ESLint, focused Personal BOT regression, and complete deterministic suite `198/198`. Sanitized artifact: `.deploy/cat-pro-v1651-bot-control-plane-payload-20260821.tgz`, SHA-256 `B3F805ACC5C9C75E9A5360658547115E699795741FBA462742A2BF17417D0659`. AWS source rollback: `/opt/cat-pro/backups/v1651-bot-control-plane-20260821/source-before-v1651.tgz`, SHA-256 `dc2f2ebe8fd1147db7634c6b4411083d8f6776e783e88e73d572de656a35952f`; the V165 image rollback tags remain available.
- Deployed images are backend `sha256:2024e61b400af412d1b367e7c0f06ba47cd4a4134be8bfb28902a11538131f1c` and frontend `sha256:7db2399b58b313a65ec58184067b957e73beadd7a85aecb3c5afbfc5646c760c`. Backend/frontend/gateway are healthy, edge is running, restart counts are `0` and OOM flags are false.
- Safety and behavior were unchanged: Personal BOT remains `PAPER_ONLY`, effective Strategy #1 PAPER execution is enabled, LIVE/order submission is false, and Strategy #4 remains V165 SHADOW-only with `12` evaluated combinations and `DERIVATIVE_EVIDENCE_BLOCKED`. No policy, threshold, balance, credential, API permission, order, transfer, withdrawal, evidence or history changed.

### V165 Spot-Perpetual Basis Arbitrage SHADOW integration deployed — 2026-08-21 04:55 IST

- The three operator-provided Hummingbot reference files were mapped into CAT PRO's existing multi-strategy architecture; no second bot, duplicate scheduler, duplicate ledger or independent execution authority was created. Strategy #4 remains `spot-perpetual-basis-arbitrage` and shares the central admission, capital reservation, PAPER lifecycle and safety boundaries.
- The implemented lane is cash-and-carry only: BUY Spot and SELL linear Perpetual, with independently configured Spot and Perpetual venues, exact common market/rule/fee evidence, full-depth VWAP, matched quantity and one-times leverage. Reverse basis requiring a Spot short is fail-closed.
- Qualification reserves opening and closing taker fees, `0.05%` adverse Spot slippage, `0.05%` adverse Perpetual slippage and the CAT PRO safety buffer. Positive predicted funding is displayed but never credited to entry qualification; adverse funding is deducted. Default minimum expected net is `0.30%`, close condition is absolute basis `<=0.10%`, route re-open delay is `120 seconds`, and an open route cannot be admitted twice.
- The Strategy page now exposes V165 Spot/Perpetual venue truth, gross basis, complete cost waterfall, funding-credit exclusion, close threshold, re-open delay, leverage and derivative readiness. All figures remain PAPER/SHADOW evidence, not a LIVE-profit claim.
- Local verification passed: backend production build, frontend production build, frontend ESLint, complete deterministic suite `198/198`, plus post-change focused foundation/observability/compiler regressions. Sanitized artifact: `.deploy/cat-pro-v165-spot-perpetual-basis-20260821.tgz`, SHA-256 `BCCEE01DF8CCCCCE82D5959A35B15DFA1DC575CCFAB61EBE11C2804AD3527308`.
- AWS rollback source: `/opt/cat-pro/backups/v165-spot-perpetual-basis-20260821/source-before-v165.tgz`, SHA-256 `0ed2b6b8dc222d1319d8041852e173105cc8f7bfad17e273c6bc64ec2134141e`; rollback images: `cat-pro-backend:pre-v165-spot-perpetual-basis` and `cat-pro-frontend:pre-v165-spot-perpetual-basis`.
- Deployed images are backend `sha256:2d3e94b9d2569d51658c4d8412221cf70e54f6255296ad63b48dadaf188706ea` and frontend `sha256:437188782e614849e750bf17f6f8494afd0fd2283f24e589ce1e4431eeb8e5b9`. Backend/frontend/gateway are healthy, edge is running, restart counts are `0`, OOM flags are false and the internal gateway serves `/bot` and the V165 report with HTTP `200`.
- Production is intentionally SHADOW-only for Strategy #4: `CAT_PRO_SHADOW_STRATEGIES=spot-perpetual-basis-arbitrage`, while the central PAPER allowlist is blank. The controller is running and currently evaluates `12` real route combinations. Its current state is `DERIVATIVE_EVIDENCE_BLOCKED`: Binance USD-M authenticated position read returns `401/-2015` (invalid key/IP/permission) and Bybit authenticated read is healthy but its approximately `10.98 USD` available account value does not cover the default `1000 USDT` evidence target. No signal or trade is fabricated to bypass either blocker.
- Execution authority remains unchanged and safe: durable account mode `PAPER`, PAPER bot ON, effective PAPER execution enabled for the existing Strategy #1 path, active Tiny-LIVE arm/lease absent, trigger-in-progress false, Personal BOT mode `PAPER_ONLY`, LIVE execution false and order submission false. V165 submitted no order and changed no balance, exchange permission, fund, Strategy #1 threshold, PAPER history or Tiny-LIVE authority.

### V161.1 ZebPay frontend authenticated-read truth fix deployed — 2026-08-21 02:11 IST

- Fixed a frontend-only truth mismatch in the exchange fleet dropdown. The V160 observation renderer hardcoded ZebPay's third status pill to `No private auth`, so it stayed wrong after V161 had established fresh signed authenticated-read evidence. The observation row now renders the authoritative backend authentication state (`Auth verified`, `Auth stale`, `Auth unverified` or `Auth not set`) while retaining the separate fail-closed `Execution blocked` status.
- This is not an execution-readiness promotion. Production still shows ZebPay under `Observation only · excluded from execution readiness`; exact quantity/depth rules remain absent and no LIVE order adapter exists. ZebPay cannot enter Strategy #1 PAPER or LIVE execution.
- Local frontend ESLint and production build passed. Only `cat-pro-frontend` was rebuilt/recreated on AWS; the backend was not rebuilt or restarted and remains image `sha256:352cc80f68851580d921a419085e5ddc3a96bf5795dbcfb50d07c7795b042d93`. Backend/frontend/gateway are healthy, edge is running, restart counts are `0` and OOM flags are false.
- Production fleet API remains version `19.28`: core market data/read verification is `5/5`; ZebPay market data is connected and authenticated read is configured, monitored, `VERIFIED` and fresh, with rules/provider false and LIVE adapter false. Served-bundle inspection found the stale label absent and the authentication label present. A live production DOM verification showed the ZebPay row as `Data connected` + `Execution blocked` + `Auth verified`.
- Runtime safety remained unchanged: BOT state `OBSERVING_OPPORTUNITY`, durable account mode `PAPER`, PAPER bot armed/allowed, effective PAPER execution enabled, Personal BOT mode `PAPER_ONLY`, LIVE execution false and exchange-order submission false. No policy, threshold, balance, credential, permission, evidence, history, order, transfer or withdrawal was changed.
- Sanitized frontend-only artifact: `.deploy/cat-pro-v1611-zebpay-ui-truth-20260821.tgz`, SHA-256 `D382331CAE0ED2B86C8846E62FA241A7DB8AFCE36CE6BC36024D543BB4E76631`. AWS rollback source: `/opt/cat-pro/backups/v1611-zebpay-ui-truth-20260821/source-before-v1611.tgz`, SHA-256 `8A19F56768FA0E49EA8E1D26406EC19493C21AAA73E098C72474957AB03C72F8`; rollback image: `cat-pro-frontend:pre-v1611-zebpay-ui-truth`. Deployed frontend image: `sha256:2d02b4006be6f4a60200006514b7316692307298a093c7a6433fb9b1dabb5f07`.

### V161 ZebPay least-privilege authenticated-read integration deployed — 2026-08-21 02:02 IST

- ZebPay KYC and bank verification are complete. With explicit operator confirmation, the previous CAT PRO-only broad key was deleted and replaced by `cat-pro-zebpay-spot`, IP-bound to AWS Elastic IP `15.252.113.245`, with only `Fetch Details` and `Spot Trading` enabled. Futures and withdrawal permissions are OFF. The one-time secret was never committed, logged or placed in a deployment archive; temporary local and upload copies were removed after checksum-verified installation.
- Production credentials live only in `/opt/cat-pro/backend/.env.zebpay`, mode `600`, owner `ubuntu:ubuntu`. Compose loads this optional secret file at runtime; backend `.dockerignore` excludes every `.env.*` secret from the image build context. No credential value appears in source, handoff, diagnostics or tests.
- Added the official timestamped-query HMAC-SHA256 authenticated GET contract with `X-AUTH-APIKEY`, `X-AUTH-SIGNATURE` and stable `CAT-PRO/1.0` user agent. The first anonymous-agent probe was rejected by the edge with HTTP `403`; the documented signed contract plus stable user agent returned HTTP `200`. Production now refreshes signed balance verification every 20 seconds and caches account fee evidence for five minutes.
- The wallet parser validated the real response envelope and 400 native-asset rows without converting or merging currencies. It is used only to prove authenticated read access; ZebPay balances are not yet inserted into the five-exchange TradingAccount/Capital Manager, so they cannot alter reservations, allocation or execution funding.
- Account-specific `BTC-INR` buy and sell fee reads were validated separately. At verification time the API reported account level `Regular`, maker/taker `0%`, GST `18%`, buy TDS `0%` and sell TDS `1%`. These values are time/account/pair-specific evidence, not a permanent fee assumption. TDS stays a separate side-aware field and is not mislabeled as a trading fee.
- Fleet report version `19.28` now shows ZebPay observation market data connected and signed authenticated read `VERIFIED/fresh`, while exact order rules remain absent and no LIVE adapter exists. ZebPay remains execution eligible `0` under blocker `QUANTITY_DEPTH_ORDER_RULE_AND_SIDE_AWARE_FEE_EVIDENCE_REQUIRED`; it cannot enter Strategy #1 PAPER or LIVE from ticker-only prices or reference-pair fees.
- Verification passed: local TypeScript build, focused signature/balance/fee/cache/fail-closed tests, fleet isolation tests and complete deterministic suite `197/197`. The AWS-built backend passed the new ZebPay regression with networking disabled before replacement. Production connected `83` public Spot observations; backend/frontend/gateway are healthy, edge is running, restart counts are `0`, and OOM flags are false.
- Sanitized artifact: `.deploy/cat-pro-v161-zebpay-auth-read-20260821.tgz`, SHA-256 `05050781BE906A6A01B67FD6C8DE0E58F4D54092A6EF1CAF0B5F9469889F3D71`. AWS rollback source: `/opt/cat-pro/backups/v161-zebpay-auth-read-20260821/source-before-v161.tgz`, SHA-256 `35EACC17D3F9EA19384743F7727321A111E564314EEAF2B66F76D0A46321D723`; rollback image: `cat-pro-backend:pre-v161-zebpay-auth-read`. Deployed backend image: `sha256:352cc80f68851580d921a419085e5ddc3a96bf5795dbcfb50d07c7795b042d93`.
- Post-deploy authority remains safe: durable account mode `PAPER`, PAPER bot ON from `DASHBOARD`, effective PAPER execution enabled, active Tiny-LIVE arm/lease/action authority absent, trigger-in-progress false, Strategy #1 recovery clean, LIVE execution false and order submission false. V161 performed signed GET-only reads and submitted no order, transfer or withdrawal; it changed no trading threshold, PAPER evidence, balance, fund or history.

### V160 ZebPay public observation lane deployed — 2026-08-21 00:56 IST

- ZebPay is integrated into the existing exchange manager as a separate public Spot observation lane. It is not a sixth execution venue, second bot, balance owner or readiness target. The authoritative CAT PRO execution fleet remains exactly CoinDCX, Binance, Bybit, UnoCoin and CoinSwitch (`5/5`).
- The adapter consumes ZebPay's public market catalogue on a bounded 60-second refresh. Only INR/USDT Spot markets with observable two-sided prices or Spot exchange volume are retained. ZebPay public `buy` is normalized as ask and public `sell` as bid; public catalogue rows expose no trusted executable quantities, so all ZebPay quotes remain quantity-free and cannot qualify for Strategy #1 PAPER or LIVE.
- Execution is explicitly fail-closed with `PRIVATE_FEE_RULE_AND_AUTH_EVIDENCE_REQUIRED`. No ZebPay fee was guessed or added to the shared fee registry; no market-rule provider, authenticated-read monitor, LIVE order adapter, balance integration, transfer or withdrawal path exists. The existing `0.30%` PAPER policy, five-exchange readiness, capital, fees/TDS, evidence and history were unchanged.
- Browser audit found the logged-in ZebPay account at `KYC Under Review / Access Restricted`; API Trading is unavailable until Master Account verification completes. No API key or secret was created, viewed, copied or stored. When access is available, any API-key creation, IP binding or permission save still requires a fresh action-time confirmation; planned minimum scope is read + Spot trade, withdrawal disabled, and the AWS Elastic IP only.
- Official ZebPay pricing currently lists regular Spot maker/taker fees of `0.45%` per ZebPay transaction plus GST and describes TDS separately. Therefore ZebPay must not become executable from a static fee assumption; the account-specific private trade-fee endpoint and exact market rules must be verified first.
- Local backend/frontend builds passed, focused fleet/ZebPay tests passed, and the complete deterministic suite passed `196/196`. The AWS-built backend passed both focused tests with networking disabled and the frontend image passed `nginx -t` before replacement.
- Sanitized artifact: `.deploy/cat-pro-v160-zebpay-observation-20260821.tgz`, SHA-256 `0896B765451EABF0CEDF4A7FA80923936654F9B197546C5B589A6929AA95FA84`. AWS rollback source: `/opt/cat-pro/backups/v160-zebpay-observation-20260821/source-before-v160.tgz`, SHA-256 `85A9DF7011D43E54087A25EE710FF012A27F52FE07020D45EA96632336F545E7`; rollback images: `cat-pro-backend:pre-v160-zebpay-observation` and `cat-pro-frontend:pre-v160-zebpay-observation`.
- Deployed images are backend `sha256:7272b1d06d6d62449ec0b015d661607780f381d6cf219121fd4f25bbb4613566` and frontend `sha256:4c6db9cc05ed4cc998f5cc9679da6142543ae3b3e6fbc95a314a097b3c1a552d`. Backend/frontend/gateway are healthy, edge is running, every restart count is `0`, and `/bot` returns successfully. Production connected the ZebPay observation lane with `80` public Spot markets; fleet diagnostics report observation connected `1`, execution eligible `0`.
- Post-deploy authority remains safe: durable account mode `PAPER`, PAPER bot ON from `DASHBOARD`, effective PAPER execution enabled, active Tiny-LIVE arm/lease/action authority all null and trigger-in-progress false. The compose environment remains Tiny-LIVE-capable from earlier explicitly authorized builds, but persisted route/account/control gates remain authoritative. V160 submitted no order and changed no exchange credentials, API permissions, balance, fund, transfer, withdrawal, policy threshold, evidence or history.

### V159 measured hot-path and frontend workload optimization deployed — 2026-08-20 23:54 IST

- The Strategy #1 scanner now reuses the cache's existing market-to-exchange executable index instead of flattening and regrouping the full quote book on every event. Bybit's scanner gate consumes a compact eligibility set and cached rolling-gap statistics instead of rebuilding and sorting the operator-facing quality report. Opportunity history is a fixed-capacity circular buffer and an internal diagnostics copy was removed; public read boundaries remain defensive.
- Trading behavior is unchanged: the same genuine executable quotes, Bybit quality gates, pair generator, fees, opportunity policy and execution admission still decide each result. No threshold, `0.30%` PAPER/qualification economics, Tiny-LIVE rule, route cooldown, capital, fee/TDS treatment, API permission, balance, order, transfer, withdrawal, mode, evidence or history was changed.
- The global frontend socket remains connected for status/recovery, but its high-volume 600+ row market map is hydrated and updated only while the Markets page is mounted. Ticker UI writes remain latest-only and batched. Off-page market object cloning is therefore eliminated without delaying backend ingestion or execution. Disabled notification categories no longer poll their corresponding opportunities, execution history or exchange-health feed.
- Sidebar hover/focus now preloads the existing lazy page chunk. No page, feature, dependency, second bot or execution path was added. Prefetch failure is isolated and normal click navigation remains authoritative.
- On the same local 800-executable-quote full-evaluation workload, scanner P50 remained effectively neutral while P95 improved from about `4.146 ms` to `3.851 ms` and P99 from about `5.481 ms` to `5.069 ms` (roughly `7%` lower tail latency). These are code microbenchmarks, not exchange/network latency or profit guarantees.
- Verification passed: backend/frontend production builds, frontend ESLint, architecture/runtime-policy checks, the focused executable-market-index regression and complete deterministic suite `195/195`. The AWS images also passed a network-disabled focused backend regression and isolated `nginx -t` before replacement.
- Sanitized artifact: `.deploy/cat-pro-v159-lightning-hot-path-20260820.tgz`, SHA-256 `6F0C09B4FA0EB9B38E6FD2FEEF45B4CB6035FAFF1AF5EE00FF1C0D0A144BFD41`. AWS rollback source: `/opt/cat-pro/backups/v159-lightning-hot-path-20260820/source-before-v159.tgz`; rollback images: `cat-pro-backend:pre-v159-hot-path` and `cat-pro-frontend:pre-v159-hot-path`. Deployed images are backend `sha256:5619db7add8c46dc3899473246f9b431160fae6af45e808c8754954368b3200d` and frontend `sha256:b8884812c44aee4d42cc30ae20eac29a1a3650e532f916734e1d6d002bd1d400`.
- Post-deploy backend/frontend/gateway are healthy and edge is running; every restart count is `0`. The opportunity API and `/bot` return HTTP `200`. Durable account mode is `PAPER`, PAPER bot is ON from `DASHBOARD`, effective PAPER execution is enabled, LIVE/order submission is denied by the Personal BOT control, active Tiny-LIVE arm/lease are null and trigger-in-progress is false. The compose environment remains Tiny-LIVE-capable from prior authorized builds, so persisted route/account/control gates—not environment labels alone—remain authoritative.
- Immediate production accounting remained balanced at `897 attempts = 897 settlements = 897 credible`, with `0` excluded and `0` unlinked. Hot path is `PASS`: update-to-decision P50/P95/P99 `2/9/24 ms`, scanner-evaluation P50/P95/P99 `0.867/7.432/7.993 ms`, decision-to-queue P95/P99 `4/5 ms`, completion P99 `5 ms`, pending `0` and dropped candidate snapshots `0`. This is an early post-restart snapshot, not a long-duration performance claim.

### V158 Personal Capital Manager Phase A/B integrated and deployed — 2026-08-20 23:00 IST

- The attached Personal Capital Manager specification was reconciled with the existing V101 advisory owner plus V121/V122/V124 inventory, allocation and rebalancing engines. No second bot, duplicate balance owner, transfer engine or decorative sidebar module was created. `BOT -> CAPITAL` remains the one operator surface.
- The Capital Manager response is now version `158.0` and includes one compact, timestamped Phase A/B projection: normalized five-exchange wallet capital in USDT, reservation-aware deployable capital, valuation coverage, missing/stale evidence, dynamic allocation policy, target-versus-actual exchange capital, imbalance states, analytical move proposals, real recovery/settlement/emergency-stop context and explicit phase locks.
- Static 20/20/20/20/20 allocation is no longer used by the Personal Capital Manager. Targets are normalized from credible Strategy #1 BUY/SELL settlement demand, confidence, win rate and realized profitability, with a bounded current-route boost when a fresh exact route exists. Per-exchange emergency reserve is preserved. Historical PAPER evidence can shape advice but cannot grant transfer, withdrawal, LIVE or order authority.
- The generic `/api/portfolio/rebalancing-status` route now consumes the same real fail-closed recovery, unsettled-settlement and emergency-stop context instead of an empty object. The boundary lives in `CapitalManagerSafetyContextService`, preserving the strategy-layer import isolation enforced by the architecture tests.
- Phase A unified truth and Phase B advisory rebalancing are active. Phase C manual-approved transfers and Phase D capped auto-rebalancing are explicitly `LOCKED_NOT_IMPLEMENTED`; Phase E safely-withdrawable profit remains locked without a reconciled LIVE ledger. Mode is `ADVISORY_ONLY`. Transfer, withdrawal, bank-withdrawal, balance-mutation and order permissions are all false.
- Production evidence is truthfully partial: known wallet value is approximately `50.37 USDT`, but authoritative total remains `NO_DATA` because Binance `WAL` and dust `LDUSDT` are unvalued and CoinDCX/UnoCoin contain stale valuations. Consequently allocation is `BLOCKED_EVIDENCE`, plan is `BLOCKED`, and no move is recommended. Missing values are never treated as zero.
- Current dynamic targets from 13,866 credible PAPER settlements are CoinDCX `48.039216%`, Binance `28.10124%`, UnoCoin `13.910564%`, Bybit `9.94898%`, CoinSwitch `0%`. These are advisory PAPER-derived weights, not LIVE-profit proof or transfer instructions.
- Verification passed: backend/frontend production builds, frontend ESLint, focused Capital Manager/rebalancing/architecture regressions and complete deterministic suite `195/195`. AWS backend/frontend images rebuilt; backend/frontend/gateway are healthy, edge is running, and every restart count is `0`. Served frontend bundle `BotDashboard-1euZEpum.js` contains the V158 policy renderer; backend API returns the new report.
- Sanitized artifact: `.deploy/cat-pro-v158-capital-manager-20260820.tgz`, SHA-256 `CF9A841340F9CDE6B4BD2B1E259E08DF993A60D886D623AB893F13B0C2063D02`. AWS source rollback: `/opt/cat-pro/backups/v158-capital-manager-20260820/source-before-v158.tgz`, SHA-256 `41C594FB51AC0AF4339F83E6E825C05298046DD9AE88330572FDDBAD034898C6`. Deployed images: backend `sha256:45fa6e9ce5102965a026118f2a3f9fd315e6ac7e882701f3181653bd2d956078`, frontend `sha256:8a3f38303a9a3c8803f7ac56ad46b5fd3429094efbcfe251e7e4df4d4ba5fbcb`.
- Post-deploy execution truth: durable account mode `PAPER`, PAPER bot ON from `DASHBOARD`, PAPER automation armed/allowed, effective PAPER execution enabled, emergency stop false, Strategy #1 recovery clean, settlement reconciliation not pending, manager mode `ADVISORY_ONLY`, manager transfer/order/withdrawal permissions false. The environment remains Tiny-LIVE-capable from prior authorized work, but the persisted Personal BOT control is `PAPER_ONLY`; V158 changed no mode, policy threshold, API permission, balance, funds, order, transfer, withdrawal, evidence or history.

### V157 dashboard Tiny-LIVE self-service flow deployed — 2026-08-20 22:07 IST

- Root cause of the apparently non-working checkbox / `Arm 2 attempts / 3 hours` button was an expired route timing approval, not a broken checkbox. Production timing diagnostics had `approvedAndCurrent=0` and `expired=4`; the API correctly returned HTTP 409, but the frontend hid the backend reason behind the generic Axios message `Request failed with status code 409`.
- `BOT -> DEEP AUDIT -> V125 / V150 PRE-ARMED TWO-SLOT` now contains the complete operator-driven flow. After switching PAPER OFF, the operator can generate a fresh genuine-evidence COTI timing review, inspect its maximum book age/sample evidence, type the exact generated approval phrase, approve it for the bounded three-hour two-attempt scope, tick the existing acknowledgment and arm the exact COTIUSDT CoinDCX BUY -> Binance SELL batch. The already-existing separate exact account-mode lease confirmation remains the final activation step.
- The dashboard now explains the exact prerequisite that keeps each control disabled. Backend 409 messages are surfaced verbatim, so stale timing, missing evidence, PAPER overlap or another fail-closed prerequisite is visible instead of appearing as a dead button.
- The UI does not combine approval, arm and lease into one click. A timing proposal/approval grants no order authority; PAPER/OFF mutual exclusion, exact phrase checks, durable route-bound arm, separate lease, `₹500/leg`, maximum two attempts, three-hour bounds, fresh action-time preflight and all existing order/permission/recovery gates remain unchanged. No FULL-LIVE master switch was added.
- Verification passed: frontend TypeScript/Vite production build, frontend ESLint, AWS Docker frontend build, isolated `nginx -t`, and read-only production browser QA. At 1280 px the new timing section was visible, PAPER ON correctly disabled both proposal and arm controls, the exact reason was displayed, document overflow was `1280/1280`, and browser warnings/errors were empty.
- Sanitized artifact: `.deploy/cat-pro-v157-tiny-live-self-service-20260820.tgz`, SHA-256 `C4B8BBE0F0773D2BFEEB359684B9CC21AD8E4A6B86F70CFE7F9BDF0BF7D9AF79`. AWS source rollback: `/opt/cat-pro/backups/v157-tiny-live-self-service-20260820/source-before-v157.tgz`, SHA-256 `26B9C576B3864AC08E8C8A120A782729C71BEB4BFBDE0B2C0F18969729D09DE4`. Image rollback tag: `cat-pro-frontend:pre-v157-tiny-live-self-service`.
- Frontend-only deployment produced image `sha256:d91bc70639d78c81401f4b4d49caf721b7690ad368e91ab81f4bf2b83f5b38f3`; backend, gateway and edge were not recreated. All four containers are running, backend/frontend/gateway are healthy, and restart counts are `0`.
- Post-deploy safety truth: durable account mode `PAPER`, PAPER bot ON from `DASHBOARD`, effective PAPER execution enabled, runtime `OBSERVING_OPPORTUNITY`, active Tiny-LIVE arm `NONE`, active account-mode lease `NONE`, trigger in progress `false`, current timing approval `NONE`. The deployment submitted no order and changed no balance, funds, exchange/API permission, fee/TDS model, policy threshold, evidence or history.

### V156 authoritative dashboard PAPER arm deployed — 2026-08-20 21:37 IST

- Root cause of `PAPER BOT ON` together with `RUNTIME BLOCKED` was confirmed from production evidence: the dashboard had persisted operator control `enabled=true`, but the authoritative PAPER controller still depended on `AUTOMATED_PAPER_TRADING_CONFIRMATION`. The Tiny-LIVE-capable compose profile intentionally leaves that variable blank, so `paperExecutionArmed=false` and `controllerPaperExecutionAllowed=false` even though the account, five venues, accounting, Shadow readiness and runtime soak were otherwise ready.
- The existing persisted dashboard control is now the authoritative PAPER arm only when all of these are simultaneously true: the operator explicitly changed it through the dashboard (`source=DASHBOARD`), control is ON, the trading account is enabled, durable account mode is exactly `PAPER`, and emergency stop is OFF. A fresh/default control now starts OFF and cannot arm execution. `TESTNET`, `LIVE`, disabled-account and emergency-stop states fail closed.
- PAPER/Tiny-LIVE mutual exclusion remains server-enforced. Enabling PAPER is rejected when any Tiny-LIVE arm or account-mode lease exists; creating a Tiny-LIVE arm or activating its lease remains rejected while PAPER control is ON. No FULL-LIVE master switch was added or enabled.
- Controller diagnostics now identify `PERSISTED_DASHBOARD_CONTROL` as the arming authority instead of presenting the obsolete environment confirmation as the active contract. Shadow performance/readiness, opportunity economics, fees/TDS, capital, route, thresholds, cooldown, order adapters and exchange permissions were not changed.
- Verification passed: backend TypeScript build, focused persisted-control, Tiny-LIVE account-lease and personal-bot regressions, isolated AWS-image tests with networking disabled, and complete deterministic suite `195/195`.
- Sanitized artifact: `.deploy/cat-pro-v156-paper-runtime-arm-20260820.tgz`, SHA-256 `4427FB91BA15D2D434904CCF2B51929852CE45B33A45CC12F2D794A76041DE2A`. AWS source rollback: `/opt/cat-pro/backups/v156-paper-runtime-arm-20260820/source-before-v156.tgz`, SHA-256 `6DA6F8DB8C9D10C0A684988FFA6985BBDF04DB17B0EC802F6E6B8B3195750FF5`. Image rollback tag: `cat-pro-backend:pre-v156-paper-runtime-arm`.
- Backend-only deployment produced image `sha256:3dcfa9988f5e930f932bef1ebefdfa3daacc196ccf2f53c4381415825575baf8`; frontend, gateway and edge were not recreated. Backend, frontend and gateway are healthy, edge is running, and all restart counts are `0`.
- Post-deploy read-only truth: account mode `PAPER`, active Tiny-LIVE arm `NONE`, active lease `NONE`, trigger in progress `false`, persisted PAPER control ON from `DASHBOARD`, `paperExecutionArmed=true`, `controllerPaperExecutionAllowed=true`, effective PAPER execution enabled, readiness `READY_FOR_PAPER`, runtime state `OBSERVING_OPPORTUNITY`, readiness blockers empty, LIVE execution allowed `false`, and order submission allowed `false`. The deployment created no real order, transfer, withdrawal, balance mutation, LIVE authority or evidence reset.

### V155 mutually exclusive PAPER / Tiny-LIVE page controls deployed — 2026-08-20 21:04 IST

- The existing `BOT -> DEEP AUDIT -> V125 PRE-ARMED ONE-SHOT` panel now owns the operator workflow; no extra bot, strategy, execution engine or ledger was created. It contains a separate `PAPER AUTOMATION` switch, the existing bounded COTI CoinDCX BUY -> Binance SELL arm/disarm control, a separately typed exact Tiny-LIVE account-lease activation/restore control, and the existing per-attempt success/failure detail cards.
- PAPER and Tiny-LIVE cannot run as overlapping execution pipelines. The page requires PAPER automation to be OFF before arming or activating a Tiny-LIVE lease. Backend routes independently enforce the same boundary: PAPER automation can start only when the durable account is `PAPER` with no active Tiny-LIVE arm, and Tiny-LIVE arm/lease creation is rejected while PAPER automation is enabled. Rejected requests do not mutate mode, evidence or authority.
- After a Tiny-LIVE arm is disarmed, completed, failed safely or expires, the account-mode lease restores the durable account to `PAPER`; simulated execution remains paused until the operator explicitly switches `PAPER AUTOMATION` back ON. This prevents silent PAPER/Tiny-LIVE overlap.
- Reporting remains intentionally separate. Credible PAPER settlements stay in `PaperTradeStore`, Paper Trading and Trade Intelligence. Tiny-LIVE attempts stay in the LIVE pre-arm/session/order/fill/settlement journals and appear in the same Deep Audit panel's execution-results section with attempt number, leg states, matched quantity, timing, success/failure reason and exposure/recovery flags. PAPER trade counts and P&L are never merged with Tiny-LIVE results.
- Verification passed: backend TypeScript build, frontend production build, frontend lint, focused personal-bot and Tiny-LIVE account-mode-lease regressions, complete deterministic suite `195/195`, isolated AWS backend-image tests, frontend `nginx -t`, and read-only local-browser UI checks. The Deep Audit page exposed all new controls, the arm button was disabled while PAPER was ON, and the 1280px page had no horizontal document overflow.
- Sanitized artifact: `.deploy/cat-pro-v155-mode-control-20260820.tgz`, SHA-256 `02C16B7FB6A3EA789B5B3D1ED358C05314868C60326BBB4B4FCE982F696A0636`. AWS source rollback: `/opt/cat-pro/backups/v155-mode-control-20260820/source-before-v155.tgz`. Image rollback tags: `cat-pro-backend:pre-v155-mode-control` and `cat-pro-frontend:pre-v155-mode-control`.
- Deployed images are backend `sha256:6412bfcf8c51691bae13f7e4b2c2b9c5ce005f41a4659e7598a6975b7a5f6fcc` and frontend `sha256:d0f3d925d45cfaeef2e1e8bbd104c914467f4368b9795e54944ad367f29efccf`. Backend, frontend and gateway are healthy; edge is running; every restart count is `0`.
- Post-deploy read-only safety truth: durable account mode `PAPER`, active arm `NONE`, active lease `NONE`, trigger in progress `false`, runtime Tiny-LIVE gate capable, and PAPER bot control remains ON. Effective PAPER execution was false at the verification instant because execution eligibility is separately fail-closed; V155 did not force it. No order, balance, funds, API permission, fee/TDS rule, trading policy, threshold, evidence/history or exchange setting was changed by this build.

### V154 Trade Intelligence deployed read-only — 2026-08-20 20:25 IST

- Added the dedicated sidebar route `/trade-intelligence` by upgrading the existing Trade Flow module; `/trade-flow` redirects to it. No second bot, strategy, ledger or execution pipeline was created.
- The new compact endpoint is `GET /api/strategies/strategy-one/trade-intelligence`. It defaults to a rolling 48-hour IST window and supports Today, 24h, 48h, 7d, 14d and a bounded custom range. Only unique, credible, closed Strategy #1 PAPER settlements enter the analytics; duplicate IDs, distorted fills, open/failed records, missing settlement economics and unattributed/other-strategy rows are excluded explicitly. PAPER and LIVE evidence are never mixed.
- The dashboard now shows evidence-backed KPIs, top route/market and BUY/SELL exchange rankings, route matrix, fixed 24-hour IST heatmap with true `ZERO` versus `NO_DATA` semantics, and up to ten profitable settlement details in a responsive drawer. The UI is read-only and does not read/mutate balances, submit/cancel orders, transfer or withdraw funds, or change policy/thresholds/mode/authority.
- Performance work is bounded to this analytics path: source projection is revision-cached, report variants use a bounded 24-entry/30-second cache, payloads are compact, and frontend polling is 30 seconds. The existing Strategy #1 scanner/execution hot path was not changed. The production 48-hour response was approximately 23.9 KB for 1,757 credible settlements, ten routes, ten markets and ten detail rows.
- Verification passed: backend build, frontend production build, frontend lint, new focused service test, legacy V117 report test, full deterministic suite `195/195`, desktop 1440px and mobile 390px browser QA, responsive detail drawer, zero horizontal page overflow, and zero browser console warnings/errors. The Trade Intelligence lazy chunk is approximately 24.96 KB raw / 6.68 KB gzip.
- Sanitized artifact: `.deploy/cat-pro-v154-trade-intelligence-20260820.tgz`, SHA-256 `B8719B79D37D4AA2461559D0892B0DD8E19714B37D2722684E45ED2416AD93A5`. AWS source rollback: `/opt/cat-pro/backups/v154-trade-intelligence-20260820/source-before-v154.tgz`. Image rollback tags: `cat-pro-backend:pre-v154-trade-intelligence` and `cat-pro-frontend:pre-v154-trade-intelligence`.
- Deployed images are backend `sha256:bd8f10ea3c9aa8843979a23dce76364dde0f3975cd58b7502d08704062ccfa85` and frontend `sha256:ba4a0712eb9feb8eb6ba8767eccf669144162b707dc5b2897b49e30701973323`. Backend, frontend and gateway are healthy; edge is running; all restart counts are `0`. The new SPA route is served and legacy `/strategy-one/trade-flow` remains available for backward compatibility.
- Post-deploy safety truth: runtime environment remains Tiny-LIVE-capable, but durable trading-account mode is `PAPER`, active arm `NONE`, active account-mode lease `NONE`, trigger in progress `false`, and the latest COTI record remains `DISARMED` with `attemptsUsed=0/2`. This deployment submitted no order and changed no funds, exchange/API permissions, fee/TDS model, trading policy, threshold, execution mode or evidence/history.

### Post-V153 Tiny-LIVE disarmed unused; PAPER restored — 2026-08-20 19:33 IST

- At the operator's request, pre-arm `tiny-live-prearm-235e08a682ff51c6f9c03804517015c7` was verified `ARMED` with no claim, trigger, blocking authority, execution or possible exposure, then explicitly disarmed.
- Final arm state is `DISARMED`, `attemptsUsed=0/2`; no opportunity ID, authority ID, order or fill was created during this arm.
- Bound lease `tiny-live-account-lease-01fd238a55fdaddbdac8a077becaf9f5` automatically reconciled to `RESTORED` because the pre-arm became terminal. Durable trading-account mode is `PAPER`.
- Current safety truth: active arm `NONE`, active lease `NONE`, blocking authority `false`, recovery `CLEAN`, possible-exposure sessions `0`. Evidence/history was preserved; no transfer, withdrawal or balance mutation occurred.

### Post-V153 COTI Tiny-LIVE lease ACTIVE — 2026-08-20 18:20 IST

- The operator supplied the exact separate confirmation `ACTIVATE TINY-LIVE ACCOUNT LEASE tiny-live-prearm-235e08a682ff51c6f9c03804517015c7`. AWS activated lease `tiny-live-account-lease-01fd238a55fdaddbdac8a077becaf9f5`, bound to exact `COTIUSDT` CoinDCX BUY -> Binance SELL, hard `₹500/leg`, maximum `2` distinct attempts.
- Immediate verification: trading account mode `LIVE`, pre-arm `ARMED`, `attemptsUsed=0/2`, lease `ACTIVE`, effective expiry `2026-08-20 19:42:16 IST`, trigger not in progress, blocking action authority `false`, Tiny-LIVE attempts today `0`, recovery `CLEAN`, possible-exposure sessions `0`.
- The bot may now automatically attempt the first matching fully qualified current opportunity without another click. Every action-time contract, balance, depth, fee/TDS, lot/min-notional, timing, freshness, stress-profit, private-fill and recovery check remains fail-closed. No transfer, withdrawal or automatic retry authority exists.
- Manual fail-safe phrase: `RESTORE PAPER ACCOUNT MODE tiny-live-account-lease-01fd238a55fdaddbdac8a077becaf9f5`. Terminal arm completion/failure or lease/timing expiry must restore `PAPER` automatically; a claimed in-flight attempt is never mode-flipped mid-dispatch.

### Fresh post-V153 COTI pre-arm created; account still PAPER — 2026-08-20 18:18 IST

- The operator supplied the exact phrase `ARM TWO-SLOT COTIUSDT COINDCX BINANCE INR500 ATTEMPTS2 MINUTES180`. AWS created pre-arm `tiny-live-prearm-235e08a682ff51c6f9c03804517015c7`, state `ARMED`, exact route CoinDCX BUY -> Binance SELL, hard `₹500/leg`, maximum `2` distinct attempts, `attemptsUsed=0`, nominal arm expiry `2026-08-20 21:17:56 IST`.
- The current approved timing calibration expires earlier at `2026-08-20 19:42:16 IST`; any account-mode lease will be bounded by that earlier timestamp. Arming itself submitted no order and granted no fund authority.
- Verified immediately after arming: account mode `PAPER`, active lease `NONE`, blocking action authority `false`, recovery `CLEAN`, possible-exposure sessions `0`.
- The required separate activation phrase is `ACTIVATE TINY-LIVE ACCOUNT LEASE tiny-live-prearm-235e08a682ff51c6f9c03804517015c7`. Do not infer it from the arm confirmation.

### V153 route-specific action-time TIF fix deployed; safe PAPER/disarmed state — 2026-08-20 18:12 IST

- The bounded COTI attempt triggered genuinely at `2026-08-20 17:36:45.257 IST`, but failed safely before authorization/order submission. Pre-arm `tiny-live-prearm-606183e0b4dec086489f48fafad69c3b` is terminal `FAILED_SAFE`, `attemptsUsed=1`; remaining slot was cancelled under the no-retry rule. Account lease `tiny-live-account-lease-8f5fb6521a2747b46d7bc41933dc85d6` automatically restored the durable trading account to `PAPER`.
- Root cause was deterministic code drift, not API credentials, market latency or missing inventory: preview and pre-arm correctly accepted the exact CoinDCX COTI `GTC` contract, but the final action-time authority re-check hard-coded `FOK` for both venues. It therefore rejected CoinDCX immediately with `coindcx action-time LIVE contract is no longer ready.`
- V153 introduces one shared fail-closed venue-contract readiness validator used by preview, pre-arm and final action-time authorization. The exact route remains CoinDCX `GTC` BUY plus Binance `FOK` SELL. Missing/invalid TTL, absent exact required TIF mapping or unavailable authoritative private-fill confirmation still blocks. Binance/Bybit FOK behavior is unchanged.
- No fee, TDS, profit, capital, depth, skew, freshness, cooldown, route, API permission, retry, transfer or withdrawal rule changed. The validator is outside the quote-scanner hot path.
- Regression proves valid CoinDCX `GTC` + Binance `FOK` reaches authorization and a changed/mismatched CoinDCX mapping still fails closed at action time. Local build, focused tests and complete deterministic suite passed `194/194`. The new AWS image passed the three focused regressions with networking disabled.
- Sanitized artifact: `.deploy/cat-pro-v153-route-specific-tif-20260820.tgz`, SHA-256 `977681523DB4E07D9497D59E314A158ADC4E48C9E747C598196C3B868351D889`. AWS source rollback: `/opt/cat-pro/backups/v153-route-specific-tif-20260820/source-before.tgz`; image rollback tag: `cat-pro-backend:pre-v153-route-specific-tif`.
- Backend-only deployment completed with image `sha256:6add58170efbcebfc163802b080443920e5a36ed5fd0741582d3f337b18c6446`; backend is healthy, restart count `0`, OOM false. Frontend/gateway/edge were not recreated.
- Current safety truth after deployment: account mode `PAPER`, active arm `NONE`, active account lease `NONE`, blocking action authority `false`, Strategy #1 recovery `CLEAN`, unresolved/possible-exposure sessions `0`. The sole action record remained `PREVIEWED`, never `AUTHORIZED` or consumed; no real order, fill, transfer or withdrawal occurred. Runtime environment remains Tiny-LIVE-capable, but a new attempt requires fresh timing review plus new exact arm and separate lease confirmation; never reuse the terminal arm/lease automatically.

### COTI bounded Tiny-LIVE lease ACTIVE — 2026-08-20 16:48 IST

- The operator supplied the exact separate confirmation `ACTIVATE TINY-LIVE ACCOUNT LEASE tiny-live-prearm-606183e0b4dec086489f48fafad69c3b`. AWS activated lease `tiny-live-account-lease-8f5fb6521a2747b46d7bc41933dc85d6`, bound to the existing exact `COTIUSDT` CoinDCX BUY -> Binance SELL pre-arm, hard `₹500/leg`, maximum `2` distinct attempts.
- Immediate read-only verification: trading account mode `LIVE`, pre-arm `ARMED`, `attemptsUsed=0/2`, lease `ACTIVE`, effective expiry `2026-08-20 19:42:16 IST`, blocking action authority `false`, Tiny-LIVE attempts today `0`, authority records `0`, recovery `CLEAN`, unresolved sessions `0`, possible-exposure sessions `0`.
- The system is now allowed to wait automatically for a fully qualified fresh route and may create a short-lived action authority and submit real orders without another click. No order had been submitted at the immediate verification snapshot. All normal last-look, fee, TDS treatment, balance, lot/min-notional, depth, clock, freshness, stress-profit, private-fill and recovery checks remain fail-closed; no retry, transfer or withdrawal authority exists.
- Manual fail-safe phrase: `RESTORE PAPER ACCOUNT MODE tiny-live-account-lease-8f5fb6521a2747b46d7bc41933dc85d6`. Normal terminal completion/failure, expiry, runtime-gate loss or clean backend shutdown must restore `PAPER` automatically; a claimed in-flight attempt is never mode-flipped mid-order.

### COTI two-slot Tiny-LIVE pre-arm created, lease still absent — 2026-08-20 16:45 IST

- The operator supplied the exact fresh confirmation `ARM TWO-SLOT COTIUSDT COINDCX BINANCE INR500 ATTEMPTS2 MINUTES180`. AWS created durable pre-arm `tiny-live-prearm-606183e0b4dec086489f48fafad69c3b`, state `ARMED`, exact route `COTIUSDT` CoinDCX BUY -> Binance SELL, hard `₹500/leg`, maximum `2` distinct attempts, `attemptsUsed=0`, arm expiry `2026-08-20 19:44:36 IST`.
- The approved timing calibration expires earlier at `2026-08-20 19:42:16 IST`; any account-mode lease is bounded by that earlier limit. Arming submitted no order and granted no fund authority.
- Verified state after arming: account mode `PAPER`, active lease `NONE`, blocking action authority `false`, Tiny-LIVE attempts today `0`, recovery `CLEAN`, unresolved sessions `0`, possible-exposure sessions `0`.
- The next separate operator confirmation is `ACTIVATE TINY-LIVE ACCOUNT LEASE tiny-live-prearm-606183e0b4dec086489f48fafad69c3b`. Do not infer or silently activate it. Only after that exact confirmation can the bounded automatic path wait for a fully qualified fresh opportunity; the normal last-look, fee, depth, balance, clock, freshness and recovery gates still apply fail-closed.

### Fresh COTI Tiny-LIVE timing approval recorded, still disarmed — 2026-08-20 16:43 IST

- The operator supplied the exact confirmation `APPROVE timing-04301c44ddf2651ee00dafe1c8fb871a ATTEMPTS2 HOURS3`. AWS accepted timing record `timing-04301c44ddf2651ee00dafe1c8fb871a` as `APPROVED` for exact route `COTIUSDT:coindcx->binance`, scope `BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH`, calibrated maximum book age `202 ms`, from `2026-08-20 16:42:16 IST` through `2026-08-20 19:42:16 IST`.
- Timing approval has `automaticActivationAllowed=false` and `liveOrderSubmissionAuthorized=false`. Post-approval state remains account mode `PAPER`, active arm `NONE`, active lease `NONE`, blocking authority `false`, and Tiny-LIVE attempts today `0`.
- The next separate operator confirmation is `ARM TWO-SLOT COTIUSDT COINDCX BINANCE INR500 ATTEMPTS2 MINUTES180`. It must not be inferred from the timing approval. After a fresh arm is created, its newly generated pre-arm ID still requires a separate exact account-lease activation phrase before the bounded Tiny-LIVE path can become effective.

### CoinDCX AWS-IP API-key rotation completed safely — 2026-08-20 16:34 IST

- After the operator personally completed both CoinDCX OTP challenges and explicitly authorized transfer, a new CoinDCX API key labelled `CAT-PRO-AWS-IP` was created with IP binding enabled and AWS Elastic IP `15.252.113.245` entered. The CoinDCX dashboard shows the new key separately from the retained `CAT-PRO-READONLY` key and shows a stored masked IP-address field.
- Only `COINDCX_API_KEY` and `COINDCX_API_SECRET` in `/opt/cat-pro/backend/.env` were atomically rotated. No API key, secret or OTP is recorded in this handoff, source control, command output or frontend.
- Only `cat-pro-backend` was recreated under the existing base + Tiny-LIVE-capable + HTTPS compose profile. It is `running`, `healthy`, restart count `0`, image `sha256:500cc0717195ecb57dfc5a2b047fec4d4590e563b27058d7f1037dfcd8bb926c`; frontend, gateway and edge were not recreated.
- A fresh signed read-only five-exchange balance refresh from AWS passed after the rotation. CoinDCX reports `SYNCHRONIZED`, `retainedAfterFailure=false`, `3` synchronized assets and `2` positive assets, proving the new credential is accepted from the CAT PRO host. No order, cancel, transfer or withdrawal request was made.
- Post-rotation safety truth remains account mode `PAPER`, active arm `NONE`, active lease `NONE`, blocking action authority `false`, Tiny-LIVE attempts today `0`, recovery `CLEAN`, unresolved sessions `0`, possible-exposure sessions `0`, residual-recovery previews `0`, and backend restart count `0`.
- The older `CAT-PRO-READONLY` CoinDCX key remains active and untouched. Do not delete or revoke it without a separate explicit operator confirmation after an observation period.

### V152 route-scoped LIVE alert gate deployed after safe disarm — 2026-08-20 15:50 IST

- Root cause of the unused COTI slots was not the `190 ms` freshness boundary. Production read-only diagnostics captured a valid refreshed `COTIUSDT` CoinDCX BUY -> Binance SELL opportunity with CoinDCX `26 ms`, Binance `144 ms`, approximately `120 ms` oldest-book age, `0.501005%` fee-adjusted net, sufficient ₹500-per-leg liquidity and all inventory/rule/depth/stress checks passing. The automatic pre-arm evaluation was instead blocked by the unrelated global `CLOCK_UNSAFE_COINSWITCH` alert.
- `TinyLivePreflightService` now scopes only `CLOCK_UNSAFE_<EXCHANGE>` history alerts to the exact requested BUY/SELL venues. The existing dedicated signed-request clock gate still validates both exact route venues fail-closed. Unknown clock-alert formats fail closed, and recovery, persistence, session/order, settlement/accounting, trading-account and credential CRITICAL alerts remain global blockers.
- No book-age, skew, net-profit, fee, capital, route, API permission, retry, authority, transfer or withdrawal threshold was relaxed. The action-time `190 ms` freshness gate and parallel public-read refresh remain unchanged.
- Added a deterministic route-alert-scope regression covering unrelated CoinSwitch isolation, exact Binance blocking, global restart-recovery blocking, unknown-format fail-closed behavior and resolved-alert exclusion. Corrected the existing UnoCoin deadline fixture to accept one or two total source calls: when the shared deadline is exhausted after the primary request, safely skipping recovery is valid and still satisfies the stated at-most-one-call-per-source contract. Production UnoCoin behavior was not changed by V152.
- Backend TypeScript build and complete deterministic suite passed `194/194`; confirmation-sensitive real exchange tests were not run. Relevant Tiny-LIVE preflight, action-authority, account-lease and action-time refresh regressions also passed individually.
- Sanitized artifact is `.deploy/cat-pro-v152-route-scoped-live-alerts-20260820.tgz`, SHA-256 `DC8E4B7F08DF52881DC564134ABD9E222FA0D1539DEEA60A556B8AE50D59FE5F`.
- The operator requested a safe reset. Pre-arm `tiny-live-prearm-a799f68322541a20b31eb2ec9531d357` was explicitly disarmed unused with `attemptsUsed=0`; account lease `tiny-live-account-lease-b61c69b0d120ea4ecc48765099f0022d` restored the durable account to `PAPER`. Before deployment, active arm, active lease, action authority, order/fill and possible exposure were all verified absent and Strategy #1 recovery was `CLEAN`.
- AWS source rollback is `/opt/cat-pro/backups/v152-route-scoped-live-alerts-20260820/source-before-v152.tgz`, SHA-256 `5D95E8241A41579952077EDE922C532129DB65EDF77F889930D2F816B61D23BA`; rollback image is `cat-pro-backend:pre-v152-route-scoped-live-alerts`. The sanitized artifact uploaded to `/opt/cat-pro/cat-pro-v152-route-scoped-live-alerts-20260820.tgz` matched the local SHA-256 before extraction.
- The AWS-built image passed six isolated networking-disabled regressions: route-alert scope, pilot preflight, action authority, account-mode lease, action-time refresh and UnoCoin fallback. Backend-only deployment completed with image `sha256:500cc0717195ecb57dfc5a2b047fec4d4590e563b27058d7f1037dfcd8bb926c`; backend is healthy with restart count `0`, while frontend/gateway/edge were not recreated.
- Post-deploy preflight-only production evidence proved `NO_UNRESOLVED_CRITICAL_ALERT=PASS` and `SIGNED_REQUEST_CLOCK_SAFETY=PASS` for `COTIUSDT` CoinDCX BUY -> Binance SELL. Two inactive historical clock rows, `CLOCK_UNSAFE_BINANCE` and `CLOCK_UNSAFE_COINSWITCH`, were resolved with an evidence note only after current clock safety was healthy; recurrence automatically reopens them. Alert history is persistence-healthy with unresolved CRITICAL count `0` and no blocker. No threshold, exchange setting, order, fund, API permission or clock configuration was changed.
- Current safe state is account mode `PAPER`, active arm `NONE`, active account lease `NONE`, blocking action authority `false`, Tiny-LIVE attempts today `0`, recovery `CLEAN`, possible-exposure sessions `0`, residual-recovery previews `0`, and no order/reservation/session was created by verification. The runtime environment remains intentionally Tiny-LIVE-capable, but the exact two-step fresh arm and lease confirmations have not been supplied after this disarm; do not manufacture or silently reuse them.
- The prior timing approval expires at `2026-08-20 16:17:42 IST`, so it was not silently reused for a nominal three-hour lease. Fresh genuine evidence (`3,219` public samples, `202 ms` calibrated maximum age) produced review-only proposal `timing-04301c44ddf2651ee00dafe1c8fb871a`, scope `BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH`. It grants no LIVE/order/fund authority. Next exact operator phrase is `APPROVE timing-04301c44ddf2651ee00dafe1c8fb871a ATTEMPTS2 HOURS3`; only after that approval may a new exact pre-arm be created and its separately generated lease activated.
- Separate non-route operational issue: UnoCoin public depth frequently returns empty two-sided books and its legacy recovery endpoint returns HTTP `404`, causing bounded retries/quarantine and log noise. This does not block the exact COTI CoinDCX -> Binance lane and was not altered during V152; treat it as a later UnoCoin market-data repair, not a reason to relax COTI safety.

### V151 bounded Tiny-LIVE account-mode lease deployed, not activated — 2026-08-20 14:44 IST

- Implemented the missing account prerequisite as a narrow journal-first lease inside the existing Strategy #1 path; it is not another bot, strategy, order path or capital manager. It can transition only `PAPER -> LIVE -> PAPER`, only for the exact current `COTIUSDT` CoinDCX BUY -> Binance SELL pre-arm, and it changes no balance, limit, capital, fee, TDS, exchange permission, transfer or withdrawal setting.
- Activation requires a separate exact phrase after the arm already exists. Arming alone still cannot change account mode. The lease binds the exact pre-arm ID, the current approved timing-calibration ID, `₹500/leg`, maximum attempts and route. Its effective expiry is the earlier of arm expiry and timing-calibration expiry; it never grants order authority itself.
- The lifecycle persists `ACTIVATING` before the account ledger is allowed to move to `LIVE`. Active/restore state is append-only and restart-safe. Arm disarm, terminal completion/failure, runtime-gate loss, timing/lease expiry or a normal backend shutdown restores `PAPER` automatically. A `CLAIMED` in-flight attempt is never flipped mid-order; any inconsistent in-flight account state triggers the emergency-stop boundary.
- Added two explicit control routes under the existing Tiny-LIVE router: activate by exact pre-arm plus exact phrase, and explicit PAPER restore by exact lease plus exact phrase. `BOT -> DEEP AUDIT -> V125 / V150 PRE-ARMED TWO-SLOT` remains read-only for this prerequisite and now displays authoritative trading-account mode, lease state/expiry/binding and reconciliation health. No general LIVE toggle or one-click activation was added.
- Local backend/frontend builds, full frontend lint and complete deterministic suite passed `193/193`. The newly built AWS backend image passed the V151 lease, actual trading-account ledger and pre-arm/authority tests with networking disabled; the frontend image passed `nginx -t`.
- Sanitized artifact: `.deploy/cat-pro-v151-bounded-account-lease-20260820.tgz`, SHA-256 `202115FFA4A516CF8F13C445434E703601725636277FD548A498D4EE434E7C32`. Rollback source: `/opt/cat-pro/backups/v151-bounded-account-lease-20260820/source-before-v151.tgz`, SHA-256 `BC688EBA20DF6296EC4C90FA700D62898CA76A75BA5A269FD469202D641D1F00`. Rollback images: `cat-pro-backend:pre-v151-bounded-account-lease` and `cat-pro-frontend:pre-v151-bounded-account-lease`.
- Deployed images are backend `sha256:67cd55898ce311182dedd58a3e3420e2515e35225a793ff3a1dbb7332752dc75` and frontend `sha256:58ea92aa5a9aa4c2a580aae92ff6ab93ea1f4b49717626cb94a290a12942e555`. Backend/frontend/gateway are healthy, edge is running, all restart counts are `0`, and internal `/bot` returns HTTP `200`.
- Post-deploy safety truth: exact arm `tiny-live-prearm-a799f68322541a20b31eb2ec9531d357` remains `ARMED` with `attemptsUsed=0`; account mode remains `PAPER`; active account lease is `NONE`; blocking action authority is false; Tiny-LIVE attempts today remain `0`; emergency stop is clear; Strategy #1 recovery is `CLEAN` with zero unresolved/possible-exposure sessions. No LIVE order, transfer or withdrawal occurred during this build/deployment.
- At `2026-08-20 14:46:52 IST` the operator supplied the exact separate confirmation `ACTIVATE TINY-LIVE ACCOUNT LEASE tiny-live-prearm-a799f68322541a20b31eb2ec9531d357`. Lease `tiny-live-account-lease-b61c69b0d120ea4ecc48765099f0022d` is now `ACTIVE`; account mode is `LIVE` only under this bounded lease. The effective expiry is the earlier timing boundary, `2026-08-20 16:17:42 IST`. Immediate verification showed the arm still `ARMED`, `attemptsUsed=0`, no blocking action authority, Tiny-LIVE attempts today `0`, no reconciliation error, and Strategy #1 recovery `CLEAN` with zero unresolved/possible-exposure sessions. No order had executed at that snapshot.
- The explicit manual fail-safe phrase is `RESTORE PAPER ACCOUNT MODE tiny-live-account-lease-b61c69b0d120ea4ecc48765099f0022d`. Automatic PAPER restoration remains mandatory on terminal arm state, timing/lease expiry, runtime-gate loss or clean backend shutdown; a claimed in-flight attempt is never mode-flipped mid-order.

### V150.1/V150.2 COTI action-time identity and transport repair deployed — 2026-08-20 13:51 IST

- The first explicitly armed two-slot record `tiny-live-prearm-d454fd97f526ca32ae50cc7cc1f3774e` remained safely at zero attempts/orders because the exact action-time fallback found CoinDCX's authoritative `COTI-USDT` metadata while the audited execution identity is `COTIUSDT`; Binance's slower catalog host also exceeded the unchanged `190 ms` deadline. The unused record was explicitly disarmed before repair. No authority, fill, exposure, transfer or withdrawal was created.
- V150.1 resolves CoinDCX market identity punctuation without widening the route: official metadata pair `KC-COTI_USDT` is used for the public read while the existing exact audited identity `COTIUSDT` is preserved in CAT PRO's validated book. Production proved CoinDCX exact reads accepted in approximately `15-48 ms`; the old `market is not registered` blocker is gone.
- V150.2 isolates only Binance's public action-time depth rescue onto the official primary REST host. Production benchmarks from the Mumbai host measured the catalog host at approximately `514-518 ms` and the official primary REST host at approximately `156-164 ms`. The catalog/universe path, signed reads and order APIs are unchanged.
- The hard public-read timeout and dispatch-reserved freshness gate remain `190 ms`. No profit, timing, freshness, fee, depth, capital, route, permission or order rule was loosened. Post-deploy parallel action-time refreshes completed in approximately `145-153 ms`: CoinDCX `15-30 ms`, Binance `143-151 ms`.
- Both hotfixes passed local build/focused tests and the complete deterministic suite `192/192`; the final AWS image passed the action-time, CoinDCX identity and pre-arm/authority tests with Docker networking disabled. Artifacts: `.deploy/cat-pro-v1501-coindcx-coti-alias-20260820.tgz` SHA-256 `74BF8A5963F8C685DD24901B4989AD503A28F1947DC2D7D9BE6948705C308C68`; `.deploy/cat-pro-v1502-binance-action-host-20260820.tgz` SHA-256 `EDD4E5A810665A2D0DC68A7EE7AF74E208A3EDD7D40C99B545EE75E2E939A34C`.
- Rollback source/images are `/opt/cat-pro/backups/v1501-coindcx-coti-alias-20260820/source-before-v1501.tgz`, `cat-pro-backend:pre-v1501-coindcx-coti-alias`, `/opt/cat-pro/backups/v1502-binance-action-host-20260820/source-before-v1502.tgz`, and `cat-pro-backend:pre-v1502-binance-action-host`. Current backend image is `sha256:bd6a97a98c0eb030eec91e3bd6e70b229abf1a9dffe5d9cf19eedd7191c4dba6`; container is healthy with restart count `0`.
- The current operator-authorized record is `tiny-live-prearm-a799f68322541a20b31eb2ec9531d357`: `ARMED`, exact `COTIUSDT` CoinDCX BUY -> Binance SELL, `₹500/leg`, maximum `2` distinct attempts, expiry `2026-08-20 16:53:38 IST`. It currently has `attemptsUsed=0`, no action-authority record and no exchange order. Strategy #1 recovery remains `CLEAN` with zero unresolved/possible-exposure sessions.
- The current final blocker is truthful and independent of the transport repair: the durable trading account is still in `PAPER` mode, so preflight reports `ACCOUNT_MODE_LIVE: Current trading account mode is PAPER.` The exact arm phrase deliberately does not change account mode. Runtime environment gates are LIVE-capable, but no real attempt can occur unless a separate explicit account-mode transition is implemented and authorized. Do not mutate the ledger/account mode silently.

### V150 controlled COTI two-slot Tiny-LIVE batch deployed PAPER-safe — 2026-08-20 13:14 IST

- V150 extends the existing V125 durable pre-arm; it does not create a second bot or execution path. The exact route remains `COTIUSDT` CoinDCX BUY -> Binance SELL at the existing hard `₹500/leg` cap. A new explicitly approved batch can remain armed for at most `180 minutes` and consume at most `2` distinct opportunities.
- Every slot runs the complete fresh action-time permission, clock, timing, balance, rule, depth, fee, stress-profit, last-look and V149 refresh path. The second slot is released only after a clean balanced first completion, waits at least five seconds, and cannot reuse the first opportunity ID. Any blocked/failed/partial/unknown/exposed result terminates the batch and cancels the remaining slot; there is no automatic same-candidate retry, transfer or withdrawal.
- V150 pre-arm records persist the claim and terminal evidence for each slot: opportunity and authority IDs, leg status, matched/unmatched quantity, execution time, success/failure reason, recovery requirement and possible exposure. Restart restoration and transition validation remain fail-closed.
- `BOT -> DEEP AUDIT -> V125 / V150 PRE-ARMED TWO-SLOT` now shows the current exact COTI candidate, current/stress net, book age, quantity, blocking checks, slots used and per-attempt success/failure details with reasons. The old Binance/Bybit-only frontend filter no longer hides the requested CoinDCX -> Binance candidate.
- Local backend build, frontend production build, focused frontend lint and complete deterministic suite passed `192/192`. The timing-calibration and durable pre-arm tests also passed inside the AWS-built image. Sanitized artifact: `.deploy/cat-pro-v150-controlled-two-slot-20260820.tgz`, SHA-256 `7BD3A1BA55631E25A700F5CEE10899382C39F4B885E23257E5A29B9ADAC0A884`.
- AWS rollback source is `/opt/cat-pro/backups/v150-controlled-two-slot-20260820/source-before-v150.tgz`; rollback images are `cat-pro-backend:pre-v150-controlled-two-slot` and `cat-pro-frontend:pre-v150-controlled-two-slot`. Deployed images are backend `sha256:852ea63a9a39beececf5721679cb84a9eed36cebc4735627c019a479e18136ac` and frontend `sha256:f983c0e7e32895b65841920a4411a223fb4b795d54b2a98485c5681fbc92cd2b`.
- Post-deploy backend/frontend/gateway are healthy with restart count `0`; `/bot` returns HTTP `200`. The operator then explicitly approved and entered the Tiny-LIVE runtime profile: `TRADING_MODE=live`, `TRADING_EXECUTION_MODE=live`, `LIVE_TRADING_ENABLED=true`, and the exact Strategy #1/live/order confirmation environment gates are present. This runtime capability is still disarmed: active pre-arm is null, blocking authority is absent, attempts today are `0`, and Strategy #1 recovery is `CLEAN` with zero unresolved/possible-exposure sessions.
- Current genuine COTI evidence created timing record `timing-91b4d80ec03bc2670e47e52a6093ab21`, `203 ms` calibrated maximum age, scope `BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH`. The operator supplied the exact approval phrase at `2026-08-20 13:17:42 IST`; the record is current until `2026-08-20 16:17:42 IST`. Timing approval alone grants no order authority. The later exact durable pre-arm is recorded in the V150.1/V150.2 current-state section above.
- V150 does not change HFT PAPER V2 policy, `0.30%` PAPER economics, fees/TDS treatment, balances, API permissions or evidence/history. Because the host deliberately entered Tiny-LIVE runtime at `2026-08-20 13:20 IST`, the clean PAPER-only observation window that began after V149 ended at that boundary. PAPER evidence is not LIVE-profit proof and the disarmed runtime has not submitted an order.

### V149 bounded action-time parallel book refresh deployed — 2026-08-20 12:27 IST

- The COTI one-shot arm `tiny-live-prearm-9b263715d6813487802f6401126ccf1e` expired unused at `2026-08-20 11:47:47 IST`. It was never claimed: Tiny-LIVE attempts remain `0`, authority history remains empty, zero orders were submitted, recovery stayed `CLEAN`, and no exposure, balance, transfer or withdrawal action occurred.
- The AWS runtime was returned to the base + PAPER + HTTPS compose profile before this upgrade. Post-deploy gates are `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`; all four LIVE/order confirmation values are blank. The Tiny-LIVE runtime gate is false, active arm is null, trigger is idle and blocking authority is absent.
- V149 keeps the normal current-book path unchanged. Only when the exact `COTIUSDT` CoinDCX BUY -> Binance SELL candidate passes every other action-time check and fails solely on `CURRENT_DISPATCH_RESERVED_FRESHNESS`, CAT PRO performs one coalesced parallel public read for both exact books, publishes each through the existing validation/integrity stores, reruns the normal opportunity engine, and requires a new exact-route `EXECUTE` opportunity whose quote timestamps are at least the new read timestamps.
- Each public read has a hard `190 ms` timeout and the exact route has a `500 ms` refresh cooldown. The action freshness threshold remains `190 ms`; no threshold, policy, fee, capital, API permission, retry, timestamp fabrication, order authority or fund-movement rule was relaxed. If either read fails, times out, produces invalid/crossed depth, or refreshed economics no longer qualify, the candidate stays blocked and the one-shot is not retried automatically.
- Production diagnostics expose schema `149.0`, timeout `190 ms`, cooldown `500 ms`, and explicit safety flags. Immediately after deployment the counters are correctly zero because no arm is active and the fallback is demand-driven, not a background poller.
- Local build, three focused regressions and the complete deterministic suite passed `192/192`. The same V149, pre-arm and pilot-preflight tests passed inside the AWS-built backend image with networking disabled.
- Sanitized artifact: `.deploy/cat-pro-v149-action-time-book-refresh-20260820.tgz`, SHA-256 `0BA110BE7576CDDBB3CC21F979BAF1E399BF5171DDD28777DE3AF2714D2B089F`. AWS rollback source is `/opt/cat-pro/backups/v149-action-time-book-refresh-20260820/source-before-v149.tgz`; rollback image is `cat-pro-backend:pre-v149-action-time-book-refresh`; deployed backend image is `sha256:d3b011bcd41342677698f9ac3188ebb64a1170c25b63efa5def8c2aa4057d703`.
- Backend, frontend and gateway are healthy with restart count `0`; edge is running with restart count `0`. Strategy #1 two-leg recovery is `CLEAN` with zero unresolved/possible-exposure sessions, and the residual-recovery assistant has zero previews.
- Because the host deliberately entered LIVE runtime for the expired one-shot, the former claim of a continuous V138 PAPER-only window is no longer valid. A new uninterrupted PAPER-only observation window starts after the V149 deployment at `2026-08-20 12:27 IST`; PAPER evidence is not LIVE-profit proof.

### V144-V148 bounded operator-read performance series deployed — 2026-08-20 11:12 IST

- V144 replaced the unbounded PAPER-history operator read with stable newest-first cursor pagination. The opaque cursor is the immutable `(openedAt, id)` boundary; production two-page verification returned no overlapping IDs. The default remains `100` rows, the hard maximum remains `500`, the response exposes `nextCursor`, `hasMore`, `revision` and `view=OPERATOR_COMPACT`, and `GET /api/paper-trades/:id` remains the full-evidence drill-down.
- V145 made the PAPER screen consume only its current bounded page. Only the newest page polls every five seconds; older cursor pages are static, background-tab polling is disabled, and explicit Newer/Older controls preserve operator navigation without remapping the entire ledger on every refresh.
- V146 made Strategy #1 capital-placement reuse its immutable settled-trade revision. Rebuilt array wrappers with the same revision no longer force identical route-ranking work; a changed settled revision invalidates the cache immediately.
- V147 added a maximum two-second cache and concurrent-request coalescing only to the read-only PAPER-readiness report. Explicit invalidation is available. Execution admission and LIVE authorization explicitly do not consume this cache, so a stale operator report cannot admit a PAPER or LIVE action.
- V148 added the lightweight `GET /api/strategies/personal-bot/performance-summary` endpoint for the PAPER screen. It serves only cached PAPER performance aggregation and cannot evaluate funding, balances, depth, order rules, execution or LIVE authority. The existing full personal-bot endpoint remains available for its dedicated deep-audit page.
- Production response measurements: the 100-row PAPER response fell from `439,446` to `135,487` bytes (`69.17%` smaller), and the PAPER screen's strategy analytics read fell from the former `343,184`-byte full control-plane response to a `4,128`-byte performance summary (`98.80%` smaller). The full endpoint remains separate and measured `330,093` bytes after deployment.
- Local backend build, frontend build/lint, four focused regressions and the complete deterministic suite passed `191/191`. The four focused V144/V146/V147/V148 tests also passed inside the AWS-built backend image with networking disabled.
- Sanitized deployment artifact: `.deploy/cat-pro-v148-performance-series-20260820.tgz`, SHA-256 `79887FFF93D76EBBC905EF54B592093209A9995CCC3EC8CF2751A8E6B8E0EA15`. AWS rollback source is `/opt/cat-pro/backups/v148-performance-series-20260820/source-before-v148.tgz`; rollback images are `cat-pro-backend:pre-v148-performance-series` and `cat-pro-frontend:pre-v148-performance-series`.
- Deployed images are backend `sha256:90b74256b1534c01927cd7f41b016fc4d80bbebea2c9b8b9051754664394d043` and frontend `sha256:761b52051fcc39e1dc04adc1063a8cd8685c37fb10b6afb248742fbed4695c57`. Backend, frontend and gateway are healthy with restart count `0`; edge is running with restart count `0`; internal `/paper-trading` returns successfully.
- Post-deploy runtime is unchanged: `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`; LIVE submission and every exchange/order confirmation variable are absent. Tiny-LIVE runtime gate is false, active pre-arm is null, blocking authority is absent, attempts today are `0`, and current/startup Strategy #1 restart recovery are `CLEAN` with zero possible-exposure sessions.
- Persistent evidence was preserved. The historical live-performance file remains exactly `4,786,943,134` bytes; the bounded checkpoint continues updating. At verification the PAPER store had `13,716` closed records, including `13,636` credible executions and `80` excluded uncredible/distorted executions. A short post-restart log sample continued to accept genuine opportunities while scan duration remained approximately `0.8-8.2 ms`; this is operational evidence, not a long-duration latency guarantee.
- V144-V148 change operator reads and deterministic read-model reuse only. They do not change Strategy #1 policy, `0.30%` PAPER qualification, `0.50%` historical LIVE reference band, fees, TDS treatment, balances, API permissions, capital, PAPER/LIVE mode, arm/authority, order submission, transfers, withdrawals, settlement evidence or history. The V138 clean PAPER observation window remains `2026-08-19 16:16:18 IST` through `2026-09-02 16:16:18 IST`. PAPER evidence is not LIVE-profit proof.

### V143 bounded live-performance checkpoint deployed — 2026-08-20 10:17 IST

- Replaced future appends to the oversized cumulative live-performance analytics cache with one bounded, crash-safe checkpoint plus one `.previous` fallback. The checkpoint retains the current cumulative metrics, at most `720` metric snapshots and the merged bounded settlement evidence needed by this analytics service.
- The historical `/opt/cat-pro/backend/logs/execution/live-performance-evidence.jsonl` is now read-only fallback evidence. It was not deleted, truncated, compacted or rewritten. Before cutover it was `4,786,657,885` bytes; the still-running V142 process appended until the backend replacement boundary, where its final immutable size became `4,786,943,134` bytes. Repeated post-cutover checks and a controlled second backend restart left that exact byte size and mtime unchanged.
- First V143 startup migrated from the legacy bounded tail into `/opt/cat-pro/backend/logs/execution/live-performance-checkpoint.jsonl`. At verification the active checkpoint was `60,830` bytes and its `.previous` fallback was `60,689` bytes. Atomic replacement writes a synced temporary file, preserves the former active checkpoint as `.previous`, then renames the new checkpoint over the active path.
- The controlled second restart proved the production restore path: `restoreSource=CHECKPOINT`, `boundedCheckpoint=true`, `legacyAppendDisabled=true`, `restored=true`, active foundation `linesRead=1`, `validRecordsRead=1`, and legacy foundation `linesRead=0`. The backend did not scan or allocate the 4.5 GiB legacy cache at startup.
- Local TypeScript build, focused legacy/checkpoint/corruption-fallback tests, V142 recovery regression and the complete deterministic suite passed `190/190`. The three focused tests also passed inside the AWS-built image with networking disabled.
- Sanitized deployment artifact: `.deploy/cat-pro-v143-bounded-performance-checkpoint-20260820.tgz`, SHA-256 `ACAA6A302B310AAFEB6FD96F33ED6EBB02A33097E6F35E852857A481463CC9EE`. AWS rollback source is `/opt/cat-pro/backups/v143-bounded-performance-checkpoint-20260820/source-before-v143.tgz`; rollback image is `cat-pro-backend:pre-v143-bounded-performance-checkpoint`. Deployed backend image is `sha256:acf53fbe6470662b5457019725acf694f3c7bdb95b554a02e40019e317aa727a`.
- Backend, frontend and gateway are healthy with restart count `0`; edge is running with restart count `0`. Post-deploy runtime remains `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`, and all four LIVE/order confirmation variables are blank. Strategy #1 recovery is `CLEAN`, residual-recovery previews are `0`, Tiny-LIVE runtime gate is false, active pre-arm is null, blocking authority is absent and attempts today are `0`.
- V143 changes only periodic analytics-cache persistence; it is outside quote ingestion, qualification and order paths. It does not change policy, thresholds, fees, balances, API permissions, PAPER/LIVE mode, authority, orders, transfers, withdrawals, settlement evidence or the V138 clean observation window ending `2026-09-02 16:16:18 IST`. PAPER evidence is not LIVE-profit proof.
- Capacity after the image build is approximately `21 GiB / 29 GiB` used (`72%`) with `8.0 GiB` free; logs use approximately `5.9 GiB`. V143 stops this specific 4.5 GiB cache from growing further but intentionally does not reclaim its historical bytes. Archival or deletion remains a separate explicit operator decision.

### V142 evidence-bound residual recovery + bounded restart deployed — 2026-08-20 09:47 IST

- Added an explicit Strategy #1 residual-recovery assistant for a future unequal two-leg LIVE outcome. It first invokes the existing known-order reconciliation path with `allowNewSubmission=false`; only authoritative terminal unequal fills can produce a preview.
- A preview computes the exact residual direction, venue and reducing side, then requires current SPOT quantity/notional rules, fresh full depth, an audited venue time-in-force/private-fill contract, explicit taker fees, fresh authenticated recovery-venue balance and a bounded incremental-loss estimate. Quantity is rounded down only and any non-tolerance step-size dust blocks the preview.
- The only approval state is `OPERATOR_APPROVED_EVIDENCE_ONLY`, with the exact phrase `APPROVE RECOVERY PREVIEW <preview-id>`. The service deliberately exposes no order, retry, cancel, hedge, transfer or withdrawal port. GET diagnostics is pure read; explicit inspection may perform signed known-order status reads only.
- New read-only/mutation-of-local-evidence routes are under `/api/execution/recovery/strategy-one-residual-assistant`. Production currently reports zero previews because Strategy #1 restart recovery is `CLEAN` with zero unresolved or possible-exposure sessions.
- The first backend recreation exposed a pre-existing restart defect: `/opt/cat-pro/backend/logs/execution/live-performance-evidence.jsonl` had grown to approximately `4.5 GiB`, and startup used `readFileSync` through `JsonlSnapshotStore.readAll()`. Node reached about `3.76 GiB` resident memory and attempted an approximately `8 GiB` allocation, producing `std::bad_alloc` restart loops.
- No evidence file was deleted, truncated, reset or rewritten. `JsonlSnapshotStore.readLatest()` now restores cumulative snapshot state with the existing bounded reverse-tail reader, and `LivePerformanceEvidencePersistenceService` uses that path. Production diagnostics prove `restored=true`, `linesRead=1`, `validRecordsRead=1`, `lastSequence=1253`; the 4.5 GiB historical file remains intact. Stabilized backend memory was approximately `1.75 GiB`, health is green and restart count is `0`.
- Local TypeScript build, focused bounded-tail/recovery tests and the complete deterministic suite passed `189/189`. The two focused tests also passed inside the AWS-built image with networking disabled.
- Sanitized final artifact: `.deploy/cat-pro-v142-residual-recovery-startup-bounded-20260820.tgz`, SHA-256 `FD0893657813D22DC46713EDF391D5036C041C07D95053D2D744DB49508B1901`. AWS rollback source is `/opt/cat-pro/backups/v142-residual-recovery-assistant-20260820/source-before-v142.tgz`; rollback image is `cat-pro-backend:pre-v142-residual-recovery-assistant`. Deployed backend image is `sha256:a714c11edd0f3af0fc010e8836b0218b12f12f80d12041dc19b2e20846fccb79`.
- Post-deploy runtime remains `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`; all four LIVE/order confirmation variables are blank. Tiny-LIVE runtime gate is false, active pre-arm is null, blocking action authority is absent and Tiny-LIVE attempts today are `0`. No order, transfer, withdrawal, threshold, policy, balance, API permission or evidence-history mutation occurred.
- V142 is outside the quote-to-decision hot path and does not add a scheduler or polling loop. It does not restart the V138 clean PAPER window, which remains `2026-08-19 16:16:18 IST` through `2026-09-02 16:16:18 IST`. PAPER evidence is not LIVE-profit proof.
- Capacity watch: root EBS is `29 GiB`, approximately `20 GiB` used (`71%`) with `8.2 GiB` free; logs use approximately `5.8 GiB`. The bounded restore removes the restart/RAM failure, but a separate evidence-retention design is still required before long-term operation so the append-only analytics cache cannot consume the remaining disk. Do not delete or compact it without an explicit evidence-preserving retention decision.

### V141 COTI lot-step-safe Tiny-LIVE funding deployed — 2026-08-19 19:34 IST

- The exact `COTIUSDT`, CoinDCX BUY → Binance SELL preflight no longer misclassifies Binance's mandatory `1 COTI` quantity-step floor as an inventory/depth shortage. For example, a raw quantity near `518.296 COTI` may truthfully remain `REDUCED` at `518 COTI` while passing the Tiny-LIVE funding gate.
- This is a tightly bounded Tiny-LIVE preflight correction, not a relaxed capital rule. A reduced amount passes only when authenticated balances and depth leave the full capital-derived quantity untouched, complete shared-increment evidence is LIVE-order-safe, normalization rounds down by strictly less than one shared step, no paper fallback is used, and the reported INR reduction reconciles to that one-step maximum. Balance caps, depth caps, stale/incomplete evidence, increased quantity and reductions of one full step or more remain blocked.
- CoinDCX operator attestation was applied on AWS after explicit confirmation that the existing CAT PRO key is bound to Elastic IP `15.252.113.245`: Spot order permission confirmed, withdrawal permission disabled, internal-transfer permission disabled and IP allowlist confirmed. A signed read-only scoped permission check for CoinDCX + Binance returned READY; no API key/secret was stored in this handoff.
- Local TypeScript build, focused regression and complete deterministic suite passed `188/188`. The focused regression also passed inside the AWS-built image with networking disabled.
- Sanitized artifact: `.deploy/cat-pro-v141-tiny-live-lot-step-20260819.tgz`, SHA-256 `F67D44E990596BEAE9B5251FF0DDF57AB4C9FCBCEB922748DB0CD40361DBF593`. AWS rollback source is `/opt/cat-pro/backups/v141-tiny-live-lot-step-20260819/source-before-v141.tgz`; rollback image is `cat-pro-backend:pre-v141-tiny-live-lot-step`.
- Deployed backend image is `sha256:bfbfed7f9284ac2a42d64914fca801719e4bf7d1b01ad201fb3002b0da0943ec`; backend/frontend/gateway are healthy and backend restart count is `0`.
- Post-deploy runtime is still `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`; both LIVE confirmation variables are blank. Strategy #1 recovery is `CLEAN`, there is no current exact-route executable opportunity and no LIVE order, transfer or withdrawal occurred.
- Exact COTI dispatch-reserved timing is `492/512` genuine generations/samples with the duration requirement already met. BUY P99 is `174 ms`, SELL P99 is `165 ms`; `20` genuine samples remain. No timing proposal or approval was created. V141 does not restart the V138 PAPER window ending `2026-09-02 16:16:18 IST`; PAPER evidence is not LIVE-profit proof.

### V140 Tiny-LIVE audit truth deployed — 2026-08-19 18:36 IST

- V140 is a reporting/UI-only correction. It does not change execution qualification, fees, depth, timing, policy, balances, evidence, trading mode or order authority.
- The action-time Tiny-LIVE gate now reports the active V4 minimum `0.30%` separately from the persisted historical reference-evidence band `0.50%`. Production API verification returned `activeTinyLiveNetProfitPercent=0.3` and `liveNetProfitPercent=0.5`.
- The BOT audit labels the historical cohort as `Reference evidence >=0.50%`, shows `Active gate >=0.30%`, and describes ranking as the Strategy #1 pilot route set instead of the older Binance/Bybit-only wording. CoinDCX is accepted by the frontend pilot-route type.
- Local backend/frontend builds, the focused regression and the deterministic suite passed `188/188`. The focused test also passed inside the AWS-built backend image with Docker networking disabled.
- Production backend image is `sha256:8b9c51735b0645cdbb2ac33f390cba6876a4d691289e01236639a982a18c3280`; frontend image is `sha256:5942d4be17142a648027d44f429ff56c3308afbb7791a0230d0d816cdc5528c4`. Both containers are healthy with restart count `0`; gateway and edge remain healthy.
- Sanitized artifact: `.deploy/cat-pro-v140-tiny-live-audit-truth-20260819.tgz`, SHA-256 `B6816AD0D198D9C7C4B067BC54B26F96D0297D2E84A1E9D22D9FA821D70D5C04`. Rollback source is `/opt/cat-pro/backups/v140-tiny-live-audit-truth-20260819/source-before-v140.tgz`; rollback images are `cat-pro-backend:pre-v140-tiny-live-audit-truth` and `cat-pro-frontend:pre-v140-tiny-live-audit-truth`.
- Post-deploy runtime remains `PAPER`: Tiny-LIVE runtime gate is false, no active pre-arm exists, no action authority exists, LIVE attempts are `0`, and restart recovery is `CLEAN` with zero possible-exposure sessions.
- Exact `COTIUSDT:coindcx->binance` timing proposal remains honestly blocked while evidence matures: `414/512` unique dispatch-reserved generations and BUY/SELL samples, with `1,776,674/3,600,000 ms` observation span at 18:39 IST. Collection is automatic. No threshold or history was changed.
- The prior WAL timing calibration is expired and does not authorize COTI. Once COTI evidence reaches both requirements, a review-only proposal can be created; approval still requires the operator's exact proposal phrase. Binance COTI SELL inventory and manually verified CoinDCX least-privilege API attestations remain separate blockers. No order or fund movement occurred.
- V140 does not restart the V138 qualification window; the clean PAPER observation window remains `2026-08-19 16:16:18 IST` through `2026-09-02 16:16:18 IST`. PAPER evidence is not LIVE-profit proof.

### V139 CoinDCX → Binance COTI Tiny-LIVE readiness deployed — 2026-08-19 18:10 IST

- The exact additional Strategy #1 pilot lane is `COTIUSDT`, `CoinDCX BUY → Binance SELL`. No reverse route and no other CoinDCX coin is admitted by this exception.
- CoinDCX Spot documents `GTC`, not `FOK`; therefore the exact lane uses an aggressive priced CoinDCX `GTC` BUY with durable client identity and bounded cancel/reconciliation, paired with a Binance `FOK` SELL. Dispatch is parallel, automatic retry is forbidden, acknowledgement is never treated as fill evidence, and possible one-leg exposure remains recovery-blocking.
- CoinDCX authenticated order/trade events are owned by the durable private-fill journal. The official Socket.IO `2.4.0` client is pinned exactly; the service performs a signed read before signed join, uses a short renewable lease, and exposes no order, cancel, transfer or withdrawal method. CoinDCX documentation provides no subscription ACK, so readiness does not claim one.
- Versioned policy `strategy-one-execution-policy-v4-tiny-live-030`, revision `4`, hash `0a102b2ba196783b9a45bda6dfdfa718d810b672874b35c651c28c6e927304b6`, was activated atomically after pausing the PAPER bot with a clear zero-exposure guard. Tiny-LIVE minimum net is now `0.30%`, capital remains `₹500` per leg and concurrency remains `1`. The bot was resumed in `PAPER_ONLY`.
- Production remains `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`; policy-level LIVE order submission and automatic fund movement remain false. There is no active pre-arm, no blocking action authority, attempts are zero, and Strategy #1 recovery is `CLEAN` with zero possible-exposure sessions.
- Fresh read-only balances showed CoinDCX `8.10334732232714 USDT`, while Binance had no positive `COTI` balance. The exact route must remain blocked until Binance has sufficient COTI SELL inventory. CoinDCX least-privilege attestations are also intentionally absent until the operator verifies Spot trade enabled, withdrawal/internal transfer disabled, and AWS Elastic IP binding in the CoinDCX API UI.
- Current pilot state is `WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY`; no current qualifying exact-route opportunity was present at verification. Exact route-specific timing/evidence must accumulate genuinely after deployment and is never backfilled or fabricated.
- Local backend/frontend builds passed and the complete deterministic suite passed `188/188`. The final AWS image passed the focused CoinDCX private-fill, bounded-GTC, permission, route-contract, two-leg, preflight, authority and policy tests with Docker networking disabled. No exchange order or fund movement occurred.
- Sanitized artifact: `.deploy/cat-pro-v139-coindcx-coti-readiness-20260819.tgz`, SHA-256 `C693BC055E40AE45CD7569474010021A19739DB1BD556FB9F1843C2CBE94A692`. Deployed backend image: `sha256:b929bda2d74165e52bad64537ee1de8d867cd58dc99f3f3e9641fbb6185610ab`. Rollback image: `cat-pro-backend:pre-v139-coindcx-coti-readiness`; source backup: `/opt/cat-pro/backups/v139-coindcx-coti-readiness-20260819/source-before-v139.tgz`.
- V139 changes Tiny-LIVE readiness only and does not change V138 PAPER qualification/re-entry semantics. The clean PAPER observation window therefore remains `2026-08-19 16:16:18 IST` through `2026-09-02 16:16:18 IST`. PAPER evidence is not LIVE-profit proof.

### V138 HFT PAPER V2 deployed — 2026-08-19 16:16 IST

- AWS backend-only rollout completed from sanitized artifact `.deploy/cat-pro-v138-hft-paper-v2-20260819.tgz`, SHA-256 `64E0653AD21609E5F398541976CA5CB3EA1883C19D268C1DE7456C5BA53D425F`.
- The immutable active policy is now `strategy-one-execution-policy-v3-hft-paper`, revision `3`, hash `93e50b4734b10ed402ab674ea8892db7e1809d348033716ec1949c2888f635b1`. Historical V1/V2 definitions and activation hashes remain unchanged.
- V3 PAPER admission uses minimum net `0.30%` and a `5,000 ms` route cooldown. A post-stress route at or above `0.50%` may use the zero-dwell fast lane only after two genuinely different BUY/SELL book-timestamp generations; an unchanged snapshot cannot replay an attempt. The standard lane remains three observations and `5,000 ms` persistence.
- Tiny-LIVE remains unchanged at minimum net `0.50%`, `₹500` per leg, one concurrent trade and every existing depth, funding, FOK, private-fill and recovery requirement. Policy-level LIVE order submission and automatic fund movement remain forbidden.
- The operator bot was paused before activation. The activation guard was clear: zero open account positions, execution sessions, route locks, non-terminal orders and unresolved recovery incidents. V3 was then persisted atomically and the bot resumed in `PAPER_ONLY`.
- Production runtime after rollout: `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`, effective PAPER execution enabled, backend healthy with restart count `0`, and Strategy #1 state `WAITING_FOR_OPPORTUNITY`.
- Early post-rollout hot path remained `PASS`: market update → decision P95/P99 `9/16 ms`, decision → queue P95/P99 `4/5 ms`, candidate decision → execution start P95/P99 `4/4 ms`, completion P99 `6 ms`, dropped candidate snapshots `0`.
- Focused tests passed inside the new AWS image with networking disabled. Local backend build, architecture/script checks, frontend lint/build and the complete deterministic suite passed `186/186`; confirmation-sensitive real-order tests were excluded.
- New backend image: `sha256:a79c25936769e8a14296cb205cef7ae435de506c547c5477165a01edbbdb5096`. Rollback image: `cat-pro-backend:pre-v138-hft-paper-v2` (`sha256:eb2ac454347ed64ebdfdf0125a18c1f32092e5d91bc668093c5341ec3db1162a`). Source backup: `/opt/cat-pro/backups/v138-hft-paper-v2-source-predeploy-complete-20260819.tgz`.
- Because V138 materially changes PAPER qualification and re-entry policy, the clean 14-day observation window starts `2026-08-19 16:16:18 IST` and ends `2026-09-02 16:16:18 IST`. The existing daily monitor was updated to this exact window. PAPER evidence is not LIVE-profit proof.

### 2026-08-17 urgent handoff refresh (immediately after your latest request)

- Live status at handoff: PAPER mode is intentional and primary; LIVE execution remains OFF. The bot is still in the path to production-grade readiness.
- The most recent controller status confirmed `PAPER_SOAK_COMPLETE` with completed shadow outcomes above the 50-shade threshold, so SHADOW readiness is no longer the blocker.
- The 14-day PAPER qualification logic remains enabled, and the controller still does not expose live success claims from PAPER trades.
- The build-and-performance scan was completed across backend + frontend. No file corruption or unsafe permission changes were found; all architecture and route boundaries are intact.
- Critical bug found and left unimplemented (diagnosis only):
  - `GET /api/paper-trades` returns full history each poll (`~10k+` rows), with compressed payload around `40.5 MB`.
  - `frontend/src/modules/paper-trading/hooks/usePaperTrades.ts` polls every `2000 ms`.
  - Backend reads all history through `backend/src/trading/services/PaperTradingService.ts` and `PaperTradeStore.ts`.
  - UI page `frontend/src/pages/PaperTrading.tsx` maps all returned rows directly.
  - This creates sustained CPU/GC pressure and large egress and is the highest priority production bottleneck today.
- Secondary findings (diagnosed but not fixed):
  - `/api/strategies/personal-bot` returns a large response (~245KB / 5s), with heavy arrays (`capitalPlacement`, `excludedExecutions`, etc.) and repeated full scans in `PersonalStrategyOneBotService.ts` and capital placement services.
  - Diagnostics for readiness duplicates analytics work across orchestrator hot path and readiness report paths.
- Measured context:
  - Scheduler and execution hot path remains fast after the c7i.xlarge upgrade; backend CPU and memory are operationally acceptable for now.
  - Gateway-level network usage shows dashboard endpoints are the major traffic driver.
  - Paper trades and personal-bot payload growth can now be the first practical limiter on sustained throughput.
- Next 3 build priorities before Tiny-LIVE scale-up:
  1. Replace `/api/paper-trades` with authoritative cursor pagination + compact summary and server-side metrics; frontend should consume paginated data with virtualized rows.
  2. Introduce revision-based caching for settled capital placement/reconciliation in `StrategyOnePilotPreflightService` and `StrategyOneCapitalPlacementService`, and keep drill-down detail endpoints separate.
  3. Add cached paper-admission readiness in `UnifiedAutomatedExecutionOrchestratorService` and paper readiness report paths, invalidated only on new SHADOW/market/account changes.
- Keep scope focused: no new autonomous fund-movement logic, theme/UI experiments, or new strategy families until these bottlenecks are fixed.

### V126.2 deployed — PAPER admission deadlock resolved

- Production diagnosis confirmed that the `28/50` Genuine PAPER gate was not a browser-refresh problem. The unified Strategy #1 orchestrator selected `PAPER` as soon as the operator arm was present, while the PAPER scheduler correctly rejected every candidate until SHADOW readiness passed. Because the same central owner was no longer dispatching SHADOW candidates, the remaining outcomes could not be collected.
- The local fix makes the state machine use the complete controller `paperExecutionAllowed` result: it stays in genuine `SHADOW` while admission is not ready, switches to `PAPER` only after the full readiness gate passes, remains `DISABLED` under emergency stop, and retains `LIVE_BLOCKED` for non-PAPER account modes.
- Only `UnifiedAutomatedExecutionOrchestratorService.ts` and its deterministic test were changed. Backend build, focused orchestrator test and the complete deterministic suite passed `184/184`; no exchange request or confirmation-sensitive real-order test ran.
- Sanitized two-file artifact: `.deploy/cat-pro-v1262-paper-gate-fix-20260817.tgz`, SHA-256 `93D39E29E38D550886CB6DB1BC9002AB4432379308C630A444EE745DF1C0F13F`. It contains no environment, credential, log, dependency, history or compiled-output file.
- V126.2 was deployed using `docker-compose.yml + docker-compose.paper.yml + docker-compose.https.yml`. Rollback artifacts are `/opt/cat-pro/backups/v1262-source-predeploy-20260817.tgz` and image tag `cat-pro-backend:pre-v1262`; the deployed backend image is `sha256:7b3ae16822d57b9e14b5c6b0d9629fbc7ae4d8a1aa491b1d9f5bed03e22b39a5`.
- The focused no-network orchestrator regression passed inside the new AWS image before replacement. After backend-only recreation the container became healthy with restart count `0`, the dashboard route returned HTTP `200`, account mode remained `PAPER`, open trades remained `0`, and runtime `liveTradingEnabled` remained `false`.
- Production proof: the unified owner changed from deadlocked `PAPER` to `SHADOW`, `paperCycles` remained `0`, the dispatcher produced five new genuine dispatches without revalidation failures, and completed SHADOW evidence advanced from `28/50` to `33/50`. This demonstrates real progress rather than a UI refresh or synthetic counter change.
- The engine will remain in SHADOW until the complete readiness gate passes. It will then switch automatically to PAPER; the effective 14-day PAPER execution soak starts only when that transition occurs. No readiness threshold, economics policy, evidence record or history was lowered, bypassed or rewritten.

### 14-day PAPER-only trial active — qualification phase

- The operator chose a new 14-day safe trial. The verified observation window starts `2026-08-17 05:57:46 IST` and ends `2026-08-31 05:57:46 IST`.
- AWS now runs `docker-compose.yml + docker-compose.paper.yml + docker-compose.https.yml` using the already verified V126.1 images. No source, policy, history, threshold, balance or exchange setting changed.
- Runtime gates are `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, automated PAPER confirmation present, `LIVE_TRADING_ENABLED=false`, and every LIVE runtime/order confirmation empty. Tiny-LIVE runtime, active pre-arm, action authority, exchange-order permission and automatic fund movement are all OFF.
- The planned backend recreation completed healthy with restart count `0`; frontend/gateway remained healthy and internal `/bot` returned HTTP `200`. Strategy #1 recovery remained `CLEAN` with zero unresolved or possible-exposure sessions.
- PAPER is armed and the unified orchestrator is in `PAPER`, but actual automatic PAPER execution initially remains fail-closed in the qualification phase: only `28/50` required completed SHADOW outcomes are present, readiness is `INSUFFICIENT_DATA`, and `22` more genuine outcomes are required. No gate was lowered or bypassed. The controller can become allowed only after the existing readiness conditions pass.
- Existing evidence was preserved: at trial start the report retained `10,135` attributed closed PAPER trades and `767` consecutive runtime-acceptance passes. This new window does not reset or rewrite historical evidence; its start is recorded separately for final date-bounded review.
- App heartbeat `cat-pro-14-day-paper-trial-monitor` performs one read-only status check daily through the trial window. It is forbidden from changing deployment, modes, policies, thresholds, funds, API permissions, arm/authority, orders, evidence or history. At the end it must report evidence without treating PAPER profit as guaranteed LIVE profit.

### V126.1 deployed — audit wall-clock freeze fixed

- Root cause: V126 used `lastObservedAt - firstObservedAt` as its one-hour readiness clock. When the market produced no accepted Strategy #1 economics generation, `lastObservedAt` stopped advancing and the audit froze at `57m 37s` even though the healthy production runtime had observed the market for much longer.
- V126.1 keeps two separate truths: `wallClockSpanMs` measures elapsed audit time after the first genuine sample, while `eventSpanMs` measures only the first-to-last economics-event span. `idleSinceLastObservationMs` exposes market/evidence inactivity explicitly. The backward-compatible `spanMs` now aliases the wall-clock window.
- `READY_FOR_POLICY_REVIEW` now uses the wall-clock window. An opportunity drought is counted as observation evidence, but it does not create an economics sample, current candidate, LIVE authority or order. Profit bands, rankings and blocker counts still use genuine unique post-orchestrator generations only.
- The BOT audit panel now shows the truthful audit window and the time since the latest economics sample separately.
- Local validation passed: backend build, focused inactivity-boundary test, frontend lint/build and deterministic suite `184/184`. Real exchange APIs and confirmation-sensitive order tests were not included.
- Sanitized four-file artifact: `.deploy/cat-pro-v1261-audit-clock-sanitized-20260817.tgz`, SHA-256 `A94837BABDA5AE49EA7334552C55387E0AB33283F1D6A2DB3EC2EEDC0493B0CB`. No `.env`, credential, log, dependency or compiled-output file was included.
- VPS rollback artifacts: `/opt/cat-pro/backups/v1261-source-predeploy-20260817.tgz`, `cat-pro-backend:pre-v1261` and `cat-pro-frontend:pre-v1261`.
- Production images: backend `sha256:7e5594a6cf780120d32459c4a2e0f6888b056530e8e9d601a037e89667ccef47`; frontend `sha256:870cce3854ca23df3294a6c82aa539d9d0854ca75e63704977c2fa09970cf1ff`.
- Post-deployment backend/frontend/gateway are healthy with restart count `0`; internal `/bot` returns HTTP `200`. The audit is `READY_FOR_POLICY_REVIEW` with a `10,640,947 ms` wall-clock window, `19,008` genuine economics generations, `5,663` LIVE-economics generations and `2,472` dispatch-reserved LIVE generations.
- Exact action-time state remained `WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY`: no selected route, no active pre-arm, no authority, zero attempts, no order, permission boundary `READY`, and Strategy #1 recovery `CLEAN` with zero possible-exposure sessions.

### V126 deployed — truthful Tiny-LIVE opportunity audit and PAPER/LIVE UI separation

- V126 adds one durable read-only Binance/Bybit Strategy #1 economics audit at `GET /api/execution/tiny-live/strategy-one-opportunity-audit`. It reuses the existing deferred post-orchestrator V112 evidence path; no new market collector or ingest-loop work was added.
- Every unique quote generation now retains its fee-adjusted net-profit band, central decision, insufficient-liquidity count, dispatch-reserved LIVE-eligible count, latest/best net return, bounded net-return distribution and estimated fee-impact distribution. Unchanged quote generations remain deduplicated.
- The report ranks routes and blockers, and separately classifies the exact current action-time checks into profit, freshness/timing, inventory/rules, fees/depth/stress, venue permissions and historical evidence. It does not change the `0.05% / 0.30% / 0.50%` policy thresholds.
- The economics cohort starts from genuine post-V126 observations. Missing legacy economics are not fabricated. At least one continuous hour of observed economics is required before the report changes from `COLLECTING` to `READY_FOR_POLICY_REVIEW`; that state still does not approve a policy change or order.
- The BOT dashboard now labels PAPER analytics, PAPER executions, PAPER replay and simulated ledger rows explicitly. Tiny-LIVE authority is a separate `OFF`, `DISARMED` or `ARMED` badge based on the live pre-arm diagnostics instead of a static PAPER-only/LIVE-off claim.
- Local validation passed: backend TypeScript build, focused V126 persistence/audit test, frontend TypeScript production build, frontend lint and the complete deterministic suite `184/184`. Real exchange APIs and confirmation-sensitive order tests were intentionally excluded.
- Sanitized deployment artifact: `.deploy/cat-pro-v126-opportunity-audit-sanitized-20260817.tgz`, SHA-256 `E3AA4F0589C1A45288EA8CA5CF6446851D684C739AD21A1207C189765D71EFE5`. It contains no `.env`, logs, `node_modules` or compiled `dist` output.
- VPS rollback artifacts: `/opt/cat-pro/backups/v126-source-predeploy-20260817.tgz`, `cat-pro-backend:pre-v126` and `cat-pro-frontend:pre-v126`.
- Production images: backend `sha256:8392ad103b8c1fb2d563f663b254f6916304ff2c98944ca6c6eef51e1cf4c472`; frontend `sha256:87c1fb130188376a29e496251eedf91d0956f6c4aaf3b2a827736df98325d3f2`.
- Post-deployment backend/frontend/gateway are healthy with restart count `0`; the internal `/bot` route returns HTTP `200`. Strategy #1 recovery is `CLEAN` with zero unresolved or possible-exposure sessions.
- The first production audit snapshot after about `82 seconds` contained `163` unique economics generations: `83` discovery-band, `72` qualified-band and `8` LIVE-economics-band observations; `6` of the LIVE-economics observations also met the dispatch-reserved freshness boundary. Top ranked route was `VANRYUSDT:bybit->binance`, timing-ready, with P95 net `0.6991%`. This short snapshot is diagnostic evidence, not a profit or fill claim.
- At the same exact action-time poll, no current Binance/Bybit EXECUTE opportunity existed, the one-shot was disarmed, active authority was `null`, attempts were `0`, and no session/order was created. The next safe action is to let the honest one-hour V126 cohort complete, review its route/blocker distribution, then make a separate operator decision about a newly selected exact one-shot arm.

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
- Runtime: `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`, using `docker-compose.paper.yml`; `docker-compose.tiny-live.yml` is not active.
- Effective LIVE attempt authority: DISARMED; no active pre-arm or one-time authority exists.
- Exchange order-submission environment gate is disabled and every LIVE/order confirmation variable is blank.
- Automatic retries after an unknown/partial submission: OFF.
- Automatic transfers and withdrawals: OFF.
- Tiny-LIVE runtime gate: false; active arm: none.
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
ssh -i C:\Users\ROG\.ssh\cat-pro-paper-key ubuntu@15.252.113.245 "nproc; free -h; cd /opt/cat-pro && docker compose -f docker-compose.yml -f docker-compose.tiny-live.yml -f docker-compose.https.yml ps"
```

Read-only BOT truth from inside the VPS:

```bash
curl -sS http://127.0.0.1:8080/api/strategies/personal-bot | jq '{state:.data.state,control:.data.control,dailyActivity:.data.paper.dailyActivity,hotPath:.data.hotPath}'
```

## Secret-handling note

- No passwords, API keys, exchange secrets, Basic Auth secrets or private-key contents are stored in this handoff.
- Do not paste secrets into source code, documentation, chat summaries or command output.

## V127 UI/read-path cleanup deployment (2026-08-17)

- V127 is deployed on the AWS PAPER host with the base, PAPER and HTTPS compose overlays only. Backend image: `sha256:b4b674c3b3b641af74089be57d1d5e11281e15c2c95e0dcd742e36181fed0713`; frontend image: `sha256:e372bb51916fad9b44bc8faf5f7f4a470bba039acb19fae11531e51e003fd07b`.
- Deployment archive checksum: `0b48f62bd864969fdde1a9ec7839e5763ce88bbf526be995a2d0c8fb1de1b31d`. Rollback source: `/opt/cat-pro/backups/v127-source-predeploy-20260817T153314Z.tgz`; rollback images: `cat-pro-backend:pre-v127` and `cat-pro-frontend:pre-v127`.
- Six stale AWS-only source artifacts were removed after backup: two obsolete/backup backend files and four old frontend dashboard/theme artifacts. Clean staged backend and frontend Docker builds passed after removal.
- PAPER history responses are bounded to the latest 100 rows by default (maximum 500) with authoritative server summaries. Stable read snapshots and cached Strategy #1 analytics avoid repeatedly cloning/re-sorting the entire durable PAPER ledger.
- The BOT Focus view no longer polls heavy Tiny-LIVE diagnostics; those queries run only while Deep Audit is open. Global footer polling is consolidated, exchange fleet/clock polling is menu-on-demand, and current/recent/lifetime counter windows are displayed separately.
- Responsive QA uses five primary mobile navigation controls with a contained Advanced menu. Nginx gzip, immutable hashed-asset caching and no-cache HTML are active; both frontend and gateway `nginx -t` passed.
- All four containers are healthy with restart count zero. Runtime remains `paper` / `PAPER_ONLY`; LIVE execution and order submission remain false. Persistent PAPER evidence was preserved: `11,071` closed stored records immediately after deployment.
- PAPER confirmation is correctly armed, but automatic PAPER execution is currently fail-closed because current SHADOW readiness is `CAUTION` (`37.24%` success, `47.09%` profitable executable samples, `43%` data availability and `-22.45%` average predicted-profit retention). No threshold was lowered or bypassed; the controller can resume only after its existing evidence policy returns `READY_FOR_PAPER`.
- The local operator key remains at `C:\Users\ROG\.ssh\cat-pro-paper-key`. A user-requested restricted copy is at `C:\Users\ROG\Downloads\CAT-PRO-PAPER.pem`; private-key contents are not recorded here.

## V127.2 visible SHADOW quality metrics (2026-08-17)

- The PAPER readiness API now exposes the current SHADOW success rate, data-availability rate and average predicted-profit retention together with their authoritative configured targets. The values are read-only evidence; no threshold or readiness policy was changed.
- `Paper Trading → Genuine Paper Gate` now renders three live actual/target cards with `PASS` or `BELOW TARGET` state and bounded progress bars. This replaces the need to infer the weak metrics from a chat response.
- Local backend build, frontend lint/build, the focused readiness contract test and the complete deterministic suite passed `184/184`.
- V127.2 AWS images are backend `sha256:e0b8f4917b5214aaf6ce9844b8155d7ba4eb7a13ed382c74d5c82138c798d569` and frontend `sha256:41f6c90dd82c088aa9e59ae38f2a4dc0c15dbf1ba862e2415919ff74d8040480`. Rollback source is `/opt/cat-pro/backups/v1272-readiness-metrics-source-predeploy-20260817T2138IST.tgz`; rollback tags are `cat-pro-backend:pre-v1272-readiness-metrics` and `cat-pro-frontend:pre-v1272-readiness-metrics`.
- Immediate production evidence after deployment was success `60.67% / 70%`, data availability `53.56% / 90%`, and profit retention `20.5481% / 50%`. These rolling values will change as genuine SHADOW outcomes arrive.
- Backend, frontend and gateway were healthy with restart count zero; edge was running with restart count zero. Runtime remained `paper` / `paper`, LIVE execution and order submission remained false, and attributed closed PAPER trades continued to `11,135` without reset.

## V128 embossed neon interface theme (2026-08-17)

- The shared frontend theme now uses a reference-inspired dark navy machined-glass treatment: raised cyan/violet/magenta panel rims, bright top bevels, dark lower bevels, recessed inner metric tiles, embossed sidebar controls and a deeper HOPUN identity plaque.
- The treatment is CSS-only. No JavaScript dependency, data poll, backend route, trading calculation or execution-path work was added. The production CSS gzip size changed from about `20.79 KB` to `21.62 KB`; JavaScript bundles remained materially unchanged.
- Touch layouts suppress hover movement and `prefers-reduced-motion` remains supported. Existing semantic success/warning/danger borders and mobile navigation structure remain intact.
- Frontend lint and production build passed locally and again inside the AWS image. Deployed frontend image: `sha256:68a7ec6fa964848c776dc982f4987c1d3fd0c19fb4d479dc5ef108e02f3739fa`; rollback source: `/opt/cat-pro/backups/v128-embossed-neon-source-predeploy-20260817.tgz`; rollback tag: `cat-pro-frontend:pre-v128-embossed-neon`.
- Backend was not rebuilt or recreated. Post-deployment backend, frontend and gateway were healthy with restart count zero; runtime remained `paper` / `paper` and LIVE remained false.

## V128.1 Dashboard cyberdeck refinement (2026-08-17)

- The existing main Dashboard was visually refined without adding a feature, data request or control. Its current sections, values, links and layout semantics remain unchanged.
- The CAT PRO overview is now a holographic command plate; its four feed metrics use recessed illuminated bays. Execution and portfolio metrics use six/eight alternating embossed accent channels, while opportunity, health, balance and market panels use deeper console frames and recessed rows.
- All effects are CSS/DOM-class presentation only. Frontend lint and production builds passed locally and on AWS; the final CSS is about `23.01 KB` gzip and the JavaScript increase is limited to static class-name strings.
- Deployed frontend image: `sha256:2b9387d4e8a480e71693420c44056e7b1b1300e3acfe1c95308d6f198ca24265`; rollback source: `/opt/cat-pro/backups/v1281-dashboard-cyberdeck-source-predeploy-20260817.tgz`; rollback tag: `cat-pro-frontend:pre-v1281-dashboard-cyberdeck`.
- Backend was not rebuilt or recreated. Backend, frontend and gateway remained healthy with restart count zero; runtime remained `paper` / `paper`, and LIVE remained false.

## V128.2 Dashboard aurora-ribbon correction (2026-08-17)

- Removed the repeated decorative blue circles that were covering the upper-left content of Dashboard execution and portfolio metric cards. Their absolute positioning had inherited `top` and `left` values from the shared embossed-panel pseudo-element rule.
- The affected card layer now explicitly resets every inset and replaces the circular ornament with a wide clipped northern-lights ribbon using cyan, green, violet and the card accent. No animation, JavaScript, feature, data request or backend/execution-path change was introduced.
- Frontend lint and production builds passed locally and in the AWS image. The served production CSS contains the aurora polygon rule and no longer contains the old `6rem` circular-corner signature.
- Deployed frontend image: `sha256:c9d1cf2196e4b9771cac212b85a3f09dbbef996854a13c24f5091ccb07eb72ec`; rollback CSS: `/opt/cat-pro/backups/v1282-aurora-ribbons-20260817/globals.css`; rollback image tag: `cat-pro-frontend:pre-v1282-aurora-ribbons`.
- Backend was not rebuilt or recreated. Backend, frontend and gateway are healthy with restart count zero; edge remains running with restart count zero. Runtime remains `paper` / `paper`, LIVE remains false and all LIVE/order confirmation values remain empty.

## V129 five-exchange balance synchronization isolation (2026-08-17)

- Diagnosed the all-exchange `STALE` balance display as one global synchronization freeze, not a frontend rendering bug. The shared balance runner had remained in progress for more than 36 minutes because one UnoCoin wallet read never settled; the surrounding `Promise.all` therefore prevented every later ten-second cycle from completing.
- Each exchange balance read now has an independent `12,000 ms` outer deadline and a per-exchange single-flight guard. A slow venue fails only its own current result, last-known balances are retained, and no duplicate authenticated request is launched while the original request remains unresolved. CoinDCX, Binance, Bybit and CoinSwitch continue refreshing normally.
- Runner diagnostics now expose `unresolvedExchanges`. A late successful response safely releases the venue guard so the exchange can rejoin later cycles; no order, transfer, withdrawal, balance mutation, policy threshold or LIVE authority was added.
- The deterministic regression proves bounded completion, continued healthy-venue refresh, duplicate suppression, late-settlement guard release and full recovery. Backend build and the complete deterministic suite passed `185/185`; real exchange API and confirmation-sensitive order tests remain excluded.
- AWS rollback source files are under `/opt/cat-pro/backups/v129-balance-sync-isolation-20260817`; rollback image tag is `cat-pro-backend:pre-v129-balance-sync-isolation`. Deployed backend image: `sha256:ebf0041c70fbef5ef427868bfe635fb3f6e5fff2cb06c155cad7952723854a26`.
- Post-deployment evidence first showed the intended isolated state: four venues synchronized while UnoCoin alone was `FAILED`, its 133 last-known balances were retained, and `unresolvedExchanges=["unocoin"]`. A later cycle recovered automatically to `5/5`, 143 synchronized balances in `341 ms`, zero unresolved exchanges and no skipped venue.
- Backend and gateway are healthy with restart count zero; frontend and edge remained running. Runtime remains `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper` and `LIVE_TRADING_ENABLED=false`.

## V130 UnoCoin hard deadlines and truthful footer state (2026-08-18)

- The recurring `4/5` fleet state was traced to the UnoCoin upstream API, not a Strategy #1 policy mutation. Its public pair/ticker requests and authenticated wallet request could ignore `AbortSignal`, leaving the underlying promise unresolved even after V129 had isolated the venue from the other four exchanges.
- Both UnoCoin clients now enforce an independent whole-request deadline over fetch plus response parsing. The authenticated wallet call and public pair/ticker calls settle after at most `10,000 ms` even when the transport ignores abort; the controller is then aborted and the normal bounded retry/recovery cycle can continue.
- Added deterministic hanging-transport fixtures for authenticated and public UnoCoin reads. Backend build, frontend lint/build, focused UnoCoin and balance-isolation fixtures, and the complete deterministic suite passed `185/185`.
- The global footer no longer calls an otherwise healthy PAPER scanner `Execution Degraded` merely because no profitable opportunity exists. With all feeds connected and executable quotes present it shows `Execution Scanning`; a genuinely missing feed, zero executable data or a request error still shows `Degraded`/`No Data`.
- AWS rollback source files are under `/opt/cat-pro/backups/v130-unocoin-hard-deadline-20260818`. Rollback images are `cat-pro-backend:pre-v130-unocoin-deadline` and `cat-pro-frontend:pre-v130-unocoin-deadline`. Deployed images are backend `sha256:f52345363944b0a80572629ff762d9761f721fa9a8faf71ed85077276ad2d033` and frontend `sha256:dfd278ffcefc7c1e344b5e1a22741f0cb066a06406689cd699b7dc444b618515`.
- Production proved the hard deadline: an unavailable UnoCoin wallet read failed explicitly with `UnoCoin authenticated GET /api/wallet exceeded 10000 ms.` while the other four venues completed. A later cycle automatically recovered to `5/5` and synchronized all `143` balances, including `133` UnoCoin balances, in `562 ms`; the synchronization completion timestamp continued advancing instead of remaining frozen.
- UnoCoin public market data remained intermittently unavailable from the upstream API and correctly stayed disconnected with zero executable quotes during the final snapshot. This is an honest external-feed outage; CAT PRO now retries it without allowing an individual request to hang indefinitely.
- Strategy #1 policy remained `strategy-one-execution-policy-v2-exchange-minimum`, revision `2`, hash `e98db3bfc7bf56ed9e1cdfe37f6293bf833bc45c705e9545ab8dcc9245b041e5`. No opportunity, qualification, PAPER or Tiny-LIVE threshold changed.
- Post-deployment all four containers are running with restart count zero; backend, frontend and gateway are healthy. PAPER returned `READY_TO_EXECUTE_PAPER`/`WAITING_FOR_OPPORTUNITY` according to current economics, accumulated new credible settlements after restart, and hot-path state was `PASS` with market-update-to-decision P95/P99 `8/19 ms`, decision-to-queue P95/P99 `3/5 ms`, completion P99 `6 ms`, and zero dropped candidate snapshots.
- Runtime remains `paper` / `paper`, `LIVE_TRADING_ENABLED=false`, all LIVE/order confirmation values empty, Tiny-LIVE runtime gate false, no active arm, no authority and zero Tiny-LIVE attempts. Restart recovery remains `CLEAN` with zero findings or exposure.

## V131 futuristic notification chimes (2026-08-18)

- Replaced the single short sine beep with a lightweight three-note Web Audio chime. Success, information, warning and error notifications each use a distinct ascending or descending tonal pattern with a quiet harmonic shimmer and one short echo.
- Sound is generated only when a toast appears and notification sound is enabled. No audio asset, dependency, data request, backend code or trading-path work was added.
- Frontend lint and production builds passed locally and inside the AWS image; Nginx configuration validation passed before replacement.
- Rollback source files are under `/opt/cat-pro/backups/v131-futuristic-chimes-20260818`; rollback image is `cat-pro-frontend:pre-v131-futuristic-chimes`. Deployed frontend image: `sha256:c350cbcf98f6eb8fd8b0e1597c45e1f08701471d8e762cae30c8dcb58f24cc80`.
- Backend was not rebuilt or recreated. Backend, frontend and gateway are healthy with restart count zero; edge remains running. Runtime remains `paper` / `paper`, LIVE remains false and confirmation values remain empty.

## V132 opportunity-toast route deduplication (2026-08-18)

- Diagnosed repeated identical opportunity toasts as a frontend identity bug. Every scanner evaluation creates a new opportunity UUID, while the notification bridge remembered those UUIDs indefinitely; an unchanged market/BUY/SELL route was therefore treated as new on each two-second poll.
- Opportunity alerts now use the normalized `market | BUY venue | SELL venue` route as their transient identity. A continuously active EXECUTE route produces one toast, duplicate rows in the same scan cannot create another, and a route re-entering shortly after disappearance has a `30,000 ms` alert cooldown.
- When an EXECUTE route leaves the current accepted snapshot, its still-visible toast is dismissed on the next poll. This prevents an eight-second old alert from remaining beside a newer empty/fee-negative scanner table.
- Toast titles now say `PAPER opportunity` and include the exact Asia/Kolkata observation time, making clear that the alert is time-bound PAPER signal evidence rather than a LIVE order or durable market state.
- Removed the unbounded opportunity-UUID set and bounded inactive route-alert memory to ten minutes. No execution, strategy, fee, opportunity, cooldown, PAPER-accounting or LIVE policy changed.
- Frontend lint and local/AWS production builds passed; the built bundle and Nginx configuration were verified before deployment. Rollback source is `/opt/cat-pro/backups/v132-opportunity-toast-dedupe-20260818/NotificationEventBridge.tsx`; rollback image is `cat-pro-frontend:pre-v132-opportunity-toast-dedupe`. Deployed frontend image: `sha256:d1a14645d426ad728e82d5cbf9807036411a2aacd3718a99543d1a1b867d06a9`.
- Backend was not rebuilt or recreated. Backend, frontend and gateway are healthy with restart count zero; edge remains running. Runtime remains `paper` / `paper`, LIVE remains false and confirmation values remain empty.

## V133 adaptive executable-coverage optimizer (2026-08-18)

- Reused the existing dynamic coverage manager; no second bot, strategy, dashboard page, execution path or dependency was added. Scarce CoinSwitch/UnoCoin full-depth slots are now ranked using fresh quantity-bearing peer books, fee-adjusted edge when fee evidence exists, bounded executable notional and multi-exchange support instead of exchange-count plus alphabetical order alone.
- Target-venue ticker prices remain discovery-only. They can rank a bounded depth subscription but cannot become an executable quote, pass freshness/liquidity rules, create an opportunity, reserve capital or reach PAPER/LIVE execution.
- CoinSwitch keeps a `176`-market stable lane at the default `180` limit and rotates at most four exploration slots through a 48-market tail. Edge values are bucketed to suppress insignificant top-of-book reorder churn. Existing adapter availability validation, incremental reconciliation and genuine full-depth publication remain authoritative.
- Corrected the generic rotating-window pool calculation so pool size is relative to the stable boundary; large active limits now receive real bounded exploration instead of an accidentally empty pool.
- Local TypeScript build, focused ranking regression and the complete deterministic suite passed `185/185`. A synthetic 2,800-quote ranking benchmark averaged about `2.6 ms` per refresh; it runs in the 15-second background coverage cycle, not the execution hot path.
- AWS rollback source is `/opt/cat-pro/backups/v133-adaptive-coverage-20260818/source-before-v133.tgz`; rollback image is `cat-pro-backend:pre-v133-adaptive-coverage`. Deployed backend image: `sha256:b1db62f2247ac1f35847ce198ac18d68e3654c985dacfb601f2b84d0513c2ce7`.
- Early post-restart snapshots showed CoinSwitch full-depth coverage rotating as designed and reaching `151-160` active validated streams versus the earlier `139` snapshot. This is early operational evidence, not a guaranteed sustained coverage or trade-rate claim. UnoCoin remains independently limited by intermittent upstream 10-second timeouts and quarantine; the bounded optimizer does not hide or bypass those failures.
- Backend is healthy with restart count zero. PAPER is enabled and `READY_TO_EXECUTE_PAPER`; daily accounting was balanced at `663 attempts = 663 settlements = 663 credible`, with zero excluded in the verification snapshot. Hot path remained `PASS`: update-to-decision P95/P99 `10/12 ms`, decision-to-queue P95/P99 `4/5 ms`, candidate-to-start P95/P99 `4/5 ms`, completion P99 `8 ms`, pending `0`, dropped `0`.
- Strategy #1 policy is unchanged: `strategy-one-execution-policy-v2-exchange-minimum`, revision `2`, hash `e98db3bfc7bf56ed9e1cdfe37f6293bf833bc45c705e9545ab8dcc9245b041e5`. Runtime remains `paper` / `paper`, `LIVE_TRADING_ENABLED=false`, LIVE/order confirmations are empty, and Tiny-LIVE pre-arm/authority remain absent.

## V134 UnoCoin schema recovery and adaptive public-book pressure (2026-08-18)

- The recurring UnoCoin `Data offline / Auth unverified` state had two separate causes: intermittent upstream latency and a current public asset-order-book response-shape change. UnoCoin now returns direct `bids:[...]` / `asks:[...]` arrays on the active endpoint, while CAT PRO only accepted the older nested `bids:{data:[...]}` / `asks:{data:[...]}` shape. Valid depth was therefore being discarded as empty.
- `UnoCoinPublicApi` now accepts both current direct-array and legacy nested-array response shapes. No ticker is promoted to executable: a market still requires genuine non-empty two-sided quantity-bearing depth and the existing normalization/order-book integrity checks.
- Primary and recovery public order-book sources now share one total `10,000 ms` request deadline instead of each consuming a full deadline. A failed market can no longer occupy a worker for roughly `20,000 ms`.
- Public-book polling starts conservatively at three markets and one concurrent read. True timeout/network/HTTP failures reduce the active market/concurrency budget and add bounded exponential backoff; healthy batches ramp gradually. A responsive market with absent/invalid two-sided depth remains a per-market rejection/quarantine and does not globally throttle the entire UnoCoin adapter.
- Local TypeScript build, focused direct-array/legacy-array/deadline/recovery tests and the complete deterministic suite passed `185/185`. Real exchange API and confirmation-sensitive order tests remain excluded from the deterministic suite.
- AWS rollback source: `/opt/cat-pro/backups/v134-unocoin-adaptive-backpressure-20260818/source-before-v134.tgz`; rollback image tag: `cat-pro-backend:pre-v134-unocoin-backpressure`. Deployed backend image: `sha256:74d346a941b4b19a52083bc944ae3b550bfdf895b76f4385401ee410f800978f`.
- Post-deployment production evidence is truthful `5/5` market-data connected and `5/5` authenticated read verified. UnoCoin had `10` fresh executable books, including `5` shared fresh executable markets with CoinDCX; legitimately one-sided/empty markets remained rejected. This is a current snapshot, not a guaranteed future availability or trade-rate claim.
- PAPER remained enabled and effective. Verification accounting was balanced at `691 attempts = 691 settlements = 691 credible`, with zero credibility exclusions and zero unlinked attempts. Hot path settled to `PASS`: market-update-to-decision P95/P99 `10/36 ms`, decision-to-queue P95/P99 `4/5 ms`, candidate-to-start P95/P99 `4/5 ms`, completion P99 `7 ms`, pending `0`, dropped `0`.
- Strategy #1 policy remains `strategy-one-execution-policy-v2-exchange-minimum`, revision `2`, hash `e98db3bfc7bf56ed9e1cdfe37f6293bf833bc45c705e9545ab8dcc9245b041e5`. Runtime remains `paper` / `paper`, `LIVE_TRADING_ENABLED=false`, all LIVE/order confirmation variables are absent, Tiny-LIVE runtime gate is false, active pre-arm is null, blocking authority is absent and attempts today are zero.

## V135 recoverable PAPER TDS capital lock (2026-08-18)

- Reused the existing Section 194S PAPER withholding evidence; no second tax module, bot, strategy, page or execution path was added. The accounting gap was that stored settlements reported `tdsWithheld` and `deployableCashProfit`, but the authoritative trading account still made the withheld amount immediately reusable.
- Strategy #1 PAPER settlement accounting now commits economic net P&L and modeled TDS in one append-only, restart-safe transaction. Economic equity receives the fee-adjusted net P&L; spendable `availableCapital` receives `netProfit - tdsWithheld`; the difference is carried separately as `paperTdsReceivable`.
- TDS is explicitly a recoverable PAPER cash lock, not an exchange fee or permanent economic loss. There is no automatic refund/re-credit path: a lower reconstructed history total cannot release capital, and no LIVE tax credit is claimed without future independently reconciled evidence.
- Startup replays pending settlement accounting first, then performs a one-way reconciliation against persisted closed PAPER settlements. This avoids double-booking after a crash while migrating pre-V135 TDS evidence without deleting or rewriting trade history.
- The BOT Capital view now shows authoritative `TDS receivable` separately from PAPER equity and labels the historical settlement aggregate `Modeled TDS total`. The API exposes the same receivable in the PAPER account and Personal Capital Manager truth model.
- Regression coverage proves economic-equity preservation, cash locking, transaction replay idempotency, restart persistence, one-way historical migration and explicit PAPER-reset clearing. Backend/frontend builds passed and the complete deterministic suite passed `185/185`; real exchange API and confirmation-sensitive order tests remain excluded.
- AWS rollback source: `/opt/cat-pro/backups/v135-paper-tds-capital-lock-20260818/source-before-v135.tgz`. Rollback images: `cat-pro-backend:pre-v135-paper-tds` and `cat-pro-frontend:pre-v135-paper-tds`. Deployed images are backend `sha256:8f987b7d6fa0882641d17594bd4d03976abfb59a1fc1e05aed21111ad3a07616` and frontend `sha256:561e13c50d99642060cf46b63e225b00e6ae2a457e5f13e5ea8f6cbd1cf87bfb`.
- Production migration reconciled `₹47,612.38158640159` of persisted modeled withholding. PAPER economic equity remained `₹2,34,623.02813897276`; spendable PAPER capital became `₹1,87,010.64655257115`. Accounting was open for new execution with zero pending records and zero replay failures.
- Backend, frontend and gateway were healthy with restart count zero; the five-exchange fleet was `5/5` market-data connected and `5/5` authenticated read verified. PAPER execution remained effective. Strategy #1 policy ID/revision/hash were unchanged, `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`, LIVE confirmation was empty, and Tiny-LIVE had no active pre-arm or blocking authority.
- Immediate post-restart code-side latency showed all queue/start/completion/drop gates passing, but update-to-decision P99 was `60 ms` versus the `40 ms` target (P50/P95 `2/10 ms`) under current high update load. This is recorded as a truthful `MISS`; the TDS settlement code is outside the scanner hot path and no speed claim is made from this snapshot.

## V136 executable net-edge qualification (2026-08-18)

- Strategy #1 qualification now requires exact full-depth execution economics at the INR-sized reference capital. A legacy liquidity score remains diagnostic evidence only and can no longer bypass a failed two-leg simulation, exchange quantity/min-notional rule, common order-quantity normalization or post-stress profitability gate.
- The mandatory gate resolves the exact latest opportunity generation, requires `100%` two-leg fill, positive modeled net profit of at least `0.3%`, an `EXECUTE` recommendation, both current venue capabilities, real-order-safe common quantity evidence and a passing current-book stress result after fees, depth VWAP, adverse-move reserve and safety buffer. No threshold was lowered.
- Capital-sensitivity diagnostics now correctly interpret every displayed amount as INR and convert it to the route quote asset before simulation. The old diagnostic path could label `₹100` while simulating `100 USDT`; this did not affect the central automated PAPER execution path, but its report was materially wrong and is now corrected.
- SHADOW dispatch now reuses the immutable qualified snapshot only when the active monitored candidate still has the exact opportunity ID, first-seen time and reappearance generation. This removes one redundant same-generation full simulation while preserving the independent funded/stress last-look in PAPER execution.
- Official/current market-rule review confirmed that venue fees and symbol filters are account/market specific. Production diagnostics now demonstrate the intended distinction: a COTIUSDT raw/fee-positive route can still be rejected at `₹500` when shared quantity rounding leaves the Binance leg below minimum notional, while a later safely sized route can proceed.
- Local backend build, the focused executable-qualification regression, unified-orchestrator regression and complete deterministic suite passed `186/186`. Frontend lint/build and the architecture check also passed. The AWS runtime image deliberately excludes the new local-only regression fixture; the image TypeScript build passed against the production source surface.
- Sanitized local artifact: `.deploy/cat-pro-v136-executable-net-edge-20260818.tgz`, SHA-256 `4ADEF14A1F9B520FE0B8A68BF5B968A1B38E19AF3D2DDC61A4B63F754A510E6A`. It contains no environment, credential, balance, log, history, dependency, frontend or compiled-output file. AWS effective runtime deployment includes only the five V136 runtime/model files; existing source tests remain non-runtime.
- AWS rollback source is `/opt/cat-pro/backups/v136-executable-net-edge-20260818/source-before-v136.tgz`; rollback image is `cat-pro-backend:pre-v136-executable-net-edge`. Deployed backend image: `sha256:eb2ac454347ed64ebdfdf0125a18c1f32092e5d91bc668093c5341ec3db1162a`.
- Post-deployment backend/frontend/gateway are healthy with restart count zero, all five market-data services are connected, and PAPER is `PAPER_ACTIVE` with effective execution enabled. The controller confirmed two immediate COTIUSDT CoinDCX→Binance PAPER executions; their final modeled post-stress nets were `0.4197%` and `0.3177%`. These are PAPER observations, not LIVE fills or guaranteed profit.
- Hot path returned to `PASS`: market-update-to-decision P50/P95/P99 `3/8/14 ms`, decision-to-queue P95/P99 `3/4 ms`, candidate-to-execution-start P95/P99 `4/5 ms`, completion P99 `5 ms`, pending snapshots `0` and dropped candidate snapshots `0`.
- Daily PAPER accounting was balanced at `731 attempts = 731 settlements = 731 credible`, with zero excluded or unlinked attempts in the verification snapshot. Recovery is `CLEAN`; Tiny-LIVE runtime gate is false, active pre-arm is null, blocking authority is absent and attempts today are zero. Runtime remains `paper` / `paper`, `LIVE_TRADING_ENABLED=false`, and order submission remains disabled.
- Because V136 materially changed the qualification/execution-admission evidence path, the clean 14-day PAPER observation window restarts at `2026-08-18 22:54:23 IST` and ends at `2026-09-01 22:54:23 IST`. The existing read-only heartbeat monitor was updated to this window; it must not enable LIVE.

## V137 frontend interaction performance (2026-08-19)

- The sidebar slowdown was traced to the browser display path, not the Strategy #1 execution engine. The global Socket.IO listener committed every individual ticker to Zustand, and the Markets route then re-filtered, re-sorted and rendered all approximately `2,344` merged rows for each store update.
- Live ticker display writes are now latest-only batches with a `100 ms` maximum UI flush cadence. This bounds browser store commits to at most ten per second while retaining the latest timestamped quote for every exchange/market. The backend scanner, opportunity engine and execution timing path are not delayed or changed by this display-only buffer.
- The Markets table now virtualizes its body with fixed-height rows and overscan, so a normal viewport renders roughly `25-35` rows instead of thousands. Unchanged visible rows are memoized and ticker timestamps no longer force price-cell DOM remounts. Search, favorites, exchange filtering, sorting and the complete merged-row count remain intact.
- Sidebar navigation is scheduled as a React transition. Markets freshness diagnostics now abort their request on route exit and poll every `10 s` instead of `3 s`; the six-request Exchange Health evidence composite polls every `15 s` instead of `5 s`. Manual refresh remains available, and real-time market Socket.IO data remains live.
- Frontend lint and local/AWS production builds passed. Sanitized artifact: `.deploy/cat-pro-v137-ui-performance-20260819.tgz`, SHA-256 `9B803A69EE403989B928855B8DDFC02DB2808AD7570AF168D6BF9AF8249F7728`. AWS rollback source: `/opt/cat-pro/backups/v137-ui-performance-20260819/source-before-v137.tgz`; rollback image: `cat-pro-frontend:pre-v137-ui-performance`; deployed frontend image: `sha256:1b4ec3ad71653fca1c712f977e792ca88c14d15d76da98e5f4c22ce707313731`.
- Deployment replaced only `cat-pro-frontend`. Backend image remained `sha256:eb2ac454347ed64ebdfdf0125a18c1f32092e5d91bc668093c5341ec3db1162a`, healthy with restart count zero; gateway and edge were unchanged. `/markets` and `/bot` both returned HTTP `200`.
- Post-deployment truth was PAPER account/orchestrator mode with effective PAPER execution enabled. Daily accounting was balanced at `21 attempts = 21 settlements = 21 credible`, zero excluded. Code-side hot path remained `PASS` at update-to-decision P95/P99 `10/24 ms`, pending snapshots `0`, dropped candidates `0`. Runtime stayed `paper` / `paper`, `LIVE_TRADING_ENABLED=false`, LIVE/order confirmations blank, and report safety kept LIVE execution/order submission false.
- V137 is frontend/control-plane only, so it does not restart or invalidate the clean V136 PAPER observation window: `2026-08-18 22:54:23 IST` through `2026-09-01 22:54:23 IST`.

## V162-V164 ZebPay PAPER extension and fail-closed lifecycle foundation (2026-08-21)

- V162 upgraded ZebPay from price-only observation to a bounded genuine-depth lane. The adapter now intersects venue availability before applying the 24-market cap, bootstraps official REST books, consumes the official public WebSocket, scales WebSocket atomic quantities using authoritative base precision and publishes only two-sided positive quantity-bearing books as executable.
- Production probing caught and fixed two real integration bugs before completion: the official socket identifies books through `requestType` rather than `pair`, and ZebPay market keys initially retained separators while the scanner hot path assumes canonical keys. A third coverage bug capped globally ranked peer symbols before ZebPay availability was applied. The final implementation parses the live payload, uses canonical keys and filters available markets before capping.
- Final production evidence: ZebPay public adapter connected with `83` observed Spot markets; the bounded lane requested `15` currently shared markets; after the first official JSON heartbeat the socket remained connected with `reconnects=0`, `449` messages, `86` accepted genuine book messages and `10` active quantity-bearing executable INR markets. This is a point-in-time market-data proof, not a guaranteed sustained market count or profitable opportunity.
- V162 also synchronizes exact ZebPay Spot rules from the official trade-pair catalog and authenticated side-aware account fees into the central capability/fee engines. Production held `443` synchronized ZebPay capabilities and fresh verified authenticated reads. TDS evidence stays separate from trading fees and is never used to inflate economic profit.
- V163 extends normal PAPER qualification to ZebPay only when the existing central freshness, depth, common-quantity, exact-rule, side-aware fee, capital, stress and net-profit gates all pass. ZebPay native-unit wallet evidence joins the isolated balance synchronizer; production synchronized `400` ZebPay wallet entries and all six balance reads completed without unresolved exchanges. ZebPay PAPER settlements use the existing India VDA withholding cash-lock model; PAPER and LIVE histories remain separate.
- V164 adds a deliberately unreachable Spot GTC limit-order lifecycle foundation: signed create/read/cancel primitives, a PREPARED-before-I/O append-only journal, no submission retry and durable duplicate/ambiguous-ID blocking. The adapter requires the complete global LIVE gate plus two ZebPay-specific mutation confirmations, remains unregistered from production dispatch and cannot submit, cancel, transfer or withdraw. It must not be registered until authenticated private order/fill evidence and the central Strategy #1 venue contract are independently proven.
- Current runtime truth after deployment: authoritative trading account is `PAPER`, PAPER automation is enabled, emergency stop is false, active Tiny-LIVE arm is null, active account-mode lease is null and blocking action authority is null. The host's pre-existing global LIVE environment confirmations remain enabled and were not changed by this build; the PAPER account gate plus absent arm/lease/authority and unregistered ZebPay adapter prevent a ZebPay LIVE order.
- The public heartbeat and shutdown frames now follow the official JSON protocol (`{"request":"PING"}` / `{"request":"STOP"}`); the previous raw strings caused avoidable reconnect churn. No scanner timer, opportunity threshold or execution gate changed.
- Local backend build, focused V162/V163/V164 regressions and the complete deterministic suite passed `198/198` after the final heartbeat fix. Real exchange order submission and confirmation-sensitive tests remain excluded. Final code-side latency snapshot: market-update-to-decision P50/P95/P99 `2/7/11 ms`; evaluation P50/P95/P99 `0.856/5.856/6.19 ms`; no new fatal, uncaught, unhandled or ZebPay failure log was found.
- Sanitized artifact: `.deploy/cat-pro-v162-v164-zebpay-paper-lifecycle-20260821.tgz`, SHA-256 `F294BAA898CE4EE455E7913506146B1ABF3E8996DB54BED29350F7A756842423`. Rollback source: `/opt/cat-pro/backups/v162-v164-zebpay-paper-lifecycle-20260821/source-before-v162.tgz`; rollback image: `cat-pro-backend:pre-v162-v164`. Deployed backend image: `sha256:fe9c218c7b7ac3c67a747210b60bae29628852c092c29852b079bb2f21007dfe`; backend restart count `0`, health `healthy`.

## V182 bounded ten-attempt Tiny-LIVE batch (2026-08-21)

- The existing Strategy #1 Tiny-LIVE control was extended from one/two attempts to a restart-safe maximum of ten sequential attempts. It is still bound to one exact audited route per arm; it does not switch coins or venues inside an active batch.
- Schema `182.0` owns the ten-attempt pre-arm journal and schema `182.1` owns its account-mode lease. Attempts are durably numbered `1..10`; a failed, partial, exposed or unknown result stops the remaining batch. Automatic retry, transfer and withdrawal remain unavailable.
- Ten attempts require a current `CONTINUOUS_TINY_LIVE` timing calibration backed by authenticated private-fill timing evidence. The arm request remains bounded to the existing `₹500` per-leg hard cap and at most `180` requested minutes; an earlier calibration expiry can shorten the effective window.
- The action-authority daily hard cap and pre-arm maximum are both `10`. The BOT control renders ten-slot state and the exact per-attempt evidence without merging PAPER and LIVE accounting.
- Local backend/frontend builds and frontend lint passed. Focused ten-attempt authority and account-mode lease tests passed, and the complete deterministic suite passed `203/203`. Real exchange API and confirmation-sensitive order tests remain excluded.
- Sanitized artifact: `.deploy/cat-pro-v182-ten-slot-tiny-live-20260821.tgz`, SHA-256 `08F916D6782FCD5521FF1FE91690394D15F0015F5FE5F8B762FADB3809026935`. Rollback source: `/opt/cat-pro/backups/v182-ten-slot-20260821/source-before-v182.tgz`; rollback images: `cat-pro-backend:pre-v182-ten-slot` and `cat-pro-frontend:pre-v182-ten-slot`.
- Deployed images: backend `sha256:eebf563f40f7f3c9a6ddbf87c63623e767502c42f3ae76501e003c2238833e48`; frontend `sha256:7122ff785932e15fd1838df5619e049dd81799aa9f44346501f73a3eb02cf4ee`. Backend, frontend and gateway are healthy with restart count zero; edge is running with restart count zero; internal `/` and `/bot` return HTTP `200`.
- Deployment safety note: the first backend recreation accidentally used the Tiny-LIVE compose overlay and briefly exposed `live/live` environment flags. It was detected before any arm, lease or action authority existed; Tiny-LIVE attempts remained `0`. The backend was immediately recreated with the PAPER overlay. Final authoritative state is `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`, runtime gate false, account mode `PAPER`, active arm `null`, active lease `null`, blocking authority false and attempts today `0`.
- This deployment does not activate the ten-trade batch. A later real batch still requires an exact eligible route, current continuous timing approval, PAPER pause, explicit arm confirmation and an exact account-mode lease activation. PAPER evidence remains separate and is not LIVE-profit proof.

## V184 pilot-basket timing evidence separation (2026-08-21)

- Root cause: route timing was collected only from already accepted `EXECUTE` opportunities. A healthy executable BUY/SELL book pair with zero or negative current economics therefore remained `NO DATA`, especially for the reverse BB, HEMI and NEXO pilot directions. That made the seven-coin/eleven-route Tiny-LIVE timing review incomplete even though the scanner had genuine books.
- `OpportunityService` now captures a bounded maximum of eleven timestamp-only observations from the immutable pilot-route list whenever both exact venue books are executable. This capture happens before the positive-spread filter and is independent from opportunity economics. It cannot create a candidate, profit, PAPER settlement, LIVE signal, authority or order.
- `StrategyOneExecutionTimingEvidenceService` and `StrategyOnePilotEquivalentPaperEvidenceService` consume the timestamp-only route observations for freshness and code-side timing. Accepted opportunities remain the only economics owner. Route-generation deduplication prevents a book/opportunity pair from being counted twice, and persisted state remains backward-compatible.
- No fee, TDS, net-profit, freshness, headroom, sample-count, duration, route, inventory, capital or order-policy threshold changed. No history/evidence reset was performed. The clean HFT PAPER V2 observation window therefore remains `2026-08-19 16:16:18 IST` through `2026-09-02 16:16:18 IST`.
- Local backend build, focused timing/evidence regressions and the complete deterministic suite passed `206/206`. The focused tests also passed inside the AWS-built image. Sanitized runtime artifact: `.deploy/cat-pro-pilot-route-timing-evidence-20260821.tgz`, SHA-256 `AFFC5666B3A87F004B88FE612822DD95AD2DEF54EFAE94505818FFB439D20D47`.
- AWS rollback source is `/opt/cat-pro/backups/pilot-route-timing-20260821/source-before.tgz`; rollback image is `cat-pro-backend:pre-pilot-route-timing-20260821`. Deployed backend image is `sha256:5dd104f4eec846e00f6e8eed10862f85cb9828ccf2a5b076e32571e1a5136314`. All four deployed runtime-file SHA-256 values match the local source exactly.
- Production proof after deployment: COTI CoinDCX→Binance remained timing `READY`; BB CoinDCX→Binance, Binance→CoinDCX and Bybit→CoinDCX immediately began accumulating genuine dispatch-reserved route generations instead of `NO DATA`; HEMI reverse, both NEXO routes, PYBOBO and GPS also produced route-specific timing when both executable books existed. TREE remained genuine `NO DATA` because no simultaneous executable route-book observation existed in the verification window. Remaining blocks are real sample-span/maturity, private-fill timing or measured headroom blocks and are not bypassed.
- Final safety/accounting verification: backend/frontend/gateway healthy with restart count zero, edge running; `TRADING_MODE=paper`, `TRADING_EXECUTION_MODE=paper`, `LIVE_TRADING_ENABLED=false`; controller `PAPER_ONLY`, order submission false, effective PAPER true; account mode `PAPER`; no active arm, lease or blocking authority. Daily accounting was balanced at `2,945 attempts = 2,945 settlements`, with `2,943` credible and `2` excluded settlements.
- The final 512-sample code-side snapshot was mixed: scan evaluation P50/P95/P99 was `1.2/6.978/8.579 ms`; queue/start/completion/drop gates passed, pending snapshots were zero and dropped candidates were zero. Market-update-to-decision P99 was `61 ms` versus the `40 ms` target, so the overall hot path truthfully remained `MISS` despite a `2 ms` P50 and `8 ms` P95. No threshold was relaxed and no blanket lightning-speed claim is made.
- Deployment safety correction: preserving the old Tiny-LIVE compose overlay was rejected during deployment. The backend was deliberately recreated with the PAPER overlay. This changed the environment from the unsafe stale `live/live/true` flags to authoritative `paper/paper/false`; no arm, lease, authority or order existed during the correction.

## V185-V186 event-loop latency cleanup (2026-08-22)

- The remaining latency miss was traced to two control-plane allocation paths rather than Strategy #1 economics. The dynamic discovery runner deep-cloned and deep-froze the same immutable snapshot once for storage, once per listener and once again for each read. It now creates one frozen snapshot per refresh and safely shares that exact immutable reference with listeners and readers.
- The larger production stall came from the BOT composite report. Its daily reservation audit rescanned the complete append-only trading-account ledger on every five-second dashboard poll. Production had `51,265` ledger records and the internal `/api/strategies/personal-bot` request took roughly `280-370 ms` before the fix.
- `TradingAccountLedgerService` now maintains an append-time Asia/Kolkata day index from the same validated durable entries. Daily reservation attempts read only the selected IST day's entries and cache an immutable result until that day's ledger length changes. New mutations, restart restore and explicit PAPER history replacement all update or invalidate the index deterministically; accounting meaning and the append-only ledger are unchanged.
- After deployment, the same BOT endpoint settled to roughly `70 ms` warm (`250 ms` first post-restart call, then `140/120/70/70 ms`). This is a measured control-plane improvement, not a promise of exchange/network latency.
- Two later 512-sample production windows independently passed every configured hot-path gate. Window 1: update-to-decision P50/P95/P99 `2/9/17 ms`, queue P99 `6 ms`, start P99 `6 ms`, completion P99 `7 ms`, dropped candidates `0`. Window 2: update-to-decision `2/9/14 ms`, queue/start P99 `6 ms`, completion P99 `7 ms`, dropped candidates `0`. One isolated completion maximum was `1,133 ms`; it is retained here rather than hidden, while the rolling completion P99 still passed.
- Local TypeScript build, focused discovery and ledger regressions, and the complete deterministic suite passed `206/206`. The focused trading-account regression also passed inside the deployed image.
- V185 artifact: `.deploy/cat-pro-discovery-fanout-v185.tgz`, SHA-256 `3F6D4A101B9D4BEE2F57AC95BF26F18366E8AE87DE5CB126ABCC8240BBFC7F59`; rollback source `/opt/cat-pro/.deploy/backups/v185-20260822`. V186 artifact: `.deploy/cat-pro-ledger-day-index-v186.tgz`, SHA-256 `9DE7D48A213D2A389EEA9FAA7AE72FCC02D8B809493EBBF91849043039B461AC`; rollback source `/opt/cat-pro/.deploy/backups/v186-20260822`. Final backend image: `sha256:599fa71b086236ff6914f5fc1cd2f64d2719c02c757661d7397ed904094c0fe5`.
- Final deployment truth: backend, frontend and gateway are healthy with restart count zero; edge is running with restart count zero. Runtime is `paper` / `paper`, `LIVE_TRADING_ENABLED=false`; controller is `PAPER_ONLY`, effective PAPER execution is enabled, LIVE execution and order submission are false. Active Tiny-LIVE arm, account-mode lease and action authority are all null. Daily accounting was balanced at `112 attempts = 112 settlements = 112 credible`, with zero excluded, dry-run or unlinked attempts in the verification snapshot.
- No opportunity, fee, TDS, profit, freshness, timing-headroom, capital, route, PAPER, Tiny-LIVE or LIVE/order threshold was changed. No evidence/history was deleted or reset, and no order, transfer or withdrawal was submitted by this build.

## V187.1 controlled pilot timing profile (2026-08-22)

- Strategy #1's route-calibration dispatch reserve and required measured operational headroom were changed from `10 ms + 10 ms` to a fixed, code-owned `5 ms + 5 ms` controlled pilot profile. The absolute book-age ceiling remains `250 ms`, the action-time BUY/SELL cohort remains `<=190 ms`, and maximum timestamp skew remains `250 ms`.
- The post-cost/stress minimum net-profit gate remains `0.30%`. Fees, TDS cash-lock accounting, liquidity, inventory, exact order rules, last-look validation, partial/exposed/unknown stop policy, capital and route allow-list were not relaxed.
- A regression proves that exactly `5 ms` residual headroom is admissible while `4 ms` remains blocked. Timing approvals are now bound to policy revision `STRATEGY_ONE_CONTROLLED_PILOT_5MS_V1`; older approvals remain in immutable audit history but cannot be approved or reused under the new profile.
- Local build, focused timing/preflight/authority/action-time regressions and the complete deterministic suite passed `206/206`. The final AWS image also passed isolated timing-calibration, action-authority and basket-pre-arm regressions before replacement.
- Final artifact: `.deploy/cat-pro-v1871-controlled-pilot-timing-20260822.tgz`, SHA-256 `12DF7B0D87DB58D32299032DE79F209D2212AC869DA21FF4E127B29CB0C92E64`. Final rollback source: `/opt/cat-pro/.deploy/backups/v1871-controlled-pilot-timing-20260822/source-before.tgz`; rollback image: `cat-pro-backend:pre-v1871-controlled-pilot-timing`. Final backend image: `sha256:ee0564b323ea3dff7647788b98d61600ce444c7e0afc87cbd1be36fc8e25e676`.
- Post-deployment snapshot: backend healthy with restart count `0`; `paper/paper`, `LIVE_TRADING_ENABLED=false`; effective PAPER execution enabled; account mode `PAPER`; active Tiny-LIVE arm and account lease `null`; blocking action authority false; Tiny-LIVE attempts today `0`; LIVE execution and order submission false.
- The first final route snapshot showed `10/11` pilot routes timing-ready. COTI CoinDCX→Binance was exactly at the new `5 ms` residual boundary; TREE Bybit→CoinDCX remained blocked for genuine sample maturity, not headroom. No proposal, approval, arm, lease, authority, order, transfer, withdrawal, balance mutation or evidence/history reset was performed by this deployment.

## V188 exact-route action-time refresh and current-state UI (2026-08-22)

- Root cause of the armed pilot's repeated `ACTION_TIME_BOOK_REFRESH` blocks was a same-action race: after CoinDCX and Binance public books refreshed successfully in parallel, the fallback launched a full approximately 675-market opportunity rescan and then searched the latest global snapshot. The exact refreshed route could disappear or be superseded before the action-time decision, leaving only the generic `exact profitable EXECUTE route did not survive re-evaluation` message.
- The fallback now evaluates only the exact refreshed BUY/SELL route against the same central `OpportunityEngine`, fee/depth/rule/net-profit policy and immutable opportunity authority store. It requires both quotes to be newer than their completed REST refreshes. No profit, fee, TDS, freshness, book-age, skew, timing-headroom, capital, inventory or order threshold changed.
- A blocked refresh now records the exact rejection code/reason plus refreshed BUY ask, SELL bid and raw spread. Accepted exact-route results remain resolvable by immutable opportunity ID for the unchanged downstream preflight/authority path. No global scan, fabricated candidate or bypass was introduced.
- The BOT Tiny-LIVE audit now leads with current qualified routes, selected route and the first current blocker. Large historical discovery/dispatch counters are collapsed by default and explicitly labelled as historical observations, not attempts, orders, fills or profit. Timing cards say `TIMING READY/BLOCKED` to avoid implying execution readiness.
- Local TypeScript/frontend production builds, frontend lint, focused action-time regressions and the complete deterministic suite passed `206/206`. The focused regression passed again inside the AWS-built backend image; the frontend V188 marker was verified inside the built image.
- Sanitized artifact: `.deploy/cat-pro-v188-exact-route-refresh-ui-20260822.tgz`, SHA-256 `ACE6E358948BCF3B1CC1CB13F695A09BD884228D1275DC85A3AD6E059E54FF97`. AWS rollback source: `/opt/cat-pro/.deploy/backups/v188-exact-route-refresh-20260822/source-before.tgz`; rollback images: `cat-pro-backend:pre-v188-exact-route-refresh` and `cat-pro-frontend:pre-v188-exact-route-refresh`.
- Deployed backend image: `sha256:abc407753e6f5638ee0dff2ecbbb2db20766c366b3389bacf7c77731d87b8db5`; frontend image: `sha256:5a86c174b4b0a0c3d0d55067c9963b68b2900ae7bdf8d1faf98e2148f778652d`. Backend/frontend/gateway are healthy with restart count zero; edge is running with restart count zero; internal `/` and `/bot` return HTTP `200`.
- Post-deployment safety truth is `paper/paper`, `LIVE_TRADING_ENABLED=false`, account mode `PAPER`, active arm `null`, active account lease `null`, blocking action authority false and Tiny-LIVE attempts today `0`. PAPER automation was then explicitly paused to prepare operator review; no order or LIVE authority was created.
- Fresh post-fix COTIUSDT CoinDCX→Binance timing proposal `timing-5831df83558edd38c316482b23bba0c8` is `PROPOSED` with scope `BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH`, but it was intentionally not used after the operator clarified that the pilot must remain the full seven-coin basket. It grants no order authority.
