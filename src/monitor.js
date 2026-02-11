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

const POLYMARKET_DATA_API = 'https://data-api.polymarket.com';
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com';

// Deduplication: track recently processed signals to prevent double trades
const recentSignals = new Map(); // key → timestamp
const SIGNAL_DEDUP_TTL = 5 * 60 * 1000; // 5 minutes

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
    const url = `${POLYMARKET_DATA_API}/positions?user=${traderAddress}&sizeThreshold=0.1&limit=100`;
    const data = await fetchWithRetry(url);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    log.error(`Failed to fetch positions for ${traderAddress.slice(0, 10)}...: ${err.message}`);
    return [];
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
 */
function isDuplicate(key) {
  const lastSeen = recentSignals.get(key);
  if (!lastSeen) return false;
  if (Date.now() - lastSeen > SIGNAL_DEDUP_TTL) {
    recentSignals.delete(key);
    return false;
  }
  return true;
}

/**
 * Mark a signal as processed
 */
function markProcessed(key) {
  recentSignals.set(key, Date.now());
}

/**
 * Clean up expired dedup entries
 */
function cleanupDedup() {
  const now = Date.now();
  for (const [key, ts] of recentSignals.entries()) {
    if (now - ts > SIGNAL_DEDUP_TTL) {
      recentSignals.delete(key);
    }
  }
}

/**
 * Detect position changes for a single trader
 * Now uses hot-config for bucket lookup instead of static config
 */
async function detectChanges(traderAddress) {
  const bucket = hotConfig.getBucketForTrader(traderAddress);
  if (!bucket) return [];

  const currentPositions = await fetchTraderPositions(traderAddress);
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
    }

    // Always update known state
    db.upsertTraderPosition({ traderAddress, marketId, tokenId, side, size, price });
    knownMap.delete(key);
  }

  // Detect closed positions
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

  // Periodic cleanup
  if (Math.random() < 0.1) cleanupDedup();

  return allSignals;
}

module.exports = { scanAllTraders, fetchTraderPositions, fetchMarketInfo, detectChanges };
