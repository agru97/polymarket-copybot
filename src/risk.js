const { config, getMaxTrade } = require('./config');
const db = require('./db');

function getConsecutiveLosses() {
  const d = db.getDb();
  const recentResolved = d.prepare(
    `SELECT pnl, timestamp FROM trades WHERE resolved = 1 AND status IN ('executed', 'simulated') ORDER BY timestamp DESC LIMIT 3`
  ).all();
  const allLosses = recentResolved.length === 3 && recentResolved.every(t => t.pnl < 0);
  return { recentResolved, allLosses };
}

function checkRiskLimits(bucket, proposedSizeUsd, currentEquity) {
  const reasons = [];

  // 1. Equity stop-loss
  if (currentEquity <= config.risk.equityStopLoss) {
    reasons.push(`Equity ($${currentEquity.toFixed(2)}) at or below stop-loss ($${config.risk.equityStopLoss})`);
  }

  // 2. Daily loss limit
  const todayPnl = getDailyPnl();
  if (todayPnl <= -config.risk.dailyLossLimit) {
    reasons.push(`Daily loss ($${todayPnl.toFixed(2)}) exceeds limit (-$${config.risk.dailyLossLimit})`);
  }

  // 3. Max open positions
  const openPositions = db.getOpenPositions();
  if (openPositions.length >= config.caps.maxOpenPositions) {
    reasons.push(`Open positions (${openPositions.length}) at limit (${config.caps.maxOpenPositions})`);
  }

  // 4. Max total exposure
  const totalExposure = openPositions.reduce((sum, p) => sum + p.size_usd, 0);
  if (totalExposure + proposedSizeUsd > config.caps.maxTotalExposure) {
    reasons.push(`Total exposure ($${(totalExposure + proposedSizeUsd).toFixed(2)}) would exceed limit ($${config.caps.maxTotalExposure})`);
  }

  // 5. Max per-trade
  const bucketCap = getMaxTrade(bucket);
  if (proposedSizeUsd > bucketCap) {
    reasons.push(`Trade size ($${proposedSizeUsd.toFixed(2)}) exceeds ${bucket} cap ($${bucketCap})`);
  }
  if (proposedSizeUsd > config.caps.maxPerTrade) {
    reasons.push(`Trade size ($${proposedSizeUsd.toFixed(2)}) exceeds global cap ($${config.caps.maxPerTrade})`);
  }

  // 6. Min trade size
  if (proposedSizeUsd < config.risk.minTradeSize) {
    reasons.push(`Trade size ($${proposedSizeUsd.toFixed(2)}) below minimum ($${config.risk.minTradeSize})`);
  }

  // 7. Consecutive loss check (3 in a row = cooldown)
  const { recentResolved, allLosses } = getConsecutiveLosses();
  if (allLosses) {
    const lastTradeTime = new Date(recentResolved[0].timestamp + 'Z').getTime();
    const cooldownMs = 6 * 60 * 60 * 1000; // 6 hours
    if (Date.now() - lastTradeTime < cooldownMs) {
      reasons.push('Cooling off: 3 consecutive losses, waiting 6 hours');
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

function checkPriceFilter(price) {
  if (price < config.risk.minPrice) return { ok: false, reason: `Price ${price} below min ${config.risk.minPrice}` };
  if (price > config.risk.maxPrice) return { ok: false, reason: `Price ${price} above max ${config.risk.maxPrice}` };
  return { ok: true };
}

function checkSlippage(leaderPrice, ourPrice) {
  if (!leaderPrice || leaderPrice <= 0) return { ok: true, slippage: 0 };
  // Only penalize if we'd pay MORE than the leader (unfavorable slippage)
  // Favorable slippage (ourPrice < leaderPrice for buys) is fine
  const slippage = ((ourPrice - leaderPrice) / leaderPrice) * 100;
  const tolerance = config.risk.slippageTolerance;
  if (slippage > tolerance) {
    return { ok: false, slippage, reason: `Slippage ${slippage.toFixed(2)}% > ${tolerance}% tolerance (leader: ${leaderPrice}, market: ${ourPrice})` };
  }
  return { ok: true, slippage: Math.max(0, slippage) };
}

function getDailyPnl() {
  const d = db.getDb();
  const today = new Date().toISOString().split('T')[0];
  const realized = d.prepare(`SELECT COALESCE(SUM(pnl), 0) as pnl FROM trades WHERE date(timestamp) = ? AND resolved = 1`).get(today);
  // Include unrealized PnL from open positions to prevent over-exposure
  const unrealized = d.prepare(`SELECT COALESCE(SUM(unrealized_pnl), 0) as pnl FROM positions WHERE status = 'open'`).get();
  return realized.pnl + unrealized.pnl;
}

function getRiskStatus(currentEquity) {
  const openPositions = db.getOpenPositions();
  const totalExposure = openPositions.reduce((sum, p) => sum + p.size_usd, 0);
  const dailyPnl = getDailyPnl();

  // Consecutive loss cooldown check
  let isCooldownActive = false;
  let cooldownEndsAt = null;
  const { recentResolved, allLosses } = getConsecutiveLosses();
  if (allLosses) {
    const lastTradeTime = new Date(recentResolved[0].timestamp + 'Z').getTime();
    const cooldownMs = 6 * 60 * 60 * 1000;
    if (Date.now() - lastTradeTime < cooldownMs) {
      isCooldownActive = true;
      cooldownEndsAt = new Date(lastTradeTime + cooldownMs).toISOString();
    }
  }

  // Drawdown metrics
  const { maxDrawdown, currentDrawdown } = db.getMaxDrawdown();

  // Health Score (1-10): weighted average of utilization metrics
  const exposureUtil = config.caps.maxTotalExposure > 0 ? totalExposure / config.caps.maxTotalExposure : 0;
  const dailyLossUtil = config.risk.dailyLossLimit > 0 ? Math.max(0, -dailyPnl) / config.risk.dailyLossLimit : 0;
  const positionUtil = config.caps.maxOpenPositions > 0 ? openPositions.length / config.caps.maxOpenPositions : 0;
  const stopBuffer = currentEquity > 0 && config.risk.equityStopLoss > 0
    ? 1 - Math.max(0, currentEquity - config.risk.equityStopLoss) / currentEquity
    : 0;
  const cooldownPenalty = isCooldownActive ? 1 : 0;

  const rawScore = 1 - (
    exposureUtil * 0.25 +
    dailyLossUtil * 0.25 +
    positionUtil * 0.20 +
    stopBuffer * 0.20 +
    cooldownPenalty * 0.10
  );
  const healthScore = Math.max(1, Math.min(10, Math.round(rawScore * 9 + 1)));

  return {
    equity: currentEquity,
    openPositions: openPositions.length,
    maxPositions: config.caps.maxOpenPositions,
    totalExposure,
    maxExposure: config.caps.maxTotalExposure,
    dailyPnl,
    dailyLossLimit: config.risk.dailyLossLimit,
    equityStopLoss: config.risk.equityStopLoss,
    isEquityStopped: currentEquity <= config.risk.equityStopLoss,
    isDailyLossStopped: dailyPnl <= -config.risk.dailyLossLimit,
    exposurePercent: config.caps.maxTotalExposure > 0 ? Math.round(totalExposure / config.caps.maxTotalExposure * 1000) / 10 : 0,
    isCooldownActive,
    cooldownEndsAt,
    minTradeSize: config.risk.minTradeSize,
    maxPerTrade: config.caps.maxPerTrade,
    priceRange: [config.risk.minPrice, config.risk.maxPrice],
    maxDrawdown,
    currentDrawdown,
    healthScore,
  };
}

module.exports = { checkRiskLimits, checkPriceFilter, checkSlippage, getRiskStatus, getDailyPnl };
