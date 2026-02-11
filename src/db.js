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
  return d.prepare(`
    INSERT INTO trades (trader_address, bucket, market_id, market_name, side, price, size_usd, leader_size_usd, status, order_id, dry_run, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    trade.traderAddress, trade.bucket, trade.marketId, trade.marketName || '',
    trade.side, trade.price, trade.sizeUsd, trade.leaderSizeUsd || 0,
    trade.status || 'executed', trade.orderId || '', trade.dryRun ? 1 : 0, trade.notes || ''
  );
}

// --- Position tracking ---
function upsertPosition(pos) {
  const d = getDb();
  d.prepare(`
    INSERT INTO positions (market_id, token_id, side, entry_price, size_usd, trader_address, bucket)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(pos.marketId, pos.tokenId, pos.side, pos.entryPrice, pos.sizeUsd, pos.traderAddress, pos.bucket);
}

function getOpenPositions() {
  return getDb().prepare(`SELECT * FROM positions WHERE status = 'open'`).all();
}

function closePosition(marketId, tokenId) {
  getDb().prepare(`UPDATE positions SET status = 'closed', closed_at = datetime('now') WHERE market_id = ? AND token_id = ? AND status = 'open'`).run(marketId, tokenId);
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

function getTradeStats() {
  const d = getDb();
  const total = d.prepare(`SELECT COUNT(*) as count FROM trades`).get();
  const wins = d.prepare(`SELECT COUNT(*) as count FROM trades WHERE pnl > 0`).get();
  const losses = d.prepare(`SELECT COUNT(*) as count FROM trades WHERE pnl < 0 AND resolved = 1`).get();
  const totalPnl = d.prepare(`SELECT COALESCE(SUM(pnl), 0) as total FROM trades WHERE resolved = 1`).get();
  const byBucket = d.prepare(`SELECT bucket, COUNT(*) as count, COALESCE(SUM(pnl), 0) as pnl FROM trades GROUP BY bucket`).all();
  const byTrader = d.prepare(`SELECT trader_address, COUNT(*) as count, COALESCE(SUM(pnl), 0) as pnl FROM trades GROUP BY trader_address`).all();
  const dailyPnl = d.prepare(`SELECT date(timestamp) as day, SUM(pnl) as pnl, COUNT(*) as trades FROM trades WHERE resolved = 1 GROUP BY date(timestamp) ORDER BY day DESC LIMIT 30`).all();
  const recentSnapshots = d.prepare(`SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT 168`).all(); // 7 days of hourly
  return { total: total.count, wins: wins.count, losses: losses.count, totalPnl: totalPnl.total, byBucket, byTrader, dailyPnl, recentSnapshots };
}

module.exports = {
  init, getDb, logTrade, upsertPosition, getOpenPositions, closePosition,
  getTraderPositions, upsertTraderPosition, removeTraderPosition,
  saveSnapshot, getRecentTrades, getTradeStats
};
