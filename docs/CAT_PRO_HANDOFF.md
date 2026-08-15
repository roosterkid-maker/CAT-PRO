# CAT PRO Persistent Handoff

Last updated: 2026-08-15 (Asia/Kolkata)

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

## Planned Personal Capital Manager

- After LIVE evidence is established, build a Personal Capital Manager for the same five exchanges.
- It will track verified balances, target allocation, inventory deficits/surpluses, realized profit, operating reserve, TDS/tax reserve and safely withdrawable profit.
- Authority must progress through `ADVISORY_ONLY`, `MANUAL_APPROVAL`, capped/allowlisted auto-rebalancing and `EMERGENCY_FREEZE` modes.
- Automatic bank withdrawal is prohibited. The manager may recommend a withdrawal, but the operator must explicitly approve it with the exchange's authentication/2FA.
- Missing/stale balance evidence must remain `NO_DATA`, never zero.
- Exchange-to-exchange rebalancing must use supported, compliant rails, address allowlists, network/tag validation, test transfers, limits, idempotency and destination reconciliation.
- A detailed copy/paste build prompt for this manager was provided in the conversation on 2026-08-15.

## Capital sizing principle

- Current PAPER defaults are `₹100,000` budget, `₹100` minimum/trade, `₹1,000` maximum/trade, `₹100` step and `₹3,000` maximum batch capital, unless runtime operator settings override them.
- PAPER allocation is adaptive within the configured bounds and considers available capital, candidate quality, route history, execution simulation, exchange exposure and batch headroom.
- Actual route quantity is further capped by two-leg depth, both balances, fees and exchange order rules.
- Increasing total capital does not automatically raise the per-trade safety ceiling.
- Future LIVE sizing must remain the minimum of operator cap, available capital, route depth, both funded balances, exposure limits, TDS headroom and optimizer output.

## Next focused work

1. Keep Strategy #1 PAPER and the V96 rolling collector running continuously while earlier unhealthy observations age naturally out of the 24-hour window; never lower the 99% threshold or fabricate evidence.
2. Re-check the rolling ratios and exact failure reasons periodically. Fix only a newly recurring real feed/rule failure; unchanged historical failures are a time-based evidence wait, not a code bug.
3. Continue waiting for V92 to find an exact fresh-current plus durable-history route match; never fund from historical rank alone.
4. After rolling readiness passes and V92 reports `READY_FOR_OPERATOR_PREFLIGHT`, review the current route, both exact balance requirements, fees/rules/depth and all four checks before explicitly running the read-only ₹100 preflight.
5. Do not change account mode or enable LIVE/order submission automatically. The first Tiny-LIVE attempt requires a new explicit operator decision at action time and must remain within the approved ₹100 tier.
6. After any explicitly authorized real attempt, record real adapter/reconciliation metrics. Execution health must pass before any additional tier or scale increase; PAPER/dry-run evidence cannot substitute for it.
7. Preserve the two current non-critical alerts until their underlying evidence genuinely changes, and keep verifying that the resolved clock-alert occurrence counts remain stable across planned restarts.

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
