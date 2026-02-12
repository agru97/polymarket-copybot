#!/usr/bin/env node
/**
 * Frontend Design Dev Server
 *
 * Serves the dashboard with MOCK API responses so you can preview
 * the full UI (login, KPIs, risk bars, trade log, etc.) without
 * running the full bot. Perfect for design iteration.
 *
 * Usage: node dev-dashboard.js
 * Then open http://localhost:3001 (or PORT env)
 * Password: changeme123 (or any — mock accepts it)
 */

const express = require('express');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3001', 10);
const MOCK_PASSWORD = 'changeme123';
const MOCK_TOKEN = 'dev-mock-token-12345';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Generate mock recent snapshots (24 hourly points)
function generateSnapshots() {
  const snapshots = [];
  const now = Date.now();
  let equity = 15.30;
  let totalPnl = 0;

  for (let i = 23; i >= 0; i--) {
    const change = (Math.random() - 0.4) * 0.3;
    equity += change;
    totalPnl += change;
    const exposure = 1 + Math.random() * 5;
    snapshots.push({
      timestamp: new Date(now - i * 3600000).toISOString(),
      equity: parseFloat(equity.toFixed(2)),
      open_positions: Math.floor(Math.random() * 3) + 1,
      total_exposure: parseFloat(exposure.toFixed(2)),
      daily_pnl: parseFloat(change.toFixed(2)),
      total_pnl: parseFloat(totalPnl.toFixed(2)),
    });
  }
  return snapshots;
}

// Mock login — accept any password for dev
app.post('/api/login', (req, res) => {
  res.json({ token: MOCK_TOKEN });
});

// Auth middleware for mock
app.use('/api', (req, res, next) => {
  if (req.path === '/login' || req.path === '/health') return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token === MOCK_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

// Mock API responses
app.get('/api/stats', (req, res) => {
  res.json({
    equity: 16.70,
    dryRun: true,
    bot: {
      state: 'running',
      cycleCount: 142,
      uptime: 3600000,
      pauseReason: null,
      consecutiveErrors: 0,
    },
    risk: {
      equity: 16.70,
      openPositions: 2,
      maxPositions: 10,
      totalExposure: 4.80,
      maxExposure: 16.70,
      dailyPnl: 0.62,
      dailyLossLimit: 4,
      equityStopLoss: 10,
      isEquityStopped: false,
      isDailyLossStopped: false,
      isCooldownActive: false,
      cooldownEndsAt: null,
      minTradeSize: 0.50,
      maxPerTrade: 3.34,
      priceRange: [0.05, 0.97],
      maxDrawdown: 8.3,
      currentDrawdown: 2.1,
      healthScore: 9,
    },
    stats: {
      totalPnl: 1.42,
      wins: 8,
      losses: 3,
      total: 11,
      profitFactor: 1.82,
      dailyPnl: [
        { day: '2026-02-06', pnl: -0.35, trades: 2 },
        { day: '2026-02-07', pnl: 0.52, trades: 3 },
        { day: '2026-02-08', pnl: 0.28, trades: 2 },
        { day: '2026-02-09', pnl: -0.18, trades: 1 },
        { day: '2026-02-10', pnl: 0.41, trades: 3 },
        { day: '2026-02-11', pnl: 0.12, trades: 2 },
        { day: '2026-02-12', pnl: 0.62, trades: 4 },
      ],
      byBucket: [
        { bucket: 'event', pnl: 0.92, count: 7 },
        { bucket: 'grinder', pnl: 0.50, count: 4 },
      ],
      byTrader: [
        { trader_address: '0xdb27bf2ac5d428a9c63dbc914611036855a6c56e', count: 4, pnl: 0.50 },
        { trader_address: '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee', count: 3, pnl: 0.48 },
        { trader_address: '0x14964aefa2cd7caff7878b3820a690a03c5aa429', count: 2, pnl: 0.32 },
        { trader_address: '0xc2e7800b5af46e6093872b177b7a5e7f0563be51', count: 2, pnl: 0.12 },
      ],
      recentSnapshots: generateSnapshots(),
    },
    pollInterval: 10000,
  });
});

// Generate mock trades for pagination testing
const MOCK_TRADES = (() => {
  const statuses = ['executed', 'simulated', 'risk_blocked', 'failed', 'executed', 'simulated', 'executed'];
  const markets = ['Rams vs. Bears', 'Will Liverpool FC win?', 'Patriots vs. Broncos', 'Bitcoin above $100K by March?', 'Thunder vs. Warriors', 'ETH above $4K in Feb?', 'Super Bowl LVIX Winner', 'Lakers vs. 76ers', 'Celtics vs. Heat', 'Gold above $2500?'];
  const sides = ['Yes', 'No', 'CLOSE_Yes', 'CLOSE_No', 'Warriors', 'Bears', 'Chiefs'];
  const traders = ['0xdb27bf2ac5d428a9c63dbc914611036855a6c56e', '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee', '0x14964aefa2cd7caff7878b3820a690a03c5aa429', '0xc2e7800b5af46e6093872b177b7a5e7f0563be51'];
  const buckets = ['grinder', 'event', 'event', 'event'];
  const trades = [];
  const now = Date.now();
  for (let i = 0; i < 73; i++) {
    const status = statuses[i % statuses.length];
    const pnl = status === 'executed' || status === 'simulated' ? parseFloat(((Math.random() - 0.4) * 0.8).toFixed(2)) : 0;
    trades.push({
      timestamp: new Date(now - i * 600000).toISOString().replace('Z', ''),
      trader_address: traders[i % traders.length],
      bucket: buckets[i % buckets.length],
      market_id: `0x${(1000 + i).toString(16)}`,
      market_name: markets[i % markets.length],
      side: sides[i % sides.length],
      price: parseFloat((0.1 + Math.random() * 0.8).toFixed(2)),
      size_usd: parseFloat((0.50 + Math.random() * 2.84).toFixed(2)),
      pnl,
      resolved: pnl !== 0 ? 1 : 0,
      status,
      notes: status === 'risk_blocked' ? 'Total exposure would exceed limit' : `Mock trade #${i + 1}`,
    });
  }
  return trades;
})();

app.get('/api/trades', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize) || 25), 100);
  const offset = (page - 1) * pageSize;
  const trades = MOCK_TRADES.slice(offset, offset + pageSize);
  res.json({ trades, total: MOCK_TRADES.length, page, pageSize });
});

app.get('/api/traders', (req, res) => {
  res.json({
    traders: [
      { address: '0xdb27bf2ac5d428a9c63dbc914611036855a6c56e', bucket: 'grinder', enabled: true, multiplier: 0.01, maxTrade: 2.50, label: 'DrPufferfish', addedAt: '2026-02-12' },
      { address: '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee', bucket: 'event', enabled: true, multiplier: 0.01, maxTrade: 3.34, label: 'kch123', addedAt: '2026-02-12' },
      { address: '0x14964aefa2cd7caff7878b3820a690a03c5aa429', bucket: 'event', enabled: true, multiplier: 0.01, maxTrade: 3.34, label: 'gmpm', addedAt: '2026-02-12' },
      { address: '0xc2e7800b5af46e6093872b177b7a5e7f0563be51', bucket: 'event', enabled: true, multiplier: 0.01, maxTrade: 2.00, label: 'beachboy4', addedAt: '2026-02-12' },
    ],
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    caps: { maxTotalExposure: 16.70, maxGrinderTrade: 2.50, maxEventTrade: 3.34, maxOpenPositions: 10 },
    risk: { dailyLossLimit: 4, equityStopLoss: 10, slippageTolerance: 3, minTradeSize: 0.50, minPrice: 0.05, maxPrice: 0.97 },
    sizing: { grinderMultiplier: 0.01, eventMultiplier: 0.01 },
  });
});

app.get('/api/audit-log', (req, res) => {
  res.json([
    { timestamp: '2025-02-11T19:33:00Z', action: 'login', actor: 'admin', details: 'Dashboard login', ip: '127.0.0.1' },
    { timestamp: '2025-02-11T18:15:00Z', action: 'settings_update', actor: 'admin', details: 'Updated maxTotalExposure: 80 → 90', ip: '127.0.0.1' },
    { timestamp: '2025-02-11T17:00:00Z', action: 'trader_add', actor: 'admin', details: 'Added 0xabcd...ef12 (grinder)', ip: '127.0.0.1' },
    { timestamp: '2025-02-11T16:30:00Z', action: 'pause', actor: 'admin', details: 'Manual pause', ip: '127.0.0.1' },
    { timestamp: '2025-02-11T16:32:00Z', action: 'resume', actor: 'admin', details: 'Manual resume', ip: '127.0.0.1' },
    { timestamp: '2025-02-10T22:00:00Z', action: 'trader_update', actor: 'admin', details: 'Disabled 0xdb27...cdef', ip: '127.0.0.1' },
    { timestamp: '2025-02-10T14:00:00Z', action: 'login', actor: 'admin', details: 'Dashboard login', ip: '192.168.1.5' },
  ]);
});

// CSV export mocks
function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','));
  return lines.join('\n');
}
app.get('/api/exports/trades', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="trades_mock.csv"`);
  res.send(toCsv(MOCK_TRADES));
});
app.get('/api/exports/activity', (req, res) => {
  const entries = [
    { timestamp: '2025-02-11T19:33:00Z', action: 'login', actor: 'admin', details: 'Dashboard login', ip: '127.0.0.1' },
    { timestamp: '2025-02-11T18:15:00Z', action: 'settings_update', actor: 'admin', details: 'Updated maxTotalExposure', ip: '127.0.0.1' },
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="activity_mock.csv"`);
  res.send(toCsv(entries));
});
app.get('/api/exports/performance', (req, res) => {
  const snapshots = generateSnapshots();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="performance_mock.csv"`);
  res.send(toCsv(snapshots));
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Control endpoints — no-op for dev
app.post('/api/control/:action', (req, res) => res.json({ success: true }));
app.post('/api/traders', (req, res) => res.json({}));
app.patch('/api/traders/:addr', (req, res) => res.json({}));
app.delete('/api/traders/:addr', (req, res) => res.json({}));
app.patch('/api/settings', (req, res) => res.json({ success: true }));
app.get('/api/notifications/status', (req, res) => res.json({ telegramConfigured: false, discordConfigured: false }));
app.patch('/api/notifications', (req, res) => res.json({ success: true, telegramConfigured: !!req.body.telegramBotToken, discordConfigured: !!req.body.discordWebhookUrl }));
app.post('/api/notifications/test', (req, res) => res.json({ success: true }));

// SPA fallback - serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║  DASHBOARD DESIGN DEV SERVER                 ║');
  console.log('  ║  Mock API • No bot required                  ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  → http://localhost:${PORT}  (open in browser to test)`);
  console.log(`  → Password: ${MOCK_PASSWORD} (or any)`);
  console.log('');
  console.log('  React dashboard built to public/ — edit dashboard/ and run build:dashboard to update.');
  console.log('');
});
