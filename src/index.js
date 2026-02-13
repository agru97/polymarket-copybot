/**
 * Polymarket Copy Bot v2.1 — Production Entry Point
 *
 * v2.1 changes:
 *   - Hot-config integration (dynamic trader management)
 *   - Dynamic poll interval from dashboard
 *
 * Inherited from v2.0:
 *   - State-managed lifecycle (pause/resume/emergency stop)
 *   - Exponential backoff on API failures
 *   - Graceful shutdown with open order cleanup
 *   - Health monitoring with auto-pause on repeated errors
 *   - Real equity tracking from USDC balance
 */

const { config } = require('./config');
const hotConfig = require('./hot-config');
const db = require('./db');
const monitor = require('./monitor');
const trader = require('./trader');
const risk = require('./risk');
const dashboard = require('./dashboard');
const log = require('./logger');
const { botState, STATES } = require('./state');
const { validateConfig } = require('./validate-config');
const notifications = require('./notifications');
const C = require('./constants');

let server = null;

// Equity tracking — real balance fetched from chain on startup (see main())
let currentEquity = parseFloat(process.env.MAX_TOTAL_EXPOSURE) || 110; // fallback until chain fetch
let STARTING_EQUITY = currentEquity;

// ─── Auto-size risk limits from on-chain balance ─────────────────
// Only overrides values the user didn't explicitly set in .env.
// Rationale: hardcoded defaults ($90 exposure, $70 stop-loss) break
// for accounts with $16 or $500.  This scales them proportionally.
function autoSizeRiskFromBalance(balance) {
  if (balance <= 0) return; // chain fetch failed — keep .env defaults

  // In dry-run mode, use more generous sizing so paper trading generates
  // enough simulated trades to evaluate strategy performance.
  const isDryRun = config.bot.dryRun;
  const rules = [
    // [envVar, configPath, percentage, minValue, description]
    ['MAX_TOTAL_EXPOSURE', 'caps.maxTotalExposure', 1.00, 5,  'Max total exposure'],
    ['EQUITY_STOP_LOSS',   'risk.equityStopLoss',   0.60, 3,  'Equity stop-loss floor'],
    ['DAILY_LOSS_LIMIT',   'risk.dailyLossLimit',   isDryRun ? 0.50 : 0.15, 2, 'Daily loss limit'],
    ['MAX_PER_TRADE',      'caps.maxPerTrade',       isDryRun ? 0.40 : 0.20, 2, 'Max per trade'],
    ['MAX_GRINDER_TRADE',  'caps.maxGrinderTrade',   isDryRun ? 0.30 : 0.15, 2, 'Max grinder trade'],
    ['MAX_EVENT_TRADE',    'caps.maxEventTrade',     isDryRun ? 0.40 : 0.20, 2, 'Max event trade'],
  ];

  let anyAutoSized = false;

  const overrides = hotConfig.getSettingsOverrides();

  for (const [envVar, path, pct, min, desc] of rules) {
    // Skip if user explicitly set this in .env
    if (process.env[envVar]) continue;
    // Skip if user changed this via dashboard (persisted in hot-config)
    const [section, key] = path.split('.');
    if (overrides[key] !== undefined) continue;

    const autoVal = Math.max(min, parseFloat((balance * pct).toFixed(2)));
    config[section][key] = autoVal;
    log.info(`  Auto-sized ${desc}: $${autoVal} (${(pct * 100).toFixed(0)}% of $${balance.toFixed(2)})`);
    anyAutoSized = true;
  }

  if (anyAutoSized) {
    log.info('  Override any value by setting it explicitly in .env');
  } else {
    log.info('All risk limits set manually in .env — no auto-sizing applied');
  }
}

// Backoff state
let backoffMs = 0;
const MIN_BACKOFF = 0;
const MAX_BACKOFF = 120000; // 2 min max
const BACKOFF_MULTIPLIER = 2;

// ─── Trade Aggregation Buffer ───────────────────
// Novus-Tech pattern: batch small trades for the same market within a window
const AGGREGATION_ENABLED = (process.env.TRADE_AGGREGATION || 'false').toLowerCase() === 'true';
const AGGREGATION_WINDOW_MS = parseInt(process.env.TRADE_AGGREGATION_WINDOW_MS || '30000'); // 30s
const AGGREGATION_MIN_USD = parseFloat(process.env.TRADE_AGGREGATION_MIN_USD || '2');
const aggregationBuffer = new Map(); // key → { signals: [], firstSeen: timestamp }
const MAX_BUFFER_SIGNALS = 500;  // Safety cap — prevent memory exhaustion
const MAX_PER_KEY = 50;          // Max signals per aggregation key

function getAggregationKey(signal) {
  return `${signal.traderAddress}:${signal.marketId}:${signal.tokenId}:${signal.side}`;
}

function addToAggregation(signal) {
  // Global safety check
  let totalSignals = 0;
  for (const agg of aggregationBuffer.values()) totalSignals += agg.signals.length;
  if (totalSignals >= MAX_BUFFER_SIGNALS) {
    log.warn(`Aggregation buffer full (${totalSignals}) — executing signal directly`);
    return false; // Caller should execute immediately
  }

  const key = getAggregationKey(signal);
  const existing = aggregationBuffer.get(key);
  if (existing) {
    if (existing.signals.length >= MAX_PER_KEY) {
      log.warn(`Per-key aggregation limit for ${key.slice(0, 30)}... — executing early`);
      return false;
    }
    existing.signals.push(signal);
    existing.totalSize += signal.size;
    // Use weighted average price, not just latest (audit fix)
    existing.totalCost = (existing.totalCost || 0) + (signal.size * signal.price);
    existing.latestPrice = existing.totalCost / existing.totalSize;
  } else {
    aggregationBuffer.set(key, {
      signals: [signal],
      totalSize: signal.size,
      totalCost: signal.size * signal.price,
      latestPrice: signal.price,
      firstSeen: Date.now(),
    });
  }
  return true;
}

function getReadyAggregations() {
  const ready = [];
  const now = Date.now();

  for (const [key, agg] of aggregationBuffer.entries()) {
    if (now - agg.firstSeen >= AGGREGATION_WINDOW_MS) {
      if (agg.totalSize >= AGGREGATION_MIN_USD) {
        // Merge into a single signal with aggregated size
        const baseSignal = { ...agg.signals[0] };
        baseSignal.size = agg.totalSize;
        baseSignal.price = agg.latestPrice;
        baseSignal.notes = `Aggregated ${agg.signals.length} trades ($${agg.totalSize.toFixed(2)} total)`;
        ready.push(baseSignal);
      } else {
        // Execute small trades individually instead of silently dropping (audit fix)
        log.debug(`Aggregation below min: $${agg.totalSize.toFixed(2)} — executing ${agg.signals.length} individual signal(s)`);
        for (const sig of agg.signals) {
          ready.push(sig);
        }
      }
      aggregationBuffer.delete(key);
    }
    // Safety: expire any entries older than 2x the window
    else if (now - agg.firstSeen > AGGREGATION_WINDOW_MS * 2) {
      log.warn(`Force-expiring stale aggregation: ${key.slice(0, 30)}...`);
      aggregationBuffer.delete(key);
    }
  }

  return ready;
}

function getEquity() { return currentEquity; }
function setEquity(val) { currentEquity = val; }

let equityInitialized = false; // tracks whether we've ever gotten a real balance

async function updateEquityFromChain(retries = 1) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const balance = await trader.getUSDCBalance();
      if (balance !== null && balance >= 0) {
        const changed = Math.abs(currentEquity - balance) > 0.01;
        currentEquity = balance;
        if (!equityInitialized) {
          equityInitialized = true;
          log.info(`Equity from chain: $${balance.toFixed(2)}`);
          // Re-run auto-sizing now that we have real balance
          autoSizeRiskFromBalance(balance);
          STARTING_EQUITY = balance;
        } else if (changed) {
          log.debug(`Equity updated: $${balance.toFixed(2)}`);
        }
        return true; // success
      }
      log.warn(`Chain equity fetch returned null (attempt ${attempt + 1}/${retries})`);
    } catch (err) {
      log.warn(`Could not fetch on-chain equity (attempt ${attempt + 1}/${retries}): ${err.message}`);
    }
    // Wait before retry
    if (attempt < retries - 1) await new Promise(r => setTimeout(r, 3000));
  }
  return false; // all retries failed
}

async function runCycle() {
  // Check state
  if (!botState.canTrade) {
    log.debug(`Cycle skipped — bot is ${botState.state}`);
    return;
  }

  // Pre-cycle equity stop-loss check (audit fix: catch this BEFORE scanning)
  if (currentEquity <= config.risk.equityStopLoss) {
    log.error(`EQUITY STOP-LOSS: $${currentEquity.toFixed(2)} <= floor $${config.risk.equityStopLoss} — auto-pausing bot`);
    db.logAudit(C.AUDIT_ACTIONS.EQUITY_STOP_LOSS, `Equity $${currentEquity.toFixed(2)} <= floor $${config.risk.equityStopLoss}`);
    notifications.notifyEquityStopLoss(currentEquity, config.risk.equityStopLoss);
    botState.pause(`Equity stop-loss triggered: $${currentEquity.toFixed(2)} below $${config.risk.equityStopLoss} floor`);
    return;
  }

  try {
    // Scan all traders for new signals
    const signals = await monitor.scanAllTraders();

    if (signals.length > 0) {
      log.info(`Found ${signals.length} signal(s)`);
    }

    // Determine which signals to execute now vs buffer
    let signalsToExecute = [];

    if (AGGREGATION_ENABLED) {
      for (const signal of signals) {
        if (signal.type === 'CLOSE') {
          // Always execute close signals immediately
          signalsToExecute.push(signal);
        } else if (signal.size < AGGREGATION_MIN_USD) {
          // Small trade → try to buffer for aggregation
          const buffered = addToAggregation(signal);
          if (buffered) {
            log.debug(`Buffered small trade: $${signal.size.toFixed(2)} for ${(signal.marketName || signal.marketId).slice(0, 30)}`);
          } else {
            signalsToExecute.push(signal); // Buffer full — execute directly
          }
        } else {
          // Large enough → execute immediately
          signalsToExecute.push(signal);
        }
      }
      // Check for ready aggregated trades
      const readyAggs = getReadyAggregations();
      if (readyAggs.length > 0) {
        log.info(`${readyAggs.length} aggregated trade(s) ready`);
        signalsToExecute.push(...readyAggs);
      }
    } else {
      signalsToExecute = signals;
    }

    // Process each signal
    for (const signal of signalsToExecute) {
      if (!botState.canTrade) {
        log.warn('Bot paused mid-cycle — stopping signal processing');
        break;
      }
      await trader.executeSignal(signal, currentEquity);
    }

    // Record successful cycle
    botState.recordCycle();

    // Reset backoff on success
    if (backoffMs > 0) {
      log.info('API recovered — resetting backoff');
      backoffMs = MIN_BACKOFF;
    }

    // Periodic equity update from chain
    // If we never got a real balance, try every cycle; otherwise every 30 cycles (~5 min)
    const equityInterval = equityInitialized ? 30 : 1;
    if (botState._cycleCount % equityInterval === 0) {
      await updateEquityFromChain(equityInitialized ? 1 : 3);
    }

    // Periodic unrealized PnL refresh (every 10 cycles — keeps dashboard accurate)
    if (botState._cycleCount % 10 === 0) {
      const openPositions = db.getOpenPositions();
      for (const pos of openPositions) {
        try {
          const price = await trader.getMarketPrice(pos.token_id, 'SELL');
          if (price && price > 0) {
            db.updateUnrealizedPnl(pos.market_id, pos.token_id, price);
          }
        } catch { /* non-critical — stale PnL is better than crashing */ }
      }
    }

    // Periodic snapshot (every 10 cycles)
    if (botState._cycleCount % 10 === 0) {
      const riskStatus = risk.getRiskStatus(currentEquity);
      db.saveSnapshot({
        equity: currentEquity,
        openPositions: riskStatus.openPositions,
        totalExposure: riskStatus.totalExposure,
        dailyPnl: riskStatus.dailyPnl,
        totalPnl: currentEquity - STARTING_EQUITY,
      });
    }

  } catch (err) {
    botState.recordError(err);
    log.error(`Cycle error: ${err.message}`);

    // Exponential backoff
    backoffMs = backoffMs === 0 ? 2000 : Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF);
    log.warn(`Backing off ${(backoffMs / 1000).toFixed(0)}s before next cycle`);
  }
}

async function main() {
  // Startup banner
  const os = require('os');
  const dashHost = (() => {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
      }
    }
    return 'localhost';
  })();
  const dashUrl = `http://${dashHost}:${config.dashboard.port}`;
  const mode = config.bot.dryRun ? 'DRY RUN (simulation)' : 'LIVE TRADING';
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║  POLYMARKET COPY BOT v2.4                    ║');
  console.log(`  ║  Mode: ${mode.padEnd(35)}║`);
  console.log(`  ║  Dashboard: ${dashUrl.padEnd(32)}║`);
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');

  // Validate configuration before anything else
  const configResult = validateConfig();
  if (!configResult.valid) {
    log.error('Configuration validation failed — cannot start bot');
    process.exit(1);
  }

  // Initialize database
  db.init();

  // Initialize hot config (loads traders from file or seeds from .env)
  hotConfig.load();

  // Initialize CLOB client
  await trader.initClobClient();

  // Fetch real equity from chain on startup — retry up to 5 times (RPC can be flaky)
  const gotBalance = await updateEquityFromChain(5);
  if (!gotBalance) {
    log.warn(`Could not fetch on-chain balance after 5 retries — using fallback $${currentEquity.toFixed(2)}`);
    log.warn('Risk limits are based on the fallback. They will auto-correct once chain becomes reachable.');
    // Still run auto-sizing from the fallback so limits aren't wildly off
    autoSizeRiskFromBalance(currentEquity);
  }
  // If gotBalance is true, updateEquityFromChain already called autoSizeRiskFromBalance

  // Start dashboard (with auth + controls + trader management)
  server = dashboard.start(getEquity, setEquity);

  // Log config summary (now from hot-config)
  const activeTraders = hotConfig.getActiveTraders();
  log.info(`Monitoring ${activeTraders.length} active trader(s):`);
  activeTraders.forEach(t => {
    const label = t.label ? ` "${t.label}"` : '';
    log.info(`  [${t.bucket.toUpperCase()}] ${t.address.slice(0, 10)}...${label} (${(t.multiplier * 100).toFixed(0)}%, max $${t.maxTrade})`);
  });

  const disabledCount = hotConfig.getTraders().length - activeTraders.length;
  if (disabledCount > 0) {
    log.info(`  (${disabledCount} trader(s) disabled)`);
  }

  log.info(`Risk: daily loss $${config.risk.dailyLossLimit}, equity floor $${config.risk.equityStopLoss}, max exposure $${config.caps.maxTotalExposure}`);
  log.info(`Poll interval: ${hotConfig.getPollInterval() / 1000}s`);

  // Set state to running
  botState.start();
  db.logAudit(C.AUDIT_ACTIONS.BOT_START, `${config.bot.dryRun ? 'DRY RUN' : 'LIVE'} mode, ${activeTraders.length} traders`);
  notifications.notifyBotStarted(config.bot.dryRun ? 'Paper' : 'Live', activeTraders.length);
  log.info('Bot started. Press Ctrl+C to stop.\n');

  // Main loop — uses dynamic poll interval from hot-config
  while (!botState.isStopped) {
    await runCycle();
    const waitMs = hotConfig.getPollInterval() + backoffMs;
    await new Promise(r => setTimeout(r, waitMs));
  }

  log.info('Bot stopped.');
}

// Graceful shutdown
async function shutdown(signal) {
  log.info(`${signal} received — shutting down gracefully...`);
  botState.stop();

  // Stop accepting new HTTP connections
  if (server) {
    server.close();
    if (server.closeIdleConnections) server.closeIdleConnections();
  }

  // Give current cycle a moment to finish
  await new Promise(r => setTimeout(r, 2000));

  // Final snapshot
  try {
    const riskStatus = risk.getRiskStatus(currentEquity);
    db.saveSnapshot({
      equity: currentEquity,
      openPositions: riskStatus.openPositions,
      totalExposure: riskStatus.totalExposure,
      dailyPnl: riskStatus.dailyPnl,
      totalPnl: currentEquity - STARTING_EQUITY,
    });
    log.info('Final snapshot saved.');
  } catch { /* ok */ }

  // Close database cleanly (checkpoints WAL)
  try { db.close(); } catch { /* ok */ }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (err) => {
  log.error(`Unhandled rejection: ${err.message || err}`);
  log.error(err.stack || '');
  botState.recordError(err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  log.error(`Uncaught exception: ${err.message}`);
  log.error(err.stack);
  botState.recordError(err);
  // Exit so PM2 can restart cleanly — continuing after uncaughtException
  // risks corrupted state (per Node.js docs)
  process.exit(1);
});

// Export for dashboard access
module.exports = { getEquity, setEquity, STARTING_EQUITY };

// Run
main().catch(err => {
  log.error(`Fatal: ${err.message}`);
  process.exit(1);
});
