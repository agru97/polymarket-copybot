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
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const { config } = require('./config');
const hotConfig = require('./hot-config');
const db = require('./db');
const risk = require('./risk');
const log = require('./logger');
const { botState } = require('./state');
const notifications = require('./notifications');
const C = require('./constants');

function safeError(err) {
  return process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
}

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
  const expected = csrfTokens.get(sessionToken);
  if (!expected || !csrfToken) return false;
  if (expected.length !== csrfToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(csrfToken, 'utf8'));
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

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimits.entries()) {
    if (now > record.resetAt) rateLimits.delete(key);
  }
}, 300000); // Clean up every 5 minutes

// Auth middleware
function requireAuth(req, res, next) {
  // Allow /health without auth
  // Note: middleware is mounted on '/api', so req.path is stripped of the prefix
  if (req.path === '/health') return next();

  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.cookies?.token;

  if (token && token.length === SESSION_TOKEN.length) {
    const tokenBuf = Buffer.from(token, 'utf8');
    const expectedBuf = Buffer.from(SESSION_TOKEN, 'utf8');
    if (crypto.timingSafeEqual(tokenBuf, expectedBuf)) return next();
  }

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
  app.use(helmet({
    contentSecurityPolicy: false,  // Vite-built SPA uses inline scripts & module imports
  }));
  app.use(express.json({ limit: '10kb' }));

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
    const token = req.headers.authorization?.replace('Bearer ', '');
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
    return res.status(403).json({ error: 'CSRF validation failed' });
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
      .update(password + C.SESSION_SALT)
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  app.get('/api/trades', (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize) || 25), 100);
      const offset = (page - 1) * pageSize;
      const { trades, total } = db.getPaginatedTrades(pageSize, offset);
      res.json({ trades, total, page, pageSize });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ─────────────────────────────────
  //  SETTINGS (v2.1 → v2.4: full risk/cap editing)
  // ─────────────────────────────────
  app.patch('/api/settings', (req, res) => {
    try {
      const updated = {};
      const changes = [];

      // Poll interval
      if (req.body.pollInterval !== undefined) {
        updated.pollInterval = hotConfig.setPollInterval(req.body.pollInterval);
        changes.push(`pollInterval → ${updated.pollInterval}ms`);
      }

      // ── Risk limits (write directly to live config) ──
      const riskFields = {
        dailyLossLimit:   { section: 'risk', key: 'dailyLossLimit',   min: 0.5, max: 100000 },
        equityStopLoss:   { section: 'risk', key: 'equityStopLoss',   min: 0,   max: 100000 },
        slippageTolerance:{ section: 'risk', key: 'slippageTolerance', min: 0.1, max: 20 },
        minTradeSize:     { section: 'risk', key: 'minTradeSize',      min: 0.1, max: 100 },
        minPrice:         { section: 'risk', key: 'minPrice',          min: 0.01, max: 0.5 },
        maxPrice:         { section: 'risk', key: 'maxPrice',          min: 0.5,  max: 0.99 },
      };

      const capFields = {
        maxPerTrade:      { section: 'caps', key: 'maxPerTrade',       min: 0.5, max: 100000 },
        maxGrinderTrade:  { section: 'caps', key: 'maxGrinderTrade',   min: 0.5, max: 100000 },
        maxEventTrade:    { section: 'caps', key: 'maxEventTrade',     min: 0.5, max: 100000 },
        maxTotalExposure: { section: 'caps', key: 'maxTotalExposure',  min: 1,   max: 1000000 },
        maxOpenPositions: { section: 'caps', key: 'maxOpenPositions',  min: 1,   max: 100, integer: true },
      };

      const allFields = { ...riskFields, ...capFields };

      for (const [field, spec] of Object.entries(allFields)) {
        if (req.body[field] !== undefined) {
          let val = parseFloat(req.body[field]);
          if (isNaN(val)) continue;
          val = Math.max(spec.min, Math.min(spec.max, val));
          if (spec.integer) val = Math.round(val);
          config[spec.section][spec.key] = val;
          hotConfig.setSettingsOverride(field, val);
          updated[field] = val;
          changes.push(`${field} → ${val}`);
        }
      }

      // ── Sizing multipliers ──
      if (req.body.grinderMultiplier !== undefined) {
        const val = Math.max(0.01, Math.min(5, parseFloat(req.body.grinderMultiplier)));
        if (!isNaN(val)) { config.sizing.grinderMultiplier = val; hotConfig.setSettingsOverride('grinderMultiplier', val); updated.grinderMultiplier = val; changes.push(`grinderMultiplier → ${val}`); }
      }
      if (req.body.eventMultiplier !== undefined) {
        const val = Math.max(0.01, Math.min(5, parseFloat(req.body.eventMultiplier)));
        if (!isNaN(val)) { config.sizing.eventMultiplier = val; hotConfig.setSettingsOverride('eventMultiplier', val); updated.eventMultiplier = val; changes.push(`eventMultiplier → ${val}`); }
      }

      if (changes.length > 0) {
        db.logAudit(C.AUDIT_ACTIONS.SETTINGS_CHANGE, changes.join(', '), 'dashboard', req.ip);
        log.info(`Settings updated from dashboard: ${changes.join(', ')}`);
      }

      res.json({ success: true, ...updated });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ─────────────────────────────────
  //  CSV EXPORTS
  // ─────────────────────────────────
  function toCsv(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map(h => escape(row[h])).join(','));
    }
    return lines.join('\n');
  }

  function sendCsv(res, filename, rows) {
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  app.get('/api/exports/trades', (req, res) => {
    try {
      const trades = db.getAllTrades();
      const date = new Date().toISOString().slice(0, 10);
      sendCsv(res, `trades_${date}.csv`, trades);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  app.get('/api/exports/activity', (req, res) => {
    try {
      const entries = db.getAllAuditLog();
      const date = new Date().toISOString().slice(0, 10);
      sendCsv(res, `activity_${date}.csv`, entries);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  app.get('/api/exports/performance', (req, res) => {
    try {
      const snapshots = db.getAllSnapshots();
      const date = new Date().toISOString().slice(0, 10);
      sendCsv(res, `performance_${date}.csv`, snapshots);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ─────────────────────────────────
  //  NOTIFICATIONS
  // ─────────────────────────────────
  app.get('/api/notifications/status', (req, res) => {
    res.json(notifications.getConfig());
  });

  app.patch('/api/notifications', (req, res) => {
    const { telegramBotToken, telegramChatId, discordWebhookUrl } = req.body;
    notifications.updateConfig({ telegramBotToken, telegramChatId, discordWebhookUrl });
    db.logAudit('notifications_update', 'Notification settings updated', 'admin', req.ip);
    res.json({ success: true, ...notifications.getConfig() });
  });

  app.post('/api/notifications/test', async (req, res) => {
    try {
      await notifications.testNotification();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ─────────────────────────────────
  //  START SERVER
  // ─────────────────────────────────
  const host = process.env.DASHBOARD_HOST || '127.0.0.1';
  const server = app.listen(config.dashboard.port, host, () => {
    log.info(`Dashboard: http://${host}:${config.dashboard.port}`);
    log.info('Dashboard auth token generated');
  });

  // SPA fallback: serve index.html for all non-API routes (client-side routing)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  return server;
}

module.exports = { start };
