# CAT PRO Build 22 release baseline

Build 22 closes the eight-strategy engineering roadmap at the architecture
and guarded SHADOW/PAPER foundation level. It does not claim accepted PAPER
soak, exchange stability, a target trade frequency, profitability, or LIVE
readiness.

## Canonical runtime

| Concern | Authoritative owner |
| --- | --- |
| Backend entrypoint | `backend/src/server.ts` |
| Backend local listener | `127.0.0.1:5000` via `CAT_PRO_BACKEND_HOST` |
| Browser/local frontend | `http://127.0.0.1:5173` |
| Local API and Socket.IO routing | Vite same-origin proxy from `5173` to `5000` |
| Compose/VPS gateway | loopback `127.0.0.1:8080`, backend remains container-only |
| Strategy identity and numbering | `backend/src/strategies/config/ActualStrategyCatalog.ts` |
| Strategy implementations | `backend/src/strategies/<canonical-strategy-id>` |
| Strategy registration | `backend/src/strategies/bootstrap/StrategyBootstrap.ts` |
| Strategy #1 execution workflow | `backend/src/workflows/cross-exchange-arbitrage` |
| Strategies #2-#8 guarded PAPER path | central services under `backend/src/strategies/services` |
| Cross-cutting legacy/Strategy #1 automation | `backend/src/automation` |
| Shared hedge/recovery | `backend/src/recovery` plus the unregistered hedge evidence producer |

Port `8081` and `backend/src/automation/strategies` are retired and rejected by
the architecture check. Frontend code uses its current browser origin; it does
not bypass the proxy by calling the backend directly.

## Eight-strategy contract

Exactly these controllers are registered, numbered 1 through 8:

1. Cross-Exchange Arbitrage
2. Cross-Exchange Market Making
3. Triangular Arbitrage
4. Spot-Perpetual Basis Arbitrage
5. Funding-Rate Arbitrage
6. Perpetual-Perpetual Arbitrage
7. Dynamic Market Making
8. Statistical Arbitrage

Dynamic opportunity discovery and hedge/inventory recovery are shared
capabilities, not additional trading strategies. Registry duplicate IDs and
duplicate strategy numbers fail closed.

## Release verification

From the repository root, run:

```powershell
npm.cmd run validate
```

This validates architecture and scripts, builds the backend, executes the
deterministic safety suite, lints the frontend, and builds the frontend. For a
local operational regression, start the canonical backend and frontend and
inspect `/strategies` plus the read-only endpoint:

```text
GET /api/strategies/eight-strategy-paper-readiness
```

The runtime endpoint is the authority for current signal, admission, PAPER and
soak state. Counts can change with genuine market and account evidence.

Build 22 was accepted on 2026-08-13 with:

- architecture and script checks passing;
- backend TypeScript build passing;
- deterministic backend safety suite passing `138/138`;
- frontend lint and production build passing;
- local listeners restricted to `127.0.0.1:5000` and `127.0.0.1:5173`, with
  no listener on `8081`;
- browser regression showing eight registered/running controllers, a connected
  backend/socket and no page console errors;
- repeated readiness reads leaving queue, positions and accounting unchanged.

## Promotion boundary

Build 22 leaves LIVE and order submission OFF. Architecture completion never
auto-closes these evidence-dependent requirements:

- a current qualified strategy signal;
- explicit PAPER operator confirmation and allowlisting where applicable;
- authenticated derivative account and fee evidence for derivative strategies;
- real completed, reconciled and attributed PAPER cycles;
- accepted consecutive PAPER soak;
- healthy exchange authentication, clock, balance/margin and market rules;
- separately reviewed Tiny-LIVE authorization at action time.

No trade-rate or profit result may be inferred from this release baseline.
