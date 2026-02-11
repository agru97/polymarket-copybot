# Polymarket Copy Bot

Self-hosted copy trading bot that monitors Polymarket trader wallets and mirrors their trades in real-time, with a React dashboard for control and monitoring.

## Architecture

**Monorepo with two parts:**

- **Backend** (`src/`) — Node.js + Express bot engine. No build step, runs directly with `node`.
- **Frontend** (`dashboard/`) — React + TypeScript + Vite + Tailwind + Tremor UI. Builds to `public/` and is served by the Express backend.

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 18+ |
| Backend | Express 4, ethers.js 5, @polymarket/clob-client 4 |
| Database | SQLite (better-sqlite3) with WAL mode |
| Frontend | React 18, TypeScript 5, Vite 5, Tailwind 3, Tremor |
| Process Mgmt | PM2 (ecosystem.config.js) |

## Key Commands

```bash
# Bot
npm start                 # Run the bot (production)
npm run validate          # Validate .env config
npm run setup             # Derive API keys from wallet

# Dashboard
npm run build:dashboard   # Build React → public/
npm run dev:dashboard     # Mock API dev server (no bot needed, port 3001)
cd dashboard && npm run dev  # Vite dev server with HMR (port 5173, proxies API to 3001)
```

## Project Structure

```
src/
  index.js          # Main loop, lifecycle, equity tracking (entrypoint)
  config.js         # Environment variable parsing
  constants.js      # Centralized magic numbers (network, trading, risk)
  trader.js         # CLOB client, order placement, trade execution
  monitor.js        # Trader wallet scanning, signal detection
  copy-strategy.js  # Position sizing (PERCENTAGE / FIXED / ADAPTIVE)
  risk.js           # 9 risk checks (equity stop, daily limit, exposure cap, etc.)
  hot-config.js     # Live-reloadable trader config (add/remove without restart)
  state.js          # Bot state machine (running/paused/stopped)
  db.js             # SQLite layer (trades, dedup, stats)
  dashboard.js      # Express API server + static file serving
  logger.js         # Colored console logging
  setup-keys.js     # Polymarket API key derivation
  validate-config.js # .env configuration validator

dashboard/           # React frontend source (Vite project)
  src/
    App.tsx          # Root component
    main.tsx         # Entry point
    api.ts           # API client (fetch wrapper with auth)
    components/      # Login, Dashboard, KPICards, Charts, TradeLog, etc.
  vite.config.ts     # Builds to ../public/, dev proxy to :3001

public/              # Served by Express at runtime (build output from dashboard)
dev-dashboard.js     # Mock API server for frontend dev without running bot
ecosystem.config.js  # PM2 config (auto-restart, daily cron, memory limit)
```

## Build Output

Vite compiles `dashboard/` → `public/`. The `public/assets/` directory contains hashed JS/CSS bundles and should not be committed (it's in `.gitignore`).

## Configuration

All bot config lives in `.env` (see `.env.example` for all options). Key sections:
- Wallet credentials (private key, API keys)
- Trader addresses and buckets
- Risk limits (daily loss, equity stop-loss, exposure caps)
- Copy strategy (PERCENTAGE/FIXED/ADAPTIVE with multipliers)

## Conventions

- Backend is plain CommonJS (`require`/`module.exports`), no transpilation
- Frontend is ESM TypeScript with path alias `@/*` → `dashboard/src/*`
- All risk/trading constants are centralized in `src/constants.js`
- Trader config is hot-reloadable via `src/hot-config.js` — no restart needed
- Dashboard API endpoints are under `/api/*`, served by `src/dashboard.js`
- SQLite DB stored in `data/` directory (gitignored)
- Logs go to `logs/` directory (gitignored)

## Important Notes

- **Never commit `.env`** — contains private keys and API secrets
- **`public/assets/`** is build output — rebuild with `npm run build:dashboard`
- The bot supports dry-run mode (`DRY_RUN=true`) for paper trading
- PM2 handles auto-restart and daily memory cleanup (4 AM cron)
