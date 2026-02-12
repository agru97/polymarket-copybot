/**
 * Trade Monitor v2.1
 *
 * Watches target traders on Polymarket and detects position changes.
 *
 * v2.1 changes:
 *   - Dynamic trader list from hot-config (add/remove/toggle from dashboard)
 *   - Per-trader bucket/multiplier from hot-config
 *
 * Inherited from v2.0:
 *   - Signal deduplication (prevents double-trades)
 *   - Retry with exponential backoff per trader
 *   - Parallel fetching with concurrency limit
 *   - Rate-limit aware (respects 429 headers)
 *   - Stale signal filtering (ignores old positions on first scan)
 */

const hotConfig = require('./hot-config');
const db = require('./db');
const log = require('./logger');
const C = require('./constants');

const POLYMARKET_DATA_API = C.POLYMARKET_DATA_API;
const POLYMARKET_CLOB_API = C.POLYMARKET_CLOB_API;

// Deduplication: persistent in SQLite (survives restarts — Novus-Tech level)
// In-memory cache for hot-path performance, backed by DB for durability
const dedupCache = new Map(); // hot cache — checked first
const SIGNAL_DEDUP_TTL = C.SIGNAL_DEDUP_TTL_MS;

// Track if this is the first scan per trader (skip initial positions)
const firstScanDone = new Set();

/**
 * Fetch with retry and exponential backoff
 */
async function fetchWithRetry(url, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);

      // Rate limited — wait and retry
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '5') * 1000;
        log.warn(`Rate limited — waiting ${retryAfter / 1000}s`);
        await new Promise(r => setTimeout(r, retryAfter));
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const wait = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        log.debug(`Fetch retry ${attempt + 1}/${maxRetries} in ${wait / 1000}s: ${err.message}`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

async function fetchTraderPositions(traderAddress) {
  try {
    const PAGE_SIZE = 100;
    const MAX_PAGES = 10; // Safety cap: 1000 positions max
    let allPositions = [];
    let offset = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${POLYMARKET_DATA_API}/positions?user=${traderAddress}&sizeThreshold=0.1&limit=${PAGE_SIZE}&offset=${offset}`;
      const data = await fetchWithRetry(url);
      const positions = Array.isArray(data) ? data : [];
      allPositions.push(...positions);

      // If we got fewer than PAGE_SIZE, we've reached the end
      if (positions.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return allPositions;
  } catch (err) {
    log.error(`Failed to fetch positions for ${traderAddress.slice(0, 10)}...: ${err.message}`);
    return null; // Return null on failure — NOT empty array (prevents false liquidation signals)
  }
}

async function fetchMarketInfo(conditionId) {
  try {
    const data = await fetchWithRetry(`${POLYMARKET_CLOB_API}/markets/${conditionId}`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Generate a unique key for signal deduplication
 */
function signalKey(traderAddress, marketId, tokenId, type) {
  return `${traderAddress}:${marketId}:${tokenId}:${type}`;
}

/**
 * Check if a signal was already processed recently
 * Uses in-memory cache (fast) backed by SQLite (durable across restarts)
 */
function isDuplicate(key) {
  // Hot cache first (avoid DB hit on every check)
  const lastSeen = dedupCache.get(key);
  if (lastSeen) {
    if (Date.now() - lastSeen > SIGNAL_DEDUP_TTL) {
      dedupCache.delete(key);
      return false;
    }
    return true;
  }
  // Fall back to persistent store (catches signals from before restart)
  return db.isDedupRecorded(key);
}

/**
 * Mark a signal as processed (both cache and DB)
 */
function markProcessed(key) {
  dedupCache.set(key, Date.now());
  db.recordDedup(key, SIGNAL_DEDUP_TTL);
}

/**
 * Clean up expired dedup entries (both cache and DB)
 */
function cleanupDedup() {
  const now = Date.now();
  for (const [key, ts] of dedupCache.entries()) {
    if (now - ts > SIGNAL_DEDUP_TTL) {
      dedupCache.delete(key);
    }
  }
  // Also clean DB (less frequent, but keeps it tidy)
  db.cleanupExpiredDedup();
}

/**
 * Detect position changes for a single trader
 * Now uses hot-config for bucket lookup instead of static config
 */
async function detectChanges(traderAddress) {
  const bucket = hotConfig.getBucketForTrader(traderAddress);
  if (!bucket) return [];

  const currentPositions = await fetchTraderPositions(traderAddress);

  // CRITICAL FIX: If API failed, skip this trader entirely
  // Returning null means "I don't know" — do NOT generate signals from ignorance
  if (currentPositions === null) {
    log.warn(`Skipping ${traderAddress.slice(0, 10)}... — API unavailable (preventing false signals)`);
    return [];
  }

  const knownPositions = db.getTraderPositions(traderAddress);
  const knownMap = new Map(knownPositions.map(p => [`${p.market_id}:${p.token_id}`, p]));
  const signals = [];

  const isFirstScan = !firstScanDone.has(traderAddress);

  for (const pos of currentPositions) {
    const marketId = pos.conditionId || pos.marketId || '';
    const tokenId = pos.tokenId || pos.outcomeIndex || '';
    const key = `${marketId}:${tokenId}`;
    const size = parseFloat(pos.size || pos.currentValue || 0);
    const price = parseFloat(pos.avgPrice || pos.price || 0);
    const side = pos.outcome || pos.side || 'YES';
    const known = knownMap.get(key);

    if (!known) {
      // New position detected
      if (isFirstScan) {
        log.debug(`First scan: recording existing position for ${traderAddress.slice(0, 10)}... on ${marketId.slice(0, 20)}`);
      } else {
        const dedupKey = signalKey(traderAddress, marketId, tokenId, 'NEW');
        if (!isDuplicate(dedupKey)) {
          signals.push({
            type: 'NEW', traderAddress, bucket, marketId, tokenId, side, size, price,
            marketName: pos.title || pos.question || '',
          });
          markProcessed(dedupKey);
          log.info(`NEW: ${traderAddress.slice(0, 10)}... → ${side} on ${(pos.title || marketId).slice(0, 50)} @ ${price} ($${size})`);
        } else {
          log.debug(`DEDUP: Skipping duplicate NEW signal for ${marketId.slice(0, 20)}`);
        }
      }
    } else if (size > known.size * 1.15) {
      // Position increased by >15%
      const increase = size - known.size;
      const dedupKey = signalKey(traderAddress, marketId, tokenId, `INC_${Math.floor(size)}`);
      if (!isDuplicate(dedupKey)) {
        signals.push({
          type: 'INCREASE', traderAddress, bucket, marketId, tokenId, side, size: increase, price,
          marketName: pos.title || pos.question || '',
        });
        markProcessed(dedupKey);
        log.info(`INCREASE: ${traderAddress.slice(0, 10)}... +$${increase.toFixed(2)} on ${(pos.title || marketId).slice(0, 50)}`);
      }
    } else if (size < known.size * 0.85 && !isFirstScan) {
      // Position DECREASED by >15% (partial close detection — audit fix)
      const decrease = known.size - size;
      const dedupKey = signalKey(traderAddress, marketId, tokenId, `DEC_${Math.floor(size)}`);
      if (!isDuplicate(dedupKey)) {
        signals.push({
          type: 'CLOSE', traderAddress, bucket, marketId, tokenId, side,
          size: decrease, price,
          marketName: pos.title || pos.question || '',
          isPartialClose: true,
        });
        markProcessed(dedupKey);
        log.info(`PARTIAL CLOSE: ${traderAddress.slice(0, 10)}... -$${decrease.toFixed(2)} on ${(pos.title || marketId).slice(0, 50)}`);
      }
    }

    // Always update known state
    db.upsertTraderPosition({ traderAddress, marketId, tokenId, side, size, price });
    knownMap.delete(key);
  }

  // Detect closed positions (skip on first scan — stale DB data causes false signals)
  if (!isFirstScan) {
    for (const [key, old] of knownMap.entries()) {
      const dedupKey = signalKey(traderAddress, old.market_id, old.token_id, 'CLOSE');
      if (!isDuplicate(dedupKey)) {
        signals.push({
          type: 'CLOSE', traderAddress, bucket,
          marketId: old.market_id, tokenId: old.token_id,
          side: old.side, size: old.size, price: old.price, marketName: '',
        });
        markProcessed(dedupKey);
        log.info(`CLOSE: ${traderAddress.slice(0, 10)}... exited ${old.side} on ${old.market_id.slice(0, 20)}`);
      }
      db.removeTraderPosition(traderAddress, old.market_id, old.token_id);
    }
  } else {
    // First scan: clean up stale DB entries without generating signals
    for (const [key, old] of knownMap.entries()) {
      db.removeTraderPosition(traderAddress, old.market_id, old.token_id);
    }
  }

  // Mark first scan done
  if (isFirstScan) {
    firstScanDone.add(traderAddress);
    log.info(`Initial scan complete for ${traderAddress.slice(0, 10)}... (${currentPositions.length} existing positions recorded)`);
  }

  return signals;
}

/**
 * Scan all ACTIVE traders with concurrency limit
 * Now reads from hot-config dynamically each cycle
 */
async function scanAllTraders() {
  const allTraders = hotConfig.getActiveAddresses();
  const allSignals = [];
  const CONCURRENCY = 3; // Max parallel requests

  if (allTraders.length === 0) {
    log.debug('No active traders configured — skipping scan');
    return [];
  }

  // Process in batches of CONCURRENCY
  for (let i = 0; i < allTraders.length; i += CONCURRENCY) {
    const batch = allTraders.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (trader) => {
        try {
          return await detectChanges(trader);
        } catch (err) {
          log.error(`Error scanning ${trader.slice(0, 10)}...: ${err.message}`);
          return [];
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allSignals.push(...result.value);
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + CONCURRENCY < allTraders.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Deterministic cleanup (every scan, cheap since we check timestamps)
  cleanupDedup();

  return allSignals;
}

module.exports = { scanAllTraders, fetchTraderPositions, fetchMarketInfo, detectChanges };
