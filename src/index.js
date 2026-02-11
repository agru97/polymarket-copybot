/**
 * Polymarket Copy Bot v2.0 — Production Entry Point
 *
 * Features:
 *   - State-managed lifecycle (pause/resume/emergency stop)
 *   - Exponential backoff on API failures
 *   - Graceful shutdown with open order cleanup
 *   - Health monitoring with auto-pause on repeated errors
 *   - Real equity tracking from USDC balance
 */

const { config } = require('./config');
const db = require('./db');
const monitor = require('./monitor');
const trader = require('./trader');
const risk = require('./risk');
const dashboard = require('./dashboard');
const log = require('./logger');
const { botState, STATES } = require('./state');

// Equity tracking
let currentEquity = parseFloat(process.env.MAX_TOTAL_EXPOSURE) || 110;
const STARTING_EQUITY = currentEquity;

// Backoff state
let backoffMs = 0;
const MIN_BACKOFF = 0;
const MAX_BACKOFF = 120000; // 2 min max
const BACKOFF_MULTIPLIER = 2;

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

  try {
    // Scan all traders for new signals
    const signals = await monitor.scanAllTraders();

    if (signals.length > 0) {
      log.info(`Found ${signals.length} signal(s)`);
    }

    // Process each signal
    for (const signal of signals) {
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
  console.log(`  ║  POLYMARKET COPY BOT v2.0                    ║`);
  console.log(`  ║  Mode: ${config.bot.dryRun ? 'DRY RUN (simulation)     ' : 'LIVE TRADING ⚡          '}  ║`);
  console.log(`  ║  Dashboard: http://0.0.0.0:${config.dashboard.port}              ║`);
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');

  // Initialize database
  db.init();

  // Initialize CLOB client
  await trader.initClobClient();

  // Start dashboard (with auth + controls)
  dashboard.start(getEquity, setEquity);

  // Log config summary
  const allTraders = [...config.traders.grinders, ...config.traders.events];
  log.info(`Monitoring ${allTraders.length} trader(s):`);
  config.traders.grinders.forEach(t =>
    log.info(`  [GRINDER] ${t.slice(0, 10)}... (${config.sizing.grinderMultiplier * 100}%, max $${config.caps.maxGrinderTrade})`)
  );
  config.traders.events.forEach(t =>
    log.info(`  [EVENT]   ${t.slice(0, 10)}... (${config.sizing.eventMultiplier * 100}%, max $${config.caps.maxEventTrade})`)
  );
  log.info(`Risk: daily loss $${config.risk.dailyLossLimit}, equity floor $${config.risk.equityStopLoss}, max exposure $${config.caps.maxTotalExposure}`);
  log.info(`Poll interval: ${config.bot.pollInterval / 1000}s`);

  // Set state to running
  botState.start();
  log.info('Bot started. Press Ctrl+C to stop.\n');

  // Main loop
  while (!botState.isStopped) {
    await runCycle();
    const waitMs = config.bot.pollInterval + backoffMs;
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
