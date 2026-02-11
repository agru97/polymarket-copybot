/**
 * Dashboard Server v2.1
 *
 * v2.1 changes:
 *   - Trader management endpoints (add/remove/toggle/update)
 *   - Poll interval control
 *   - Hot-config integration
 *
 * Inherited from v2.0:
 *   - Password authentication (Bearer token)
 *   - Bot control endpoints (pause, resume, emergency stop)
 *   - Health check endpoint for monitoring
 *   - Rate limiting on API endpoints
 *   - Input sanitization
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { config } = require('./config');
const hotConfig = require('./hot-config');
const db = require('./db');
const risk = require('./risk');
const log = require('./logger');
const { botState } = require('./state');

// Generate session token from password
const SESSION_TOKEN = crypto
  .createHash('sha256')
  .update(config.dashboard.password + 'polymarket-bot-salt')
  .digest('hex')
  .slice(0, 32);

// Simple rate limiter
const rateLimits = new Map();
function rateLimit(ip, maxPerMinute = 60) {
  const now = Date.now();
  const key = ip;
  const record = rateLimits.get(key) || { count: 0, resetAt: now + 60000 };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + 60000;
  }
  record.count++;
  rateLimits.set(key, record);
  return record.count > maxPerMinute;
}

// Auth middleware
function requireAuth(req, res, next) {
  // Allow /health without auth
  if (req.path === '/api/health') return next();

  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.query.token ||
                req.cookies?.token;

  if (token === SESSION_TOKEN) return next();

  // Check if login request
  if (req.path === '/api/login') return next();

  res.status(401).json({ error: 'Unauthorized — provide dashboard password' });
}

let getEquityFn = () => 0;
let setEquityFn = () => {};

function start(getEquity, setEquity) {
  getEquityFn = getEquity || getEquityFn;
  setEquityFn = setEquity || setEquityFn;

  const app = express();
  app.use(express.json());

  // Rate limiting
  app.use((req, res, next) => {
    if (rateLimit(req.ip, 120)) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  });

  // Static files (dashboard UI)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Auth on API routes
  app.use('/api', requireAuth);

  // ─────────────────────────────────
  //  AUTH
  // ─────────────────────────────────
  app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === config.dashboard.password) {
      res.json({ token: SESSION_TOKEN });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  });

  // ─────────────────────────────────
  //  HEALTH (no auth required)
  // ─────────────────────────────────
  app.get('/api/health', (req, res) => {
    const status = botState.getStatus();
    res.json({
      status: 'ok',
      botState: status.state,
      uptime: status.uptime,
      lastCycle: status.lastCycleAt,
      cycles: status.cycleCount,
      errors: status.consecutiveErrors,
    });
  });

  // ─────────────────────────────────
  //  READ ENDPOINTS
  // ─────────────────────────────────
  app.get('/api/stats', (req, res) => {
    try {
      const stats = db.getTradeStats();
      const positions = db.getOpenPositions();
      const equity = getEquityFn();
      const riskStatus = risk.getRiskStatus(equity);
      const botStatus = botState.getStatus();
      res.json({
        stats, positions,
        risk: riskStatus,
        dryRun: config.bot.dryRun,
        bot: botStatus,
        equity,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/trades', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const trades = db.getRecentTrades(limit);
      res.json(trades);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/config', (req, res) => {
    // Safe config — no secrets
    const traders = hotConfig.getTraders();
    res.json({
      dryRun: config.bot.dryRun,
      traders: traders.map(t => ({
        address: t.address,
        bucket: t.bucket,
        multiplier: t.multiplier,
        maxTrade: t.maxTrade,
        enabled: t.enabled,
        label: t.label,
        addedAt: t.addedAt,
      })),
      activeTraders: hotConfig.getActiveTraders().length,
      totalTraders: traders.length,
      sizing: config.sizing,
      caps: config.caps,
      risk: config.risk,
      pollInterval: hotConfig.getPollInterval(),
    });
  });

  app.get('/api/positions', (req, res) => {
    try {
      res.json(db.getOpenPositions());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────
  //  BOT CONTROL ENDPOINTS
  // ─────────────────────────────────
  app.post('/api/control/pause', (req, res) => {
    const reason = req.body.reason || 'Paused from dashboard';
    botState.pause(reason);
    log.warn(`BOT PAUSED from dashboard: ${reason}`);
    res.json({ success: true, state: botState.state });
  });

  app.post('/api/control/resume', (req, res) => {
    botState.resume();
    log.info('BOT RESUMED from dashboard');
    res.json({ success: true, state: botState.state });
  });

  app.post('/api/control/emergency-stop', (req, res) => {
    const reason = req.body.reason || 'Emergency stop from dashboard';
    botState.emergencyStop(reason);
    log.error(`EMERGENCY STOP from dashboard: ${reason}`);
    res.json({ success: true, state: botState.state });
  });

  // ─────────────────────────────────
  //  TRADER MANAGEMENT (v2.1)
  // ─────────────────────────────────

  // List all traders
  app.get('/api/traders', (req, res) => {
    try {
      const traders = hotConfig.getTraders();
      res.json({ traders, total: traders.length, active: traders.filter(t => t.enabled).length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add a trader
  app.post('/api/traders', (req, res) => {
    try {
      const { address, bucket, label } = req.body;
      if (!address) return res.status(400).json({ error: 'Address is required' });
      if (!bucket) return res.status(400).json({ error: 'Bucket is required (grinder or event)' });

      const result = hotConfig.addTrader(address, bucket, label);
      if (result.error) return res.status(400).json(result);

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update a trader
  app.patch('/api/traders/:address', (req, res) => {
    try {
      const { address } = req.params;
      const updates = req.body;

      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      const result = hotConfig.updateTrader(address, updates);
      if (result.error) return res.status(404).json(result);

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove a trader
  app.delete('/api/traders/:address', (req, res) => {
    try {
      const { address } = req.params;
      const result = hotConfig.removeTrader(address);
      if (result.error) return res.status(404).json(result);

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────
  //  SETTINGS (v2.1)
  // ─────────────────────────────────
  app.patch('/api/settings', (req, res) => {
    try {
      const { pollInterval } = req.body;
      const updated = {};

      if (pollInterval !== undefined) {
        updated.pollInterval = hotConfig.setPollInterval(pollInterval);
      }

      res.json({ success: true, ...updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────
  //  START SERVER
  // ─────────────────────────────────
  app.listen(config.dashboard.port, '0.0.0.0', () => {
    log.info(`Dashboard: http://0.0.0.0:${config.dashboard.port}`);
    log.info(`Auth token: ${SESSION_TOKEN.slice(0, 8)}...`);
  });
}

module.exports = { start };
