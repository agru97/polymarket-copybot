/**
 * Trade Monitor v2.5
 *
 * Watches target traders on Polymarket and detects position changes.
 *
 * Uses the Data API positions endpoint:
 *   GET https://data-api.polymarket.com/positions
 *   - limit: 1–500 (default 100)
 *   - offset: 0–10000
 *   - sizeThreshold: min position size (default 1, we use 0.1)
 *   - Response: plain JSON array of position objects (no pagination metadata)
 *
 * Position fields used:
 *   conditionId  — market condition ID (for market lookup, dedup key)
 *   asset        — CLOB token ID (for order placement)
 *   outcome      — "Yes" / "No"
 *   outcomeIndex — 0 (Yes) / 1 (No)
 *   size         — token count (stable — only changes on trades, not price moves)
 *   currentValue — current USD value of position
 *   avgPrice     — average entry price
 *   title        — market question/title
 */

const hotConfig = require('./hot-config');
const db = require('./db');
const log = require('./logger');
const C = require('./constants');

const POLYMARKET_DATA_API = C.POLYMARKET_DATA_API;
const POLYMARKET_CLOB_API = C.POLYMARKET_CLOB_API;

// ─── Configuration ───────────────────────────────
const PAGE_LIMIT = 500;            // API max per request
const MAX_PAGES = 5;               // Safety cap: 2500 positions max
const CHANGE_THRESHOLD = C.POSITION_CHANGE_THRESHOLD; // 15% to trigger signal

// ─── Deduplication ───────────────────────────────
// Two-tier: in-memory hot cache → SQLite for restart durability
const dedupCache = new Map();
const SIGNAL_DEDUP_TTL = C.SIGNAL_DEDUP_TTL_MS;

// Track first scan per trader (skip initial positions, prevent false signals)
const firstScanDone = new Set();

// ─── HTTP Fetch with Retry ───────────────────────

async function fetchWithRetry(url, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
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
        const wait = Math.pow(2, attempt) * 1000;
        log.debug(`Fetch retry ${attempt + 1}/${maxRetries} in ${wait / 1000}s: ${err.message}`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

// ─── Position Fetching ───────────────────────────

/**
 * Fetch all positions for a trader from the Data API.
 * Uses limit=500 (API max) with offset pagination.
 * Deduplicates results in case the API returns overlapping pages.
 * Returns null on failure (caller must skip, not assume empty).
 */
async function fetchTraderPositions(traderAddress) {
  try {
    const seen = new Set();
    const allPositions = [];
    let offset = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${POLYMARKET_DATA_API}/positions?user=${traderAddress}&sizeThreshold=0.1&limit=${PAGE_LIMIT}&offset=${offset}`;
      const data = await fetchWithRetry(url);
      const positions = Array.isArray(data) ? data : [];

      if (positions.length === 0) break;

      // Deduplicate by conditionId:asset (unique position key)
      let newCount = 0;
      for (const pos of positions) {
        const key = positionKey(pos);
        if (!seen.has(key)) {
          seen.add(key);
          allPositions.push(pos);
          newCount++;
        }
      }

      // Stop if: no new results (API ignoring offset) or last page
      if (newCount === 0 || positions.length < PAGE_LIMIT) break;
      offset += PAGE_LIMIT;
    }

    return allPositions;
  } catch (err) {
    log.error(`Failed to fetch positions for ${traderAddress.slice(0, 10)}...: ${err.message}`);
    return null;
  }
}

async function fetchMarketInfo(conditionId) {
  try {
    return await fetchWithRetry(`${POLYMARKET_CLOB_API}/markets/${conditionId}`);
  } catch {
    return null;
  }
}

// ─── Position Key Helpers ────────────────────────

/**
 * Unique key for a position from the API response.
 * Uses conditionId (market) + asset (CLOB token ID).
 */
function positionKey(pos) {
  const marketId = pos.conditionId || '';
  const tokenId = pos.asset || String(pos.outcomeIndex ?? '');
  return `${marketId}:${tokenId}`;
}

/**
 * Unique key for a position from our DB format.
 */
function dbPositionKey(row) {
  return `${row.market_id}:${row.token_id}`;
}

// ─── Signal Dedup ────────────────────────────────

function signalKey(traderAddress, marketId, tokenId, type) {
  return `${traderAddress}:${marketId}:${tokenId}:${type}`;
}

function isDuplicate(key) {
  const lastSeen = dedupCache.get(key);
  if (lastSeen) {
    if (Date.now() - lastSeen > SIGNAL_DEDUP_TTL) {
      dedupCache.delete(key);
      return false;
    }
    return true;
  }
  return db.isDedupRecorded(key);
}

function markProcessed(key) {
  dedupCache.set(key, Date.now());
  db.recordDedup(key, SIGNAL_DEDUP_TTL);
}

function cleanupDedup() {
  const now = Date.now();
  for (const [key, ts] of dedupCache.entries()) {
    if (now - ts > SIGNAL_DEDUP_TTL) dedupCache.delete(key);
  }
  db.cleanupExpiredDedup();
}

// ─── Change Detection ────────────────────────────

/**
 * Detect position changes for a single trader.
 *
 * Compares current API positions against stored snapshots in trader_positions.
 * First scan only records — no signals generated (prevents false trades on restart).
 *
 * Change detection uses token count (pos.size) which is stable across price moves.
 * Signal USD values use currentValue for accurate copy sizing.
 */
async function detectChanges(traderAddress) {
  const bucket = hotConfig.getBucketForTrader(traderAddress);
  if (!bucket) return [];

  const currentPositions = await fetchTraderPositions(traderAddress);

  // If API failed, skip entirely — don't generate signals from ignorance
  if (currentPositions === null) {
    log.warn(`Skipping ${traderAddress.slice(0, 10)}... — API unavailable`);
    return [];
  }

  const knownPositions = db.getTraderPositions(traderAddress);
  const knownMap = new Map(knownPositions.map(p => [dbPositionKey(p), p]));
  const signals = [];
  const isFirstScan = !firstScanDone.has(traderAddress);

  // Process current positions — deduplicated at fetch level, but guard here too
  const processed = new Set();

  for (const pos of currentPositions) {
    const marketId = pos.conditionId || '';
    const tokenId = pos.asset || String(pos.outcomeIndex ?? '');
    const key = `${marketId}:${tokenId}`;

    if (processed.has(key)) continue;
    processed.add(key);

    const size = parseFloat(pos.size || 0);          // token count (for change detection)
    const valueUsd = parseFloat(pos.currentValue || 0); // USD (for signal sizing)
    const price = parseFloat(pos.avgPrice || 0);
    const side = pos.outcome || 'Yes'; // Outcome label (e.g. "Yes", "No", "Thunder") — for display, not order direction
    const marketName = pos.title || '';
    const known = knownMap.get(key);

    if (!known) {
      // ── New position ──
      if (!isFirstScan) {
        const dk = signalKey(traderAddress, marketId, tokenId, 'NEW');
        if (!isDuplicate(dk)) {
          signals.push({
            type: 'NEW', traderAddress, bucket, marketId, tokenId,
            side, size: valueUsd, price, marketName,
          });
          markProcessed(dk);
          log.info(`NEW: ${traderAddress.slice(0, 10)}... → ${side} on ${marketName.slice(0, 50)} @ ${price} ($${valueUsd.toFixed(0)})`);
        }
      }
    } else if (size > known.size * (1 + CHANGE_THRESHOLD) && !isFirstScan) {
      // ── Position increased ──
      const increaseRatio = (size - known.size) / known.size;
      const increaseUsd = valueUsd * (increaseRatio / (1 + increaseRatio));
      const dk = signalKey(traderAddress, marketId, tokenId, `INC_${Math.floor(size)}`);
      if (!isDuplicate(dk)) {
        signals.push({
          type: 'INCREASE', traderAddress, bucket, marketId, tokenId,
          side, size: increaseUsd, price, marketName,
        });
        markProcessed(dk);
        log.info(`INCREASE: ${traderAddress.slice(0, 10)}... +${(increaseRatio * 100).toFixed(0)}% on ${marketName.slice(0, 50)}`);
      }
    } else if (size < known.size * (1 - CHANGE_THRESHOLD) && !isFirstScan) {
      // ── Position decreased (partial close) ──
      const decreaseRatio = (known.size - size) / known.size;

      // If >90% decrease, treat as full close — prevents division-by-near-zero
      if (decreaseRatio > 0.9) {
        const dk = signalKey(traderAddress, marketId, tokenId, 'CLOSE');
        if (!isDuplicate(dk)) {
          signals.push({
            type: 'CLOSE', traderAddress, bucket, marketId, tokenId,
            side, size: valueUsd, price, marketName,
          });
          markProcessed(dk);
          log.info(`NEAR-TOTAL CLOSE: ${traderAddress.slice(0, 10)}... -${(decreaseRatio * 100).toFixed(0)}% on ${marketName.slice(0, 50)} (treating as full close)`);
        }
      } else {
        const decreaseUsd = valueUsd * (decreaseRatio / (1 - decreaseRatio));
        const dk = signalKey(traderAddress, marketId, tokenId, `DEC_${Math.floor(size)}`);
        if (!isDuplicate(dk)) {
          signals.push({
            type: 'CLOSE', traderAddress, bucket, marketId, tokenId,
            side, size: decreaseUsd, price, marketName, isPartialClose: true,
          });
          markProcessed(dk);
          log.info(`PARTIAL CLOSE: ${traderAddress.slice(0, 10)}... -${(decreaseRatio * 100).toFixed(0)}% on ${marketName.slice(0, 50)}`);
        }
      }
    }

    // Always update stored snapshot
    db.upsertTraderPosition({ traderAddress, marketId, tokenId, side, size, price });
    knownMap.delete(key);
  }

  // ── Detect fully closed positions ──
  // Only after first scan — stale DB data on restart would cause false closes
  if (!isFirstScan) {
    for (const [, old] of knownMap.entries()) {
      const dk = signalKey(traderAddress, old.market_id, old.token_id, 'CLOSE');
      if (!isDuplicate(dk)) {
        signals.push({
          type: 'CLOSE', traderAddress, bucket,
          marketId: old.market_id, tokenId: old.token_id,
          // size is cost basis (tokens × entry price), not current value — current market price
          // is unavailable for disappeared positions. This is only used for logging; full closes
          // use ourPosition.size_usd in trader.js, so accuracy isn't critical here.
          side: old.side, size: old.size * old.price, price: old.price, marketName: '',
        });
        markProcessed(dk);
        log.info(`CLOSE: ${traderAddress.slice(0, 10)}... exited ${old.side} on ${old.market_id.slice(0, 20)}`);
      }
      db.removeTraderPosition(traderAddress, old.market_id, old.token_id);
    }
  } else {
    // First scan: purge stale DB entries silently
    for (const [, old] of knownMap.entries()) {
      db.removeTraderPosition(traderAddress, old.market_id, old.token_id);
    }
    firstScanDone.add(traderAddress);
    log.info(`Initial scan complete for ${traderAddress.slice(0, 10)}... (${currentPositions.length} positions recorded)`);
  }

  return signals;
}

// ─── Orchestrator ────────────────────────────────

/**
 * Scan all active traders with concurrency limit.
 * Reads trader list from hot-config each cycle (supports live add/remove).
 */
async function scanAllTraders() {
  const allTraders = hotConfig.getActiveAddresses();
  if (allTraders.length === 0) {
    log.debug('No active traders — skipping scan');
    return [];
  }

  const allSignals = [];
  const CONCURRENCY = C.SCANNER_CONCURRENCY;

  for (let i = 0; i < allTraders.length; i += CONCURRENCY) {
    const batch = allTraders.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (addr) => {
        try {
          return await detectChanges(addr);
        } catch (err) {
          log.error(`Error scanning ${addr.slice(0, 10)}...: ${err.message}`);
          return [];
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allSignals.push(...result.value);
      }
    }

    if (i + CONCURRENCY < allTraders.length) {
      await new Promise(r => setTimeout(r, C.SCANNER_BATCH_DELAY_MS));
    }
  }

  cleanupDedup();
  return allSignals;
}

function clearFirstScan(traderAddress) {
  firstScanDone.delete(traderAddress.toLowerCase());
}

module.exports = { scanAllTraders, fetchTraderPositions, fetchMarketInfo, detectChanges, clearFirstScan };
