# CAT PRO VPS Deployment Runbook

This runbook authorizes only market data, SHADOW evidence collection, and gated PAPER evaluation. It does not authorize LIVE trading or any real exchange order.

## 1. Required external prerequisites

- An AWS EC2/VPS host with an assigned static public IP. On AWS, use an Elastic IP.
- A DNS hostname whose A/AAAA record points to that host.
- Host-managed HTTPS termination with a valid certificate.
- Docker Engine with the Compose plugin.
- Repository access to a reviewed, committed CAT PRO revision.
- A backup of the authoritative `backend/logs` evidence directory.
- Exchange credentials stored only in `backend/.env` or a server-side secret mechanism. Do not paste secrets into chat, Git, images, logs, or frontend variables.

For the initial SHADOW deployment, exchange keys should be restricted to read-only/account-read capabilities where the exchange supports that separation. Withdrawal permissions must remain disabled. Restrict Binance access to the VPS static IP before re-running authenticated-read verification.

## 2. Host exposure

Keep the Compose gateway bound to `127.0.0.1:8080`. Terminate HTTPS in a host-managed reverse proxy and forward only to that loopback address. Do not publish backend port `5000`.

Recommended firewall posture:

- SSH only from the operator's trusted source addresses.
- Public TCP 80/443 only for certificate issuance and HTTPS dashboard access.
- No public access to 5000 or 8080.

## 3. Prepare the authoritative revision

Deploy a reviewed commit or tag, not an unidentified dirty working tree. From the project root:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
chmod 600 .env backend/.env
mkdir -p backend/logs
```

Edit the root `.env`:

```dotenv
CAT_PRO_PUBLIC_ORIGIN=https://your-real-dashboard-domain
CAT_PRO_BIND_ADDRESS=127.0.0.1
CAT_PRO_HTTP_PORT=8080
```

Edit `backend/.env` without printing its values. Preserve these fail-closed settings:

```dotenv
NODE_ENV=production
TRADING_MODE=paper
TRADING_EXECUTION_MODE=paper
LIVE_TRADING_ENABLED=false
ARBITRAGE_LIVE_CONFIRMATION=
LIVE_TRADING_CONFIRMATION=
LIVE_ORDER_SUBMISSION_CONFIRMATION=
LOG_LEVEL=info
```

Keep `AUTOMATED_PAPER_TRADING_CONFIRMATION` blank for the first SHADOW soak. PAPER arming is a later explicit step and cannot bypass readiness, accounting, risk, balance, recovery, clock, or production-safety gates.

Also keep root `CAT_PRO_PAPER_CONFIRMATION` blank. The base Compose file forcibly clears automated PAPER arming.

## 4. Static preflight and deployment

```bash
npm run preflight:vps
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
```

The static preflight must pass before treating the host configuration as deployable. Container logs are rotated at 10 MB with five files per service, and the authoritative evidence directory remains the bind-mounted `backend/logs` directory.

## 5. Post-start SHADOW verification

Run the verifier against the loopback gateway:

```bash
npm run verify:runtime:shadow
```

SHADOW verification requires all five market-data adapters connected, an active lossless opportunity-snapshot handoff, PAPER account mode, accounting integrity, and every LIVE/order/capital flag remaining false. It may pass while genuine PAPER evidence is still incomplete.

Inspect containers without exposing secret environment values:

```bash
docker compose ps
docker compose logs --tail=200 backend
```

Do not use `docker inspect` output in shared terminals or tickets because environment variables may contain credentials.

## 6. Genuine PAPER promotion gate

Do not arm automated PAPER until the application itself reports the configured shadow sample requirement met, shadow performance ready, all five exchanges PAPER-available, account mode PAPER, and accounting integrity passing.

After those conditions are genuinely observed, configure only the exact PAPER-only confirmation and restart the backend. Then run:

```bash
export CAT_PRO_PAPER_CONFIRMATION=ENABLE_AUTOMATED_PAPER_TRADING
npm run preflight:vps:paper
docker compose -f docker-compose.yml -f docker-compose.paper.yml up -d backend
npm run verify:runtime:paper
```

The PAPER verifier reads the authoritative minimum sample requirement from the backend. It fails closed if evidence is missing, inconsistent, below the configured requirement, or if any LIVE capability is detected.

Continue the PAPER soak until explicitly attributed, finalized Strategy #1 trades satisfy the configured review sample and accounting remains reconciled:

```bash
npm run verify:runtime:paper-soak
```

The current review sample is 20 attributed finalized PAPER trades. `NO_DATA` is not converted to zero profit or zero-percent performance. This gate prepares evidence for a later deployment/LIVE audit; it never promotes the system automatically.

## 7. Backup and rollback

Before upgrading:

```bash
docker compose stop backend
tar -czf cat-pro-evidence-backup.tgz backend/logs
docker compose start backend
```

Retain the prior reviewed image/revision. To stop the stack without deleting evidence:

```bash
docker compose down
```

Never use `docker compose down -v`, delete `backend/logs`, or replace the evidence tree during rollback. After any restart or rollback, re-run both the static preflight and the appropriate runtime verifier.

## 8. LIVE boundary

VPS deployment, a passing SHADOW verifier, or a passing PAPER verifier is not LIVE authorization. LIVE remains a separate audited build requiring the five-exchange adapter foundation, fresh authenticated-read and clock evidence, reconciled genuine PAPER history, clean recovery and alert state, Production Safety approval, Tiny-LIVE evidence, and explicit future authorization.
