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
const C = require('./constants');

// Generate session token from password
const SESSION_TOKEN = crypto
  .createHash('sha256')
  .update(config.dashboard.password + C.SESSION_SALT)
  .digest('hex')
  .slice(0, 32);

// CSRF tokens: per-session tokens to prevent cross-site request forgery
const csrfTokens = new Map(); // sessionToken → csrfToken
function generateCsrfToken(sessionToken) {
  const token = crypto.randomBytes(C.CSRF_TOKEN_LENGTH).toString('hex');
  csrfTokens.set(sessionToken, token);
  return token;
}
function validateCsrf(sessionToken, csrfToken) {
  return csrfTokens.get(sessionToken) === csrfToken;
}

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
  // Note: middleware is mounted on '/api', so req.path is stripped of the prefix
  if (req.path === '/health') return next();

  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.query.token ||
                req.cookies?.token;

  if (token === SESSION_TOKEN) return next();

  // Check if login request (req.path is relative to /api mount)
  if (req.path === '/login') return next();

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
    if (rateLimit(req.ip, C.RATE_LIMIT_PER_MINUTE)) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  });

  // CSRF protection on state-changing methods
  app.use('/api', (req, res, next) => {
    // Skip CSRF for safe methods (GET, HEAD, OPTIONS) and login
    // Note: mounted on '/api', so req.path is relative (e.g. '/login' not '/api/login')
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/login') {
      return next();
    }
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;
    if (token && csrfToken && validateCsrf(token, csrfToken)) {
      return next();
    }
    // Allow if CSRF not yet provisioned (first request after login)
    if (token === SESSION_TOKEN && !csrfTokens.has(token)) {
      return next();
    }
    if (csrfTokens.has(token)) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    next(); // No CSRF required if no session yet
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
    if (!password || typeof password !== 'string') {
      return res.status(401).json({ error: 'Invalid password' });
    }
    // Constant-time comparison to prevent timing attacks (audit fix)
    const inputHash = crypto
      .createHash('sha256')
      .update(password + 'polymarket-bot-salt')
      .digest('hex')
      .slice(0, 32);
    const tokenBuf = Buffer.from(SESSION_TOKEN, 'utf8');
    const inputBuf = Buffer.from(inputHash, 'utf8');
    if (tokenBuf.length === inputBuf.length && crypto.timingSafeEqual(tokenBuf, inputBuf)) {
      const csrfToken = generateCsrfToken(SESSION_TOKEN);
      db.logAudit(C.AUDIT_ACTIONS.LOGIN_SUCCESS, '', 'dashboard', req.ip);
      res.json({ token: SESSION_TOKEN, csrfToken });
    } else {
      db.logAudit(C.AUDIT_ACTIONS.LOGIN_FAILED, '', 'dashboard', req.ip);
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
    db.logAudit(C.AUDIT_ACTIONS.BOT_PAUSE, reason, 'dashboard', req.ip);
    log.warn(`BOT PAUSED from dashboard: ${reason}`);
    res.json({ success: true, state: botState.state });
  });

  app.post('/api/control/resume', (req, res) => {
    botState.resume();
    db.logAudit(C.AUDIT_ACTIONS.BOT_RESUME, '', 'dashboard', req.ip);
    log.info('BOT RESUMED from dashboard');
    res.json({ success: true, state: botState.state });
  });

  app.post('/api/control/emergency-stop', (req, res) => {
    const reason = req.body.reason || 'Emergency stop from dashboard';
    botState.emergencyStop(reason);
    db.logAudit(C.AUDIT_ACTIONS.BOT_EMERGENCY_STOP, reason, 'dashboard', req.ip);
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

      db.logAudit(C.AUDIT_ACTIONS.TRADER_ADD, `${address.slice(0, 10)}... [${bucket}]`, 'dashboard', req.ip);
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

      db.logAudit(C.AUDIT_ACTIONS.TRADER_UPDATE, `${address.slice(0, 10)}... → ${JSON.stringify(updates)}`, 'dashboard', req.ip);
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

      db.logAudit(C.AUDIT_ACTIONS.TRADER_REMOVE, `${address.slice(0, 10)}...`, 'dashboard', req.ip);
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
        db.logAudit(C.AUDIT_ACTIONS.SETTINGS_CHANGE, `pollInterval → ${updated.pollInterval}ms`, 'dashboard', req.ip);
      }

      res.json({ success: true, ...updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────
  //  AUDIT LOG (v2.3)
  // ─────────────────────────────────
  app.get('/api/audit-log', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const auditLog = db.getAuditLog(limit);
      res.json(auditLog);
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
