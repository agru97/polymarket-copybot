# Polymarket Copy Trading Bot v2.3

Self-hosted copy trading bot for [Polymarket](https://polymarket.com) prediction markets. Monitors selected trader wallets and automatically mirrors their positions with configurable risk management, order book analysis, and a full web dashboard.

## Features

**Trading Engine**
- **Copy trading** — monitors leader wallets and mirrors BUY/SELL signals in real-time
- **3 copy strategies** — PERCENTAGE (% of leader's size), FIXED (flat $ amount), ADAPTIVE (auto-scale by trade size with tiered multipliers)
- **Order book walking** — analyzes depth across price levels before trading; skips illiquid markets (<50% fillable)
- **Proportional closes** — when a leader reduces a position by 30%, the bot sells 30% of yours (not all-or-nothing)
- **Trade aggregation** — buffers small trades within a configurable window and executes as a single order
- **Order retry** — automatic retry with backoff on transient failures; permanent errors (balance, allowance, unauthorized) fail immediately
- **Fill-or-Kill execution** — FOK market orders for instant fills, no stale limit orders

**Risk Management (9 checks)**
- Equity stop-loss floor (pre-cycle check before scanning)
- Daily loss limit with auto-pause
- Max concurrent positions cap
- Max total exposure cap
- Per-trade caps (separate grinder/event limits)
- Slippage protection on entry (configurable tolerance)
- Slippage hard limit on close (blocks sells >5% slippage)
- Consecutive loss cooldown (pauses after streak)
- USDC allowance pre-check (verifies CTF Exchange approval before trading)

**Monitoring & Deduplication**
- **Persistent signal dedup** — SQLite-backed with in-memory cache; survives restarts
- **Partial close detection** — detects when leaders reduce (not just exit) positions
- **First-scan filtering** — records existing positions on startup without generating buy signals
- **False liquidation prevention** — API failures return null, not empty arrays

**Dashboard & Security**
- **Web dashboard** — real-time P&L, equity tracking, risk meters, trade log, trader performance, bot controls
- **Live trader management** — add, remove, enable/disable traders from the dashboard (no restart)
- **Audit logging** — every action (trades, logins, config changes, stops) logged with timestamps and IP
- **CSRF protection** — state-changing API endpoints require valid CSRF tokens
- **Timing-safe auth** — password comparison uses `crypto.timingSafeEqual` to prevent timing attacks
- **Rate limiting** — 120 requests/minute per IP on all API endpoints

**Operations**
- **Hot-config** — dynamic trader management with atomic file writes (temp + rename pattern)
- **Exponential backoff** — graceful API failure recovery (2s → 120s max)
- **PM2 managed** — auto-restart, memory limits, daily cron restart
- **Centralized constants** — all magic numbers in `src/constants.js` (single source of truth)

## Architecture

```
src/
├── index.js            Main loop, lifecycle, equity tracking, trade aggregation
├── monitor.js          Trader scanning, signal detection, persistent dedup
├── trader.js           CLOB client, FOK execution, book walking, allowance checks
├── copy-strategy.js    3-strategy position sizing engine (PCT/FIXED/ADAPTIVE)
├── constants.js        Centralized constants — network, trading, risk, audit
├── hot-config.js       Live-reloadable trader config with atomic writes
├── config.js           Environment variable parsing, defaults
├── risk.js             9 risk checks, position sizing, slippage
├── state.js            Bot state machine (running/paused/stopped/emergency)
├── dashboard.js        Express API, auth, CSRF, trader CRUD, audit log
├── db.js               SQLite (WAL), trades/positions/snapshots/dedup/audit
├── validate-config.js  Comprehensive .env validation with error messages
├── logger.js           Colored console logger with log levels
└── setup-keys.js       One-time API key derivation, USDC approvals
public/
└── index.html          Dashboard UI (single-file, no build step)
```

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/agru97/polymarket-copybot.git /opt/polymarket-bot
cd /opt/polymarket-bot
npm install
```

### 2. Configure

```bash
cp .env.example .env
nano .env
```

Required settings:

| Variable | Description |
|----------|-------------|
| `PRIVATE_KEY` | Polygon wallet private key (funds USDC trades) |
| `DASHBOARD_PASSWORD` | Password for the web dashboard |

Trader addresses can be configured in `.env` or added live from the dashboard.

### 3. Derive API keys (one-time)

```bash
node src/setup-keys.js
```

This derives your Polymarket CLOB API credentials and approves USDC spending on the CTF Exchange.

### 4. Validate configuration

```bash
node src/validate-config.js
```

Checks all required variables, validates addresses, and warns about common issues.

### 5. Test in dry-run mode

```bash
DRY_RUN=true node src/index.js
```

Simulates all trades without executing. Check the dashboard at `http://localhost:3000`.

### 6. Go live with PM2

```bash
# Edit .env: set DRY_RUN=false
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

## Dashboard

**Live controls (no restart needed):**
- Pause / Resume / Emergency Stop
- Add, remove, toggle traders
- Change trader bucket (grinder/event)
- Adjust per-trader multiplier and max trade size
- Change poll interval
- View audit log

**API endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login` | Authenticate, returns session + CSRF tokens |
| GET | `/api/health` | Health check (no auth required) |
| GET | `/api/stats` | Trade stats, positions, risk status, equity |
| GET | `/api/trades` | Recent trades (limit param, max 200) |
| GET | `/api/positions` | Open positions |
| GET | `/api/config` | Bot configuration (no secrets) |
| GET | `/api/traders` | All configured traders |
| POST | `/api/traders` | Add a trader |
| PATCH | `/api/traders/:addr` | Update trader settings |
| DELETE | `/api/traders/:addr` | Remove a trader |
| POST | `/api/control/pause` | Pause the bot |
| POST | `/api/control/resume` | Resume the bot |
| POST | `/api/control/emergency-stop` | Emergency stop |
| PATCH | `/api/settings` | Update settings (poll interval) |
| GET | `/api/audit-log` | View audit log (limit param, max 500) |

## Copy Strategies

| Strategy | How it works | Example |
|----------|-------------|---------|
| **PERCENTAGE** | Copy X% of leader's trade size | Leader buys $100, you buy $15 (at 15%) |
| **FIXED** | Use a flat dollar amount per trade | Leader buys $100, you buy $5 (fixed) |
| **ADAPTIVE** | Auto-scale % based on trade size | Small trades → higher %, large → lower % |

Configure with `COPY_STRATEGY` and `COPY_SIZE` in `.env`. Tiered multipliers available for ADAPTIVE mode.

## Environment Variables

See [`.env.example`](.env.example) for all available configuration options with descriptions and defaults.

## Requirements

- Node.js 18+ (tested on v22)
- PM2 (process manager)
- Polygon wallet funded with USDC + small amount of MATIC for gas
- Linux VPS recommended (Ubuntu 22/24)

## Changelog

### v2.3 (Current)
- Order book walking for illiquid market detection
- Proportional position closes (mirrors leader's partial exits)
- USDC allowance pre-check before trades
- Persistent signal dedup (SQLite-backed, survives restarts)
- Centralized constants file (`src/constants.js`)
- Audit logging on all actions (trades, logins, config changes)
- CSRF protection on dashboard state-changing endpoints
- Timing-safe password comparison
- Atomic hot-config writes (temp file + rename)

### v2.2
- Position closing with mirror-sell execution
- PnL tracking (realized + unrealized, side-aware)
- Copy strategy engine (PERCENTAGE/FIXED/ADAPTIVE)
- Trade aggregation buffer
- Config validation with helpful error messages
- Order retry with permanent failure detection
- Token-based sell amounts (not USD notional)
- Pre-cycle equity stop-loss check
- Weighted average entry price accumulation

### v2.1
- Hot-config integration (dynamic trader management)
- Dashboard trader CRUD endpoints
- Dynamic poll interval control

### v2.0
- State-managed lifecycle (pause/resume/emergency stop)
- Web dashboard with auth and rate limiting
- Exponential backoff on API failures
- Graceful shutdown with snapshot

## License

MIT
