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
  let equity = 80;
  let totalPnl = 0;

  for (let i = 23; i >= 0; i--) {
    const change = (Math.random() - 0.4) * 2;
    equity += change;
    totalPnl += change;
    const exposure = 8 + Math.random() * 10;
    snapshots.push({
      timestamp: new Date(now - i * 3600000).toISOString(),
      equity: parseFloat(equity.toFixed(2)),
      open_positions: Math.floor(Math.random() * 4) + 1,
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
    equity: 87.34,
    dryRun: true,
    bot: {
      state: 'running',
      cycleCount: 142,
      uptime: 3600000,
      pauseReason: null,
      consecutiveErrors: 0,
    },
    risk: {
      equity: 87.34,
      openPositions: 2,
      maxPositions: 8,
      totalExposure: 12.50,
      maxExposure: 90,
      dailyPnl: 2.40,
      dailyLossLimit: 15,
      equityStopLoss: 70,
    },
    stats: {
      totalPnl: 5.20,
      wins: 8,
      losses: 3,
      total: 11,
      dailyPnl: [
        { day: '2025-02-05', pnl: -1.20, trades: 2 },
        { day: '2025-02-06', pnl: 2.10, trades: 4 },
        { day: '2025-02-07', pnl: 0.80, trades: 2 },
        { day: '2025-02-08', pnl: -0.50, trades: 1 },
        { day: '2025-02-09', pnl: 1.40, trades: 3 },
        { day: '2025-02-10', pnl: 0.60, trades: 2 },
        { day: '2025-02-11', pnl: 2.40, trades: 5 },
      ],
      byBucket: [
        { bucket: 'event', pnl: 4.20, count: 7 },
        { bucket: 'grinder', pnl: 1.00, count: 4 },
      ],
      byTrader: [
        { trader_address: '0xdb27c56e1234567890abcdef', count: 8, pnl: 3.50 },
        { trader_address: '0xabcdef1234567890abcdef12', count: 3, pnl: 1.70 },
      ],
      recentSnapshots: generateSnapshots(),
    },
    pollInterval: 10000,
  });
});

app.get('/api/trades', (req, res) => {
  res.json([
    { timestamp: '2025-02-11T19:33:00', trader_address: '0xdb27c56e1234567890abcdef', bucket: 'event', market_id: '0xd08c51ab1d', market_name: 'Rams vs. Bears', side: 'CLOSE_Bears', price: 0.34, size_usd: 3.34, status: 'simulated', notes: 'Simulated close. 9.82 tokens. PnL: $0.42' },
    { timestamp: '2025-02-11T19:33:00', trader_address: '0xdb27c56e1234567890abcdef', bucket: 'event', market_id: '0xab4fab2240', market_name: 'Will Liverpool FC win?', side: 'CLOSE_No', price: 0.48, size_usd: 3.34, status: 'simulated', notes: 'Simulated close. 6.94 tokens. PnL: $-0.12' },
    { timestamp: '2025-02-11T19:33:00', trader_address: '0xdb27c56e1234567890abcdef', bucket: 'event', market_id: '0x393557eaf4', market_name: 'Patriots vs. Broncos', side: 'CLOSE_Broncos', price: 0.33, size_usd: 3.34, status: 'simulated', notes: 'Simulated close. 10.04 tokens. PnL: $0.55' },
    { timestamp: '2025-02-11T19:30:00', trader_address: '0xabcdef1234567890abcdef12', bucket: 'grinder', market_id: '0xaa11bb22', market_name: 'Bitcoin above $100K by March?', side: 'Yes', price: 0.62, size_usd: 2.10, status: 'executed', notes: 'Filled at 0.62' },
    { timestamp: '2025-02-11T19:28:00', trader_address: '0xdb27c56e1234567890abcdef', bucket: 'event', market_id: '0x1234', market_name: 'Thunder vs. Warriors', side: 'Warriors', price: 0.18, size_usd: 3.34, status: 'risk_blocked', notes: 'Total exposure ($20.04) would exceed limit ($16.7)' },
    { timestamp: '2025-02-11T19:28:00', trader_address: '0xdb27c56e1234567890abcdef', bucket: 'event', market_id: '0x5678', market_name: 'Lakers vs. 76ers', side: '76ers', price: 0.41, size_usd: 0, status: 'no_position', notes: 'No matching open position found' },
    { timestamp: '2025-02-11T19:20:00', trader_address: '0xabcdef1234567890abcdef12', bucket: 'grinder', market_id: '0xcc33dd44', market_name: 'ETH above $4K in Feb?', side: 'No', price: 0.75, size_usd: 1.80, status: 'executed', notes: 'Filled at 0.75' },
    { timestamp: '2025-02-11T19:15:00', trader_address: '0xdb27c56e1234567890abcdef', bucket: 'event', market_id: '0xee55ff66', market_name: 'Super Bowl LVIX Winner', side: 'Chiefs', price: 0.55, size_usd: 4.20, status: 'executed', notes: 'Filled at 0.55' },
  ]);
});

app.get('/api/traders', (req, res) => {
  res.json({
    traders: [
      { address: '0xdb27c56e1234567890abcdef', bucket: 'event', enabled: true, multiplier: 0.25, maxTrade: 8, label: 'Alpha', addedAt: '2025-02-01' },
      { address: '0xabcdef1234567890abcdef12', bucket: 'grinder', enabled: true, multiplier: 0.15, maxTrade: 4, label: '', addedAt: '2025-02-05' },
    ],
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    caps: { maxTotalExposure: 90, maxGrinderTrade: 4, maxEventTrade: 8, maxOpenPositions: 8 },
    risk: { dailyLossLimit: 15, equityStopLoss: 70, slippageTolerance: 2, minTradeSize: 2, minPrice: 0.08, maxPrice: 0.97 },
    sizing: { grinderMultiplier: 0.15, eventMultiplier: 0.25 },
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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Control endpoints — no-op for dev
app.post('/api/control/:action', (req, res) => res.json({ success: true }));
app.post('/api/traders', (req, res) => res.json({}));
app.patch('/api/traders/:addr', (req, res) => res.json({}));
app.delete('/api/traders/:addr', (req, res) => res.json({}));
app.patch('/api/settings', (req, res) => res.json({ success: true }));

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
