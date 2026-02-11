/**
 * Hot Config Manager v2.1
 *
 * Live-reloadable configuration for trader management.
 * Stores dynamic config in data/hot-config.json, merges with .env defaults.
 *
 * Dashboard-controllable:
 *   - Add / remove / toggle traders
 *   - Per-trader bucket, multiplier, max trade, label
 *   - Poll interval
 *
 * Stays in .env (security):
 *   - Private key, API creds, dashboard password
 *   - Core risk limits (equity stop-loss, daily loss limit)
 */

const fs = require('fs');
const path = require('path');
const log = require('./logger');
const { config } = require('./config');

const HOT_CONFIG_PATH = path.join(__dirname, '..', 'data', 'hot-config.json');

let hotConfig = {
  traders: [],
  pollInterval: config.bot.pollInterval,
  version: 1,
  updatedAt: null,
};

/**
 * Load hot config from disk, or initialize from .env defaults
 */
function load() {
  try {
    if (fs.existsSync(HOT_CONFIG_PATH)) {
      const raw = fs.readFileSync(HOT_CONFIG_PATH, 'utf8');
      hotConfig = JSON.parse(raw);
      log.info(`Hot config loaded: ${hotConfig.traders.length} trader(s)`);
    } else {
      // First run — seed from .env
      hotConfig = {
        traders: [],
        pollInterval: config.bot.pollInterval,
        version: 1,
        updatedAt: new Date().toISOString(),
      };

      for (const addr of config.traders.grinders) {
        hotConfig.traders.push({
          address: addr.toLowerCase(),
          bucket: 'grinder',
          multiplier: config.sizing.grinderMultiplier,
          maxTrade: config.caps.maxGrinderTrade,
          enabled: true,
          label: '',
          addedAt: new Date().toISOString(),
        });
      }

      for (const addr of config.traders.events) {
        hotConfig.traders.push({
          address: addr.toLowerCase(),
          bucket: 'event',
          multiplier: config.sizing.eventMultiplier,
          maxTrade: config.caps.maxEventTrade,
          enabled: true,
          label: '',
          addedAt: new Date().toISOString(),
        });
      }

      save();
      log.info(`Hot config initialized from .env: ${hotConfig.traders.length} trader(s)`);
    }
  } catch (err) {
    log.error(`Hot config load failed: ${err.message}`);
  }
}

/**
 * Persist hot config to disk
 */
function save() {
  try {
    hotConfig.updatedAt = new Date().toISOString();
    const dir = path.dirname(HOT_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HOT_CONFIG_PATH, JSON.stringify(hotConfig, null, 2));
  } catch (err) {
    log.error(`Hot config save failed: ${err.message}`);
  }
}

// ─── Trader CRUD ───────────────────────────────

function getTraders() {
  return hotConfig.traders;
}

function getActiveTraders() {
  return hotConfig.traders.filter(t => t.enabled);
}

function getActiveAddresses() {
  return hotConfig.traders.filter(t => t.enabled).map(t => t.address);
}

function getActiveGrinders() {
  return hotConfig.traders
    .filter(t => t.enabled && t.bucket === 'grinder')
    .map(t => t.address);
}

function getActiveEvents() {
  return hotConfig.traders
    .filter(t => t.enabled && t.bucket === 'event')
    .map(t => t.address);
}

function getTraderConfig(address) {
  return hotConfig.traders.find(t => t.address === address.toLowerCase()) || null;
}

function addTrader(address, bucket, label) {
  // Validate address
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { error: 'Invalid Ethereum address (must be 0x + 40 hex chars)' };
  }

  if (!['grinder', 'event'].includes(bucket)) {
    return { error: 'Bucket must be "grinder" or "event"' };
  }

  const addr = address.toLowerCase();
  if (hotConfig.traders.find(t => t.address === addr)) {
    return { error: 'Trader already exists' };
  }

  const trader = {
    address: addr,
    bucket,
    multiplier: bucket === 'grinder'
      ? config.sizing.grinderMultiplier
      : config.sizing.eventMultiplier,
    maxTrade: bucket === 'grinder'
      ? config.caps.maxGrinderTrade
      : config.caps.maxEventTrade,
    enabled: true,
    label: String(label || '').slice(0, 32),
    addedAt: new Date().toISOString(),
  };

  hotConfig.traders.push(trader);
  save();
  log.info(`Trader added: ${addr.slice(0, 10)}... [${bucket}] "${trader.label}"`);
  return { success: true, trader };
}

function removeTrader(address) {
  const addr = address.toLowerCase();
  const idx = hotConfig.traders.findIndex(t => t.address === addr);
  if (idx === -1) return { error: 'Trader not found' };

  const removed = hotConfig.traders.splice(idx, 1)[0];
  save();
  log.info(`Trader removed: ${addr.slice(0, 10)}... [${removed.bucket}]`);
  return { success: true, removed };
}

function updateTrader(address, updates) {
  const addr = address.toLowerCase();
  const trader = hotConfig.traders.find(t => t.address === addr);
  if (!trader) return { error: 'Trader not found' };

  if (updates.enabled !== undefined) {
    trader.enabled = Boolean(updates.enabled);
  }
  if (updates.bucket && ['grinder', 'event'].includes(updates.bucket)) {
    trader.bucket = updates.bucket;
  }
  if (updates.multiplier !== undefined) {
    trader.multiplier = Math.max(0.01, Math.min(2.0, parseFloat(updates.multiplier) || 0.15));
  }
  if (updates.maxTrade !== undefined) {
    trader.maxTrade = Math.max(1, Math.min(50, parseFloat(updates.maxTrade) || 5));
  }
  if (updates.label !== undefined) {
    trader.label = String(updates.label).slice(0, 32);
  }

  save();
  log.info(`Trader updated: ${addr.slice(0, 10)}... → ${JSON.stringify(updates)}`);
  return { success: true, trader };
}

// ─── Settings ──────────────────────────────────

function getPollInterval() {
  return hotConfig.pollInterval || config.bot.pollInterval;
}

function setPollInterval(ms) {
  ms = Math.max(5000, Math.min(60000, parseInt(ms) || 10000));
  hotConfig.pollInterval = ms;
  save();
  log.info(`Poll interval changed to ${ms / 1000}s`);
  return ms;
}

// ─── Hot-config bucket/multiplier helpers ──────

function getBucketForTrader(address) {
  const t = getTraderConfig(address);
  return t ? t.bucket : null;
}

function getMultiplierForTrader(address) {
  const t = getTraderConfig(address);
  if (!t) return 0;
  return t.multiplier;
}

function getMaxTradeForTrader(address) {
  const t = getTraderConfig(address);
  if (!t) return 0;
  return t.maxTrade;
}

module.exports = {
  load,
  save,
  getTraders,
  getActiveTraders,
  getActiveAddresses,
  getActiveGrinders,
  getActiveEvents,
  getTraderConfig,
  addTrader,
  removeTrader,
  updateTrader,
  getPollInterval,
  setPollInterval,
  getBucketForTrader,
  getMultiplierForTrader,
  getMaxTradeForTrader,
};
