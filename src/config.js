require('dotenv').config();

function parseList(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** Parse env var as float, treating empty/missing as fallback (but 0 as valid) */
const envFloat = (key, fallback) => {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};

const config = {
  wallet: {
    privateKey: process.env.PRIVATE_KEY,
    address: process.env.WALLET_ADDRESS,
  },
  api: {
    key: process.env.POLYMARKET_API_KEY,
    secret: process.env.POLYMARKET_API_SECRET,
    passphrase: process.env.POLYMARKET_API_PASSPHRASE,
    clobUrl: process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com',
  },
  traders: {
    grinders: parseList(process.env.GRINDER_TRADERS),
    events: parseList(process.env.EVENT_TRADERS),
  },
  sizing: {
    grinderMultiplier: envFloat('GRINDER_MULTIPLIER', 1.0),
    eventMultiplier: envFloat('EVENT_MULTIPLIER', 1.0),
  },
  caps: {
    maxPerTrade: envFloat('MAX_PER_TRADE', 8),
    maxGrinderTrade: envFloat('MAX_GRINDER_TRADE', 4),
    maxEventTrade: envFloat('MAX_EVENT_TRADE', 8),
    maxTotalExposure: envFloat('MAX_TOTAL_EXPOSURE', 90),
    maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS) || 8,
  },
  risk: {
    dailyLossLimit: envFloat('DAILY_LOSS_LIMIT', 15),
    equityStopLoss: envFloat('EQUITY_STOP_LOSS', 70),
    slippageTolerance: envFloat('SLIPPAGE_TOLERANCE', 2),
    minTradeSize: envFloat('MIN_TRADE_SIZE', 1),
    minPrice: envFloat('MIN_PRICE', 0.08),
    maxPrice: envFloat('MAX_PRICE', 0.99),
  },
  bot: {
    dryRun: (process.env.DRY_RUN || 'true').toLowerCase() === 'true',
    pollInterval: parseInt(process.env.POLL_INTERVAL_MS) || 10000,
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  dashboard: {
    port: parseInt(process.env.DASHBOARD_PORT) || 3000,
    password: process.env.DASHBOARD_PASSWORD || 'changeme123',
  },
};

// Warn/block if using default password
if (config.dashboard.password === 'changeme123') {
  console.warn('\n  ⚠ WARNING: Using default dashboard password "changeme123".');
  console.warn('  Set DASHBOARD_PASSWORD in .env to a strong password.\n');
}

function getBucket(address) {
  const addr = address.toLowerCase();
  if (config.traders.grinders.includes(addr)) return 'grinder';
  if (config.traders.events.includes(addr)) return 'event';
  return null;
}

function getMultiplier(bucket) {
  return bucket === 'grinder' ? config.sizing.grinderMultiplier : config.sizing.eventMultiplier;
}

function getMaxTrade(bucket) {
  return bucket === 'grinder' ? config.caps.maxGrinderTrade : config.caps.maxEventTrade;
}

module.exports = { config, getBucket, getMultiplier, getMaxTrade };
