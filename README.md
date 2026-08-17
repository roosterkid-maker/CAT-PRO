# CAT PRO

CAT PRO is a private, single-operator, automated multi-strategy crypto trading bot. This repository is the authoritative source of truth; it is not a SaaS product or a strategy marketplace.

The runtime contains eight actual trading strategies, one shared dynamic-opportunity discovery capability, one shared hedge/recovery capability, and one central guarded execution system:

1. Cross-Exchange Arbitrage
2. Cross-Exchange Market Making (XEMM)
3. Triangular Arbitrage
4. Spot-Perpetual Basis Arbitrage
5. Funding-Rate Arbitrage
6. Perpetual-Perpetual Arbitrage
7. Dynamic Market Making
8. Statistical Arbitrage

Registration or architecture readiness is not trading proof. Every strategy remains subject to real signal, PAPER evidence, market-rule, balance/margin, risk, final-last-look, settlement, and action-time gates.

## Exchange target

The first supported-exchange target is exactly:

1. CoinDCX
2. Binance
3. UnoCoin
4. CoinSwitch
5. Bybit

Current implementation coverage is deliberately reported separately from that target:

| Exchange | Market data | Order books | Authenticated-read monitoring | LIVE adapter infrastructure |
| --- | --- | --- | --- | --- |
| CoinDCX | Implemented | Implemented | Implemented | Implemented, not authorized for LIVE use |
| Binance | Implemented | Implemented | Implemented | Implemented, not authorized for LIVE use |
| Bybit | Implemented | Implemented | Implemented | Implemented, not authorized for LIVE use |
| UnoCoin | Implemented | Implemented | Implemented | Not implemented |
| CoinSwitch | Implemented | Implemented | Implemented | Implemented, not authorized for LIVE use |

Missing adapters must never be displayed as connected, healthy, ready, or executable.

Implementation coverage is not runtime health. The evidence-backed current state is available from `GET /api/exchanges/fleet`; credential values are never returned by that endpoint.

## Authoritative runtime

`backend/src/server.ts` is the backend entrypoint used by the configured development and production scripts. It mounts the current API, WebSocket, market-data, automation, execution-monitoring, safety, recovery and operator-settings surfaces.

There is no secondary Express application entrypoint. Module and port ownership
is documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and enforced by
`npm.cmd run check:architecture`.

The final eight-strategy architecture and safety boundary is recorded in
[`docs/BUILD_22_RELEASE_BASELINE.md`](docs/BUILD_22_RELEASE_BASELINE.md).

Generated deployment folders or archives are packaging snapshots. The root `backend/`, `frontend/`, root package manifests and root compose configuration remain authoritative for development.

## Local development

Install dependencies from the project root:

```powershell
npm.cmd run install:all
```

Start the backend with the stable TypeScript development command:

```powershell
npm.cmd run dev:backend
```

This invokes `ts-node` from the `backend` working directory so `backend/.env` is resolved by the existing `dotenv/config` startup path. The optional watch command remains available:

```powershell
npm.cmd run dev:backend:watch
```

Start the frontend in a second terminal:

```powershell
npm.cmd run dev:frontend
```

Local URLs:

- Dashboard and browser API origin: `http://127.0.0.1:5173/`
- Internal local backend listener: `http://127.0.0.1:5000/`

Vite proxies `/api` and `/socket.io` from `5173` to `5000`, so frontend
environment URLs stay blank. Port `8081` is not used. The Compose/VPS gateway
uses loopback port `8080`; that is a deployment entrypoint, not a second
backend.

## Validation

Run the configured repository validation sequence:

```powershell
npm.cmd run validate
```

This builds the backend, runs the deterministic fail-closed backend safety suite, lints the frontend, and produces the frontend TypeScript/Vite production build.

The deterministic suite excludes authenticated real-exchange API scripts and confirmation-sensitive order tests. It also removes known execution-confirmation environment flags from every child test process.

## VPS shadow/PAPER deployment

The root Compose stack builds the authoritative backend and frontend sources, preserves the complete `backend/logs` evidence tree, and exposes a same-origin gateway on loopback port `8080` by default. Its backend environment overrides force PAPER account mode and clear automated-PAPER plus every LIVE/order-submission confirmation even if a local environment file contains different values.

Create the two separate environment files from their tracked templates:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

The root `.env` contains only Compose host settings such as `CAT_PRO_PUBLIC_ORIGIN`, bind address and gateway port. `backend/.env` contains application settings and exchange credentials. Neither generated `.env` file may be committed.

Replace the example public origin with the real HTTPS dashboard origin. The preflight deliberately rejects reserved example/test domains and local HTTP origins.

Prepare `backend/.env` on the VPS without committing it. Keep at least these values fail-closed:

```dotenv
NODE_ENV=production
TRADING_MODE=paper
TRADING_EXECUTION_MODE=paper
LIVE_TRADING_ENABLED=false
ARBITRAGE_LIVE_CONFIRMATION=
LIVE_TRADING_CONFIRMATION=
LIVE_ORDER_SUBMISSION_CONFIRMATION=
```

For intentionally armed automated PAPER execution, the existing controller additionally requires its exact PAPER-only confirmation and every runtime readiness/accounting/risk gate. Arming it does not make PAPER execution allowed and does not enable LIVE.

Strategies #2-#8 use their separate central PAPER confirmation and allowlist. Strategy #1 uses the existing unified PAPER owner and its own explicit PAPER-only confirmation. See `backend/.env.example`; neither confirmation enables LIVE.

On a host with Docker Compose available:

```bash
npm run preflight:vps
docker compose build
docker compose up -d
docker compose ps
```

After startup, verify the fail-closed SHADOW runtime through the local gateway:

```bash
npm run verify:runtime:shadow
```

When the backend itself has genuinely met its configured shadow sample, five-exchange PAPER availability, accounting and PAPER-arming gates, verify PAPER readiness separately:

```bash
npm run verify:runtime:paper
```

Only after that read-only verifier passes, use the explicit PAPER overlay:

```bash
export CAT_PRO_PAPER_CONFIRMATION=ENABLE_AUTOMATED_PAPER_TRADING
npm run preflight:vps:paper
docker compose -f docker-compose.yml -f docker-compose.paper.yml up -d backend
npm run verify:runtime:paper
```

After genuine Strategy #1-attributed PAPER executions accumulate, the separate soak verifier requires at least 20 finalized attributed trades with intact accounting evidence:

```bash
npm run verify:runtime:paper-soak
```

PAPER readiness or soak completion is not LIVE authorization.

Both runtime commands use read-only GET requests and fail closed if required evidence is absent or any LIVE/order/capital flag is detected. The complete deployment, backup, rollback and promotion procedure is in [`docs/VPS_DEPLOYMENT_RUNBOOK.md`](docs/VPS_DEPLOYMENT_RUNBOOK.md).

`preflight:vps` is deliberately fail-closed. It checks deployment files, PAPER/LIVE settings, the public HTTPS origin, five-exchange credential key presence, evidence-directory access and Docker Compose availability. It prints missing environment-variable names but never credential values. A passing static preflight is necessary but not sufficient; runtime readiness endpoints must still pass after startup.

The local-only dashboard endpoint is `http://127.0.0.1:8080`. For remote access, put a host-managed HTTPS reverse proxy in front of that loopback endpoint and set `CAT_PRO_PUBLIC_ORIGIN` in the root `.env` to the exact public HTTPS origin before starting Compose. Do not expose backend port `5000` publicly. Direct plain-HTTP exposure requires an explicit `CAT_PRO_BIND_ADDRESS=0.0.0.0` override and is not recommended.

The frontend uses the browser's current origin for REST and Socket.IO when Vite
URL variables are unset. Local Vite and the Compose gateway both proxy that
same-origin traffic to the single backend listener.

Before any VPS migration, back up `backend/logs` because it contains accounting, shadow-learning, readiness, lifecycle, alert and execution evidence. Never copy `.env` into an image or repository.

VPS deployment is currently authorized only for continuous market-data, SHADOW and gated PAPER soak. It is not authorization for real orders. LIVE remains a separate evidence-based milestone requiring a clean production-safety decision, five-exchange operational evidence, genuine reconciled PAPER history, clock/balance/auth health, recovery validation and explicit future authorization.

## Safety invariants

- LIVE trading remains disabled and fail-closed.
- Market-data connectivity is not execution connectivity.
- Credential presence is not proof of authenticated exchange health.
- No fake balances, opportunities, fills, profit, readiness, or exchange health may be introduced.
- API secret values must never be returned to the frontend or written to logs.
- Risk, readiness, accounting, recovery, balance, clock, and production-safety gates must not be bypassed.
- Tiny-LIVE remains a preflight-only workflow until a separately audited future authorization.
