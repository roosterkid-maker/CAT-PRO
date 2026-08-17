# CAT PRO architecture

This document defines the runtime ownership boundaries for the authoritative
root workspace. New code must follow these boundaries instead of creating a
second implementation tree.

## Runtime entrypoints and ports

| Environment | Browser entrypoint | Backend listener | Ownership |
| --- | --- | --- | --- |
| Local development | `http://127.0.0.1:5173` | `127.0.0.1:5000` | Vite proxies `/api` and `/socket.io` to the backend |
| Compose/VPS | `127.0.0.1:8080` gateway | container-only `backend:5000` | Nginx routes frontend, API, and Socket.IO traffic |

Port `8081` is not part of CAT PRO. In local development the browser must not
call port `5000` directly; the same-origin Vite proxy owns that connection. In
production, port `5000` is internal and must never be published.

The backend host is explicit: local development defaults
`CAT_PRO_BACKEND_HOST=127.0.0.1`; Compose overrides it to `0.0.0.0` only inside
the private container network so the gateway can reach it.

`backend/src/server.ts` is the only backend application entrypoint.

## Backend module ownership

| Module | Owns | Must not own |
| --- | --- | --- |
| `strategies` | eight strategy controllers, immutable signals/plans, shared central PAPER admission/worker/accounting, historical research evidence | exchange-order authority or a second execution system |
| `automation` | cross-cutting scheduler, qualification, queues, SHADOW/PAPER dispatch infrastructure, readiness and diagnostics | duplicate strategy controllers or strategy-specific implementation trees |
| `workflows` | use-case orchestration that connects one strategy to generic automation and guarded trading services | a second strategy controller or a bypass around safety gates |
| `analytics` | cross-module read models and evidence-backed reporting | trading mutation or execution authorization |
| `trading` | PAPER plans, lifecycle, journal, inventory ledger and accounting | strategy discovery or registry metadata |
| `execution/live` | one fail-closed central LIVE admission/journal/queue/dispatcher, five exact multi-leg lifecycle owners, exchange adapters, fill/fee evidence, recovery, reconciliation and settlement | automatic authorization to submit real orders |
| `exchanges` | public/authenticated exchange integrations and market rules | strategy policy |

The eight registered trading strategies live only under `backend/src/strategies`:

- `cross-exchange-arbitrage`
- `cross-exchange-market-making`
- `triangular-arbitrage`
- `spot-perpetual-basis-arbitrage`
- `funding-rate-arbitrage`
- `perpetual-perpetual-arbitrage`
- `dynamic-market-making`
- `statistical-arbitrage`

`backend/src/strategies/config/ActualStrategyCatalog.ts` is the canonical
identity, numbering, directory, PAPER-path and derivative-evidence manifest.
The runtime registry and the unified readiness board are checked against that
manifest; duplicate registry IDs or strategy numbers fail closed.

`hedge-inventory-management` is a shared recovery capability, not a ninth strategy. `backend/src/discovery` is shared market-universe/opportunity discovery, not a trading strategy.

The Strategy #1 integration runtime lives under
`workflows/cross-exchange-arbitrage`. It composes the pure strategy boundary,
generic automation infrastructure, and guarded PAPER accounting without
putting execution dependencies inside `strategies` or duplicating controllers
inside `automation`.

## Central execution ownership

Strategy #1 retains its proven unified two-leg owner under `workflows/cross-exchange-arbitrage`. Strategies #2-#8 compile to the same central plan model and use exactly five lifecycle patterns:

| Pattern | Strategies | Lifecycle owner |
| --- | --- | --- |
| `PASSIVE_MAKER_THEN_HEDGE` | #2 | post-only maker, cancel-race capture, fee-adjusted hedge |
| `SEQUENTIAL_THREE_LEG` | #3 | actual fill/fee output propagated into each next leg |
| `PARALLEL_TWO_LEG` | #4, #5, #6 | derivative entry, monitoring, reduce-only exit |
| `TWO_SIDED_PASSIVE_MAKER` | #7 | paired passive quotes, fill-triggered sibling cancellation |
| `PARALLEL_STATISTICAL_PAIR` | #8 | evidence-gated statistical derivative pair lifecycle |

All five owners route orders through the journal-first central gateway, require authoritative fill/fee evidence, seal settlement evidence durably, and stage residual exposure into shared recovery. The production singleton keeps the central compile gate, dispatcher, order gateway, LIVE execution, and order submission disabled by default.

## Safety boundary

Structure does not grant execution authority. Strategy code emits signals and
intents; guarded automation and trading services own PAPER execution. LIVE
submission remains separately gated and disabled by default. Architecture
cleanup must not lower economic, liquidity, freshness, accounting, recovery,
or confirmation thresholds.

Run `npm.cmd run check:architecture` after moving modules or changing ports.
