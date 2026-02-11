# Polymarket Copy Trading Bot

Self-hosted copy trading bot for [Polymarket](https://polymarket.com) prediction markets. Monitors selected trader wallets and automatically mirrors their positions with configurable risk management.

## Features

- **Live trader management** — add, remove, enable/disable traders from the web dashboard (no restart needed)
- **Two-bucket system** — classify traders as *Grinder* (small/frequent) or *Event* (large/conviction) with separate sizing
- **7 risk checks** — equity stop-loss, daily loss limit, max positions, max exposure, per-trade caps, slippage protection, consecutive loss cooldown
- **Web dashboard** — real-time P&L, equity tracking, risk meters, trade log, trader performance, and full bot controls
- **Signal deduplication** — prevents double-trading with 5-minute TTL dedup
- **First-scan filtering** — records existing positions on startup without generating buy signals
- **Exponential backoff** — graceful API failure handling (2s → 120s max)
- **PM2 managed** — auto-restart, memory limits, daily cron restart at 4AM

## Architecture

```
src/
├── index.js          Main loop, lifecycle management, equity tracking
├── monitor.js        Trader scanning, signal detection, deduplication
├── trader.js         ClobClient, FOK order execution, USDC balance
├── hot-config.js     Live-reloadable trader config (dashboard-controllable)
├── config.js         Environment variable parsing, defaults
├── risk.js           7 risk checks, position sizing, slippage
├── state.js          Bot state machine (running/paused/stopped/emergency)
├── dashboard.js      Express API server, auth, trader CRUD, controls
├── db.js             SQLite (WAL mode), trades/positions/snapshots
├── logger.js         Colored console logger with log levels
└── setup-keys.js     One-time API key derivation, USDC approvals
public/
└── index.html        Dashboard UI (single-file, no build step)
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

This derives your Polymarket CLOB API credentials and approves USDC spending.

### 4. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

### 5. Open dashboard

Navigate to `http://YOUR_SERVER_IP:3000` and log in with your dashboard password.

## Dashboard Controls

**Live (no restart needed):**
- Pause / Resume / Emergency Stop
- Add, remove, toggle traders
- Change trader bucket (grinder/event)
- Adjust per-trader multiplier and max trade size
- Change poll interval

**Requires .env edit + restart:**
- Private key and API credentials
- Core risk limits (equity stop-loss, daily loss limit)
- Dashboard password

## Risk Management

The bot enforces 7 independent risk checks before every trade:

1. **Equity stop-loss** — halts if equity drops below floor (default: $70)
2. **Daily loss limit** — pauses trading after daily losses exceed limit (default: $15)
3. **Max positions** — caps concurrent open positions (default: 8)
4. **Max exposure** — caps total portfolio exposure (default: $90)
5. **Per-trade caps** — separate limits for grinder ($4) and event ($8) trades
6. **Slippage protection** — rejects trades if market price moves >2% during execution
7. **Consecutive loss cooldown** — pauses after streak of losing trades

## Environment Variables

See [`.env.example`](.env.example) for all available configuration options with descriptions and defaults.

## Requirements

- Node.js 18+ (tested on v22)
- PM2 (process manager)
- Polygon wallet funded with USDC + small amount of MATIC for gas
- Linux VPS recommended (Ubuntu 22/24)

## License

MIT
