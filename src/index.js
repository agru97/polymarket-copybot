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
const C = require('./constants');

// Equity tracking
let currentEquity = parseFloat(process.env.MAX_TOTAL_EXPOSURE) || 110;
const STARTING_EQUITY = currentEquity;

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

async function updateEquityFromChain() {
  try {
    const balance = await trader.getUSDCBalance();
    if (balance !== null && balance >= 0) {
      currentEquity = balance;
      log.debug(`Equity updated from chain: $${balance.toFixed(2)}`);
    }
  } catch (err) {
    log.warn(`Could not fetch on-chain equity: ${err.message}`);
  }
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

    // Periodic equity update from chain (every 30 cycles ≈ 5 min)
    if (botState._cycleCount % 30 === 0 && !config.bot.dryRun) {
      await updateEquityFromChain();
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
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log(`  ║  POLYMARKET COPY BOT v2.3                    ║`);
  console.log(`  ║  Mode: ${config.bot.dryRun ? 'DRY RUN (simulation)     ' : 'LIVE TRADING ⚡          '}  ║`);
  console.log(`  ║  Dashboard: http://0.0.0.0:${config.dashboard.port}              ║`);
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

  // Start dashboard (with auth + controls + trader management)
  dashboard.start(getEquity, setEquity);

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

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (err) => {
  log.error(`Unhandled rejection: ${err.message || err}`);
  botState.recordError(err);
});

process.on('uncaughtException', (err) => {
  log.error(`Uncaught exception: ${err.message}`);
  log.error(err.stack);
  botState.recordError(err);
  // Don't exit — let PM2 handle restarts if needed
});

// Export for dashboard access
module.exports = { getEquity, setEquity, STARTING_EQUITY };

// Run
main().catch(err => {
  log.error(`Fatal: ${err.message}`);
  process.exit(1);
});
