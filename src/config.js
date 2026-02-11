require('dotenv').config();

function parseList(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

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
    grinderMultiplier: parseFloat(process.env.GRINDER_MULTIPLIER) || 0.15,
    eventMultiplier: parseFloat(process.env.EVENT_MULTIPLIER) || 0.25,
  },
  caps: {
    maxPerTrade: parseFloat(process.env.MAX_PER_TRADE) || 8,
    maxGrinderTrade: parseFloat(process.env.MAX_GRINDER_TRADE) || 4,
    maxEventTrade: parseFloat(process.env.MAX_EVENT_TRADE) || 8,
    maxTotalExposure: parseFloat(process.env.MAX_TOTAL_EXPOSURE) || 90,
    maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS) || 8,
  },
  risk: {
    dailyLossLimit: parseFloat(process.env.DAILY_LOSS_LIMIT) || 15,
    equityStopLoss: parseFloat(process.env.EQUITY_STOP_LOSS) || 70,
    slippageTolerance: parseFloat(process.env.SLIPPAGE_TOLERANCE) || 2,
    minTradeSize: parseFloat(process.env.MIN_TRADE_SIZE) || 2,
    minPrice: parseFloat(process.env.MIN_PRICE) || 0.08,
    maxPrice: parseFloat(process.env.MAX_PRICE) || 0.97,
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
