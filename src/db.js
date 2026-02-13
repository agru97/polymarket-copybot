const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'bot.db');

let db;

function init() {
  const fs = require('fs');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      trader_address TEXT NOT NULL,
      bucket TEXT NOT NULL,
      market_id TEXT NOT NULL,
      market_name TEXT DEFAULT '',
      side TEXT NOT NULL,
      price REAL NOT NULL,
      size_usd REAL NOT NULL,
      leader_size_usd REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      order_id TEXT DEFAULT '',
      pnl REAL DEFAULT 0,
      resolved INTEGER DEFAULT 0,
      dry_run INTEGER DEFAULT 0,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      side TEXT NOT NULL,
      entry_price REAL NOT NULL,
      size_usd REAL NOT NULL,
      current_price REAL DEFAULT 0,
      unrealized_pnl REAL DEFAULT 0,
      trader_address TEXT NOT NULL,
      bucket TEXT NOT NULL,
      opened_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT DEFAULT NULL,
      status TEXT DEFAULT 'open'
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      equity REAL NOT NULL,
      open_positions INTEGER NOT NULL,
      total_exposure REAL NOT NULL,
      daily_pnl REAL NOT NULL,
      total_pnl REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trader_positions (
      trader_address TEXT NOT NULL,
      market_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      side TEXT NOT NULL,
      size REAL NOT NULL,
      price REAL NOT NULL,
      last_seen TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (trader_address, market_id, token_id)
    );

    CREATE TABLE IF NOT EXISTS signal_dedup (
      dedup_key TEXT PRIMARY KEY,
      processed_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      action TEXT NOT NULL,
      actor TEXT DEFAULT 'system',
      details TEXT DEFAULT '',
      ip_address TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_signal_dedup_expires ON signal_dedup(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
    CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
    CREATE INDEX IF NOT EXISTS idx_positions_market_token_status ON positions(market_id, token_id, status);
    CREATE INDEX IF NOT EXISTS idx_trades_market_status_resolved ON trades(market_id, status, resolved);
  `);

  return db;
}

function getDb() {
  if (!db) init();
  return db;
}

// --- Trade logging ---
function logTrade(trade) {
  const d = getDb();
  const pnl = trade.pnl || 0;
  const resolved = pnl !== 0 ? 1 : 0; // Auto-resolve trades with known PnL
  return d.prepare(`
    INSERT INTO trades (trader_address, bucket, market_id, market_name, side, price, size_usd, leader_size_usd, status, order_id, dry_run, notes, pnl, resolved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    trade.traderAddress, trade.bucket, trade.marketId, trade.marketName || '',
    trade.side, trade.price, trade.sizeUsd, trade.leaderSizeUsd || 0,
    trade.status || 'executed', trade.orderId || '', trade.dryRun ? 1 : 0, trade.notes || '',
    pnl, resolved
  );
}

// --- Position tracking ---
/**
 * Upsert position: accumulate size with weighted average entry price
 * (Audit fix: was ON CONFLICT DO NOTHING — silently dropped duplicate entries)
 * Now properly accumulates when buying more of the same market
 */
function upsertPosition(pos) {
  const d = getDb();
  const _upsert = d.transaction((pos) => {
    const existing = d.prepare(
      `SELECT * FROM positions WHERE market_id = ? AND token_id = ? AND status = 'open' LIMIT 1`
    ).get(pos.marketId, pos.tokenId);

    if (existing) {
      const oldSize = existing.size_usd;
      const newSize = oldSize + pos.sizeUsd;
      const weightedEntry = ((existing.entry_price * oldSize) + (pos.entryPrice * pos.sizeUsd)) / newSize;
      d.prepare(`
        UPDATE positions SET size_usd = ?, entry_price = ?, current_price = ? WHERE id = ?
      `).run(
        Math.round(newSize * 100) / 100,
        Math.round(weightedEntry * 10000) / 10000,
        pos.entryPrice,
        existing.id
      );
    } else {
      d.prepare(`
        INSERT INTO positions (market_id, token_id, side, entry_price, size_usd, trader_address, bucket)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(pos.marketId, pos.tokenId, pos.side, pos.entryPrice, pos.sizeUsd, pos.traderAddress, pos.bucket);
    }
  });
  _upsert(pos);
}

function getOpenPositions() {
  return getDb().prepare(`SELECT * FROM positions WHERE status = 'open'`).all();
}

function closePosition(marketId, tokenId) {
  getDb().prepare(`UPDATE positions SET status = 'closed', closed_at = datetime('now') WHERE market_id = ? AND token_id = ? AND status = 'open'`).run(marketId, tokenId);
}

/**
 * Find an open position by market and token
 * (Novus-Tech pattern: look up position to calculate proportional sell)
 */
function getOpenPositionByMarket(marketId, tokenId) {
  if (tokenId) {
    return getDb().prepare(
      `SELECT * FROM positions WHERE market_id = ? AND token_id = ? AND status = 'open' LIMIT 1`
    ).get(marketId, tokenId);
  }
  return getDb().prepare(
    `SELECT * FROM positions WHERE market_id = ? AND status = 'open' LIMIT 1`
  ).get(marketId);
}

/**
 * Close a position and record PnL
 * (Professional pattern from Novus-Tech: track entry/exit + realized PnL)
 */
function closePositionWithPnl(marketId, tokenId, exitPrice, pnl) {
  const d = getDb();
  const _close = d.transaction(() => {
    d.prepare(`
      UPDATE positions SET status = 'closed', closed_at = datetime('now'), current_price = ?, unrealized_pnl = ?
      WHERE market_id = ? AND token_id = ? AND status = 'open'
    `).run(exitPrice, pnl, marketId, tokenId);

    d.prepare(`
      UPDATE trades SET pnl = ?, resolved = 1
      WHERE id = (
        SELECT id FROM trades
        WHERE market_id = ? AND status IN ('executed', 'simulated') AND resolved = 0
        AND side NOT LIKE 'CLOSE_%'
        ORDER BY timestamp DESC LIMIT 1
      )
    `).run(pnl, marketId);
  });
  _close();
}

/**
 * Update unrealized PnL for open positions using current market prices
 * Side-aware: handles both BUY/YES and SELL/NO positions (audit fix)
 * (Called periodically to keep dashboard accurate)
 */
function updateUnrealizedPnl(marketId, tokenId, currentPrice) {
  const d = getDb();
  const pos = d.prepare(
    `SELECT * FROM positions WHERE market_id = ? AND token_id = ? AND status = 'open' LIMIT 1`
  ).get(marketId, tokenId);

  if (pos && pos.entry_price > 0) {
    const shares = pos.size_usd / pos.entry_price;
    // All positions are token buys — profit when price rises, loss when it drops
    const unrealized = (shares * currentPrice) - pos.size_usd;
    d.prepare(`
      UPDATE positions SET current_price = ?, unrealized_pnl = ?
      WHERE market_id = ? AND token_id = ? AND status = 'open'
    `).run(currentPrice, Math.round(unrealized * 100) / 100, marketId, tokenId);
  }
}

// --- Trader position snapshots (for detecting new trades) ---
function getTraderPositions(traderAddress) {
  return getDb().prepare(`SELECT * FROM trader_positions WHERE trader_address = ?`).all(traderAddress.toLowerCase());
}

function upsertTraderPosition(tp) {
  getDb().prepare(`
    INSERT INTO trader_positions (trader_address, market_id, token_id, side, size, price)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(trader_address, market_id, token_id) DO UPDATE SET
      side = excluded.side, size = excluded.size, price = excluded.price, last_seen = datetime('now')
  `).run(tp.traderAddress.toLowerCase(), tp.marketId, tp.tokenId, tp.side, tp.size, tp.price);
}

function removeTraderPosition(traderAddress, marketId, tokenId) {
  getDb().prepare(`DELETE FROM trader_positions WHERE trader_address = ? AND market_id = ? AND token_id = ?`).run(traderAddress.toLowerCase(), marketId, tokenId);
}

// --- Snapshots ---
function saveSnapshot(snap) {
  getDb().prepare(`INSERT INTO snapshots (equity, open_positions, total_exposure, daily_pnl, total_pnl) VALUES (?, ?, ?, ?, ?)`).run(snap.equity, snap.openPositions, snap.totalExposure, snap.dailyPnl, snap.totalPnl);
}

// --- Dashboard queries ---
function getRecentTrades(limit = 50) {
  return getDb().prepare(`SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?`).all(limit);
}

function getPaginatedTrades(limit = 25, offset = 0) {
  const d = getDb();
  const trades = d.prepare(`SELECT * FROM trades ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(limit, offset);
  const { total } = d.prepare(`SELECT COUNT(*) as total FROM trades`).get();
  return { trades, total };
}

function getTradeStats() {
  const d = getDb();
  const summary = d.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN pnl > 0 AND resolved = 1 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN pnl < 0 AND resolved = 1 THEN 1 ELSE 0 END) as losses,
      COALESCE(SUM(CASE WHEN resolved = 1 THEN pnl ELSE 0 END), 0) as totalPnl,
      COALESCE(SUM(CASE WHEN pnl > 0 AND resolved = 1 THEN pnl ELSE 0 END), 0) as gains,
      COALESCE(SUM(CASE WHEN pnl < 0 AND resolved = 1 THEN ABS(pnl) ELSE 0 END), 0) as grossLosses
    FROM trades
  `).get();
  const byBucket = d.prepare(`SELECT bucket, COUNT(*) as count, COALESCE(SUM(pnl), 0) as pnl FROM trades WHERE status IN ('executed', 'simulated') GROUP BY bucket`).all();
  const byTrader = d.prepare(`SELECT trader_address, COUNT(*) as count, COALESCE(SUM(pnl), 0) as pnl FROM trades WHERE status IN ('executed', 'simulated') GROUP BY trader_address`).all();
  const byMarket = d.prepare(`SELECT market_name, COUNT(*) as count, COALESCE(SUM(pnl), 0) as pnl FROM trades WHERE status IN ('executed', 'simulated') AND market_name != '' GROUP BY market_name ORDER BY ABS(COALESCE(SUM(pnl), 0)) DESC LIMIT 15`).all();
  const resolvedTrades = d.prepare(`SELECT timestamp, pnl FROM trades WHERE resolved = 1 ORDER BY timestamp ASC`).all();
  const dailyPnl = d.prepare(`SELECT day, pnl, trades FROM (SELECT date(timestamp) as day, SUM(pnl) as pnl, COUNT(*) as trades FROM trades WHERE resolved = 1 GROUP BY date(timestamp) ORDER BY day DESC LIMIT 30) ORDER BY day ASC`).all();
  const recentSnapshots = d.prepare(`SELECT * FROM (SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT 168) ORDER BY timestamp ASC`).all();
  const profitFactor = summary.grossLosses === 0 ? (summary.gains > 0 ? Infinity : 0) : Math.round((summary.gains / summary.grossLosses) * 100) / 100;
  return { total: summary.total, wins: summary.wins, losses: summary.losses, totalPnl: summary.totalPnl, profitFactor, byBucket, byTrader, byMarket, resolvedTrades, dailyPnl, recentSnapshots };
}

function getProfitFactor() {
  const d = getDb();
  const gains = d.prepare(`SELECT COALESCE(SUM(pnl), 0) as total FROM trades WHERE pnl > 0 AND resolved = 1`).get();
  const losses = d.prepare(`SELECT COALESCE(SUM(ABS(pnl)), 0) as total FROM trades WHERE pnl < 0 AND resolved = 1`).get();
  if (losses.total === 0) return gains.total > 0 ? Infinity : 0;
  return Math.round((gains.total / losses.total) * 100) / 100;
}

function getMaxDrawdown() {
  const d = getDb();
  const snapshots = d.prepare(`SELECT equity FROM snapshots ORDER BY timestamp ASC`).all();
  if (snapshots.length === 0) return { maxDrawdown: 0, currentDrawdown: 0 };

  let peak = snapshots[0].equity;
  let maxDd = 0;
  for (const s of snapshots) {
    if (s.equity > peak) peak = s.equity;
    const dd = peak > 0 ? (peak - s.equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  // Current drawdown: peak is already the all-time peak after the loop
  const latest = snapshots[snapshots.length - 1].equity;
  const currentDd = peak > 0 ? (peak - latest) / peak : 0;

  return {
    maxDrawdown: Math.round(maxDd * 10000) / 100,      // percentage
    currentDrawdown: Math.round(currentDd * 10000) / 100,
  };
}

// --- Persistent Signal Dedup (survives restarts) ---
function isDedupRecorded(dedupKey) {
  const row = getDb().prepare(
    `SELECT 1 FROM signal_dedup WHERE dedup_key = ? AND expires_at > datetime('now') LIMIT 1`
  ).get(dedupKey);
  return !!row;
}

function recordDedup(dedupKey, ttlMs) {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  getDb().prepare(`
    INSERT OR REPLACE INTO signal_dedup (dedup_key, processed_at, expires_at)
    VALUES (?, datetime('now'), ?)
  `).run(dedupKey, expiresAt);
}

function cleanupExpiredDedup() {
  getDb().prepare(`DELETE FROM signal_dedup WHERE expires_at <= datetime('now')`).run();
}

// --- Audit Logging ---
function logAudit(action, details = '', actor = 'system', ipAddress = '') {
  try {
    getDb().prepare(`
      INSERT INTO audit_log (action, actor, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(action, actor, String(details).slice(0, 500), ipAddress);
  } catch (e) { /* non-critical — audit log write failed */ }
}

function getAuditLog(limit = 100) {
  return getDb().prepare(
    `SELECT id, timestamp, action, actor, details, ip_address AS ip FROM audit_log ORDER BY timestamp DESC LIMIT ?`
  ).all(limit);
}

function getAllTrades() {
  return getDb().prepare(`SELECT * FROM trades ORDER BY timestamp DESC`).all();
}

function getAllAuditLog() {
  return getDb().prepare(
    `SELECT id, timestamp, action, actor, details, ip_address AS ip FROM audit_log ORDER BY timestamp DESC`
  ).all();
}

function getAllSnapshots() {
  return getDb().prepare(`SELECT * FROM snapshots ORDER BY timestamp ASC`).all();
}

function getDailyVolume() {
  const today = new Date().toISOString().split('T')[0];
  const row = getDb().prepare(
    `SELECT COALESCE(SUM(ABS(size_usd)), 0) as vol FROM trades WHERE date(timestamp) = ? AND status IN ('executed', 'simulated')`
  ).get(today);
  return row.vol;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  init, getDb, close, logTrade, upsertPosition, getOpenPositions, closePosition,
  getOpenPositionByMarket, closePositionWithPnl, updateUnrealizedPnl,
  getTraderPositions, upsertTraderPosition, removeTraderPosition,
  saveSnapshot, getRecentTrades, getPaginatedTrades, getTradeStats,
  getProfitFactor, getMaxDrawdown,
  isDedupRecorded, recordDedup, cleanupExpiredDedup,
  logAudit, getAuditLog,
  getAllTrades, getAllAuditLog, getAllSnapshots,
  getDailyVolume,
};
