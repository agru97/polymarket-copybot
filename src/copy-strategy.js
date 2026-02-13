/**
 * Copy Strategy Engine v1.0
 *
 * Professional position sizing inspired by Novus-Tech's 3-strategy system.
 *
 * Strategies:
 *   - PERCENTAGE: Copy a percentage of the leader's trade size
 *   - FIXED: Use a fixed dollar amount per trade
 *   - ADAPTIVE: Dynamically scale % based on trade size
 *     (bigger leader trades → lower %, smaller → higher %)
 *
 * Also supports:
 *   - Tiered multipliers: different multipliers for different trade sizes
 *   - Per-trader overrides via hot-config
 *   - Safety limits: max order, min order, max position, max daily volume
 */

const db = require('./db');

const STRATEGIES = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
  ADAPTIVE: 'ADAPTIVE',
};

/**
 * Default strategy config — can be overridden via .env
 */
function getDefaultConfig() {
  return {
    strategy: process.env.COPY_STRATEGY || STRATEGIES.PERCENTAGE,
    copySize: parseFloat(process.env.COPY_SIZE || '15'),   // 15% default
    maxOrderSizeUsd: parseFloat(process.env.MAX_ORDER_SIZE_USD || '10'),
    minOrderSizeUsd: parseFloat(process.env.MIN_ORDER_SIZE_USD || '1'),
    maxPositionSizeUsd: process.env.MAX_POSITION_SIZE_USD
      ? parseFloat(process.env.MAX_POSITION_SIZE_USD)
      : null,
    maxDailyVolumeUsd: process.env.MAX_DAILY_VOLUME_USD
      ? parseFloat(process.env.MAX_DAILY_VOLUME_USD)
      : null,
    // Adaptive strategy params
    adaptiveMinPercent: parseFloat(process.env.ADAPTIVE_MIN_PERCENT || '5'),
    adaptiveMaxPercent: parseFloat(process.env.ADAPTIVE_MAX_PERCENT || '25'),
    adaptiveThreshold: parseFloat(process.env.ADAPTIVE_THRESHOLD_USD || '200'),
    // Tiered multipliers: "1-10:2.0,10-100:1.0,100-500:0.2,500+:0.1"
    tieredMultipliers: parseTieredMultipliers(process.env.TIERED_MULTIPLIERS || ''),
  };
}

/**
 * Parse tiered multiplier string
 * Format: "1-10:2.0,10-100:1.0,100-500:0.2,500+:0.1"
 */
function parseTieredMultipliers(str) {
  if (!str || !str.trim()) return [];

  const tiers = [];
  const parts = str.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const [range, multiplierStr] = part.split(':');
    if (!range || !multiplierStr) continue;

    const multiplier = parseFloat(multiplierStr);
    if (isNaN(multiplier) || multiplier < 0) continue;

    if (range.endsWith('+')) {
      const min = parseFloat(range.slice(0, -1));
      if (!isNaN(min)) tiers.push({ min, max: Infinity, multiplier });
    } else if (range.includes('-')) {
      const [minStr, maxStr] = range.split('-');
      const min = parseFloat(minStr);
      const max = parseFloat(maxStr);
      if (!isNaN(min) && !isNaN(max) && max > min) {
        tiers.push({ min, max, multiplier });
      }
    }
  }

  return tiers.sort((a, b) => a.min - b.min);
}

/**
 * Get the tiered multiplier for a given trade size
 */
function getTieredMultiplier(tiers, tradeSize) {
  if (!tiers || tiers.length === 0) return 1.0;

  for (const tier of tiers) {
    if (tradeSize >= tier.min && tradeSize < tier.max) {
      return tier.multiplier;
    }
  }

  // Default: use the last tier's multiplier
  return tiers[tiers.length - 1].multiplier;
}

/**
 * Linear interpolation helper
 */
function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Calculate order size based on strategy
 *
 * @param {Object} strategyConfig - Strategy configuration
 * @param {number} leaderOrderSize - Leader's trade size in USD
 * @param {number} availableBalance - Our available USDC balance
 * @param {number} currentPositionSize - Current position size for this market (0 if new)
 * @param {Object} traderOverrides - Per-trader overrides from hot-config { multiplier, maxTrade }
 * @returns {Object} { finalAmount, reasoning, cappedByMax, reducedByBalance, belowMinimum }
 */
function calculateOrderSize(strategyConfig, leaderOrderSize, availableBalance, currentPositionSize = 0, traderOverrides = {}) {
  const cfg = { ...getDefaultConfig(), ...strategyConfig };
  let baseAmount;
  let reasoning;

  // Step 1: Calculate base amount from strategy
  switch (cfg.strategy) {
    case STRATEGIES.PERCENTAGE:
      baseAmount = leaderOrderSize * (cfg.copySize / 100);
      reasoning = `${cfg.copySize}% of leader's $${leaderOrderSize.toFixed(2)} = $${baseAmount.toFixed(2)}`;
      break;

    case STRATEGIES.FIXED:
      baseAmount = cfg.copySize;
      reasoning = `Fixed $${baseAmount.toFixed(2)}`;
      break;

    case STRATEGIES.ADAPTIVE: {
      const threshold = cfg.adaptiveThreshold;
      let adaptivePercent;
      if (leaderOrderSize >= threshold) {
        // Large trade → scale down to min percent
        const factor = Math.min(1, (leaderOrderSize / threshold) - 1);
        adaptivePercent = lerp(cfg.copySize, cfg.adaptiveMinPercent, factor);
      } else {
        // Small trade → scale up to max percent
        const factor = leaderOrderSize / threshold;
        adaptivePercent = lerp(cfg.adaptiveMaxPercent, cfg.copySize, factor);
      }
      baseAmount = leaderOrderSize * (adaptivePercent / 100);
      reasoning = `Adaptive ${adaptivePercent.toFixed(1)}% of $${leaderOrderSize.toFixed(2)} = $${baseAmount.toFixed(2)}`;
      break;
    }

    default:
      baseAmount = leaderOrderSize * 0.15;
      reasoning = `Fallback 15% of $${leaderOrderSize.toFixed(2)} = $${baseAmount.toFixed(2)}`;
  }

  // Step 2: Apply per-trader multiplier from hot-config
  const traderMultiplier = traderOverrides.multiplier || 1.0;
  let finalAmount = baseAmount * traderMultiplier;
  if (traderMultiplier !== 1.0) {
    reasoning += ` → ${traderMultiplier}x trader multiplier = $${finalAmount.toFixed(2)}`;
  }

  // Step 3: Apply tiered multiplier based on leader's trade size
  if (cfg.tieredMultipliers && cfg.tieredMultipliers.length > 0) {
    const tierMultiplier = getTieredMultiplier(cfg.tieredMultipliers, leaderOrderSize);
    finalAmount *= tierMultiplier;
    if (tierMultiplier !== 1.0) {
      reasoning += ` → ${tierMultiplier}x tier = $${finalAmount.toFixed(2)}`;
    }
  }

  let cappedByMax = false;
  let reducedByBalance = false;
  let belowMinimum = false;

  // Step 4: Apply per-trader max trade cap from hot-config
  const traderMaxTrade = traderOverrides.maxTrade || cfg.maxOrderSizeUsd;
  if (finalAmount > traderMaxTrade) {
    finalAmount = traderMaxTrade;
    cappedByMax = true;
    reasoning += ` → Capped at $${traderMaxTrade}`;
  }

  // Step 5: Apply global max order size
  if (finalAmount > cfg.maxOrderSizeUsd) {
    finalAmount = cfg.maxOrderSizeUsd;
    cappedByMax = true;
    reasoning += ` → Global max $${cfg.maxOrderSizeUsd}`;
  }

  // Step 6: Apply max position size limit
  if (cfg.maxPositionSizeUsd && currentPositionSize > 0) {
    const newTotal = currentPositionSize + finalAmount;
    if (newTotal > cfg.maxPositionSizeUsd) {
      const allowed = Math.max(0, cfg.maxPositionSizeUsd - currentPositionSize);
      if (allowed < cfg.minOrderSizeUsd) {
        finalAmount = 0;
        reasoning += ' → Position limit reached';
      } else {
        finalAmount = allowed;
        reasoning += ` → Fit within position limit ($${allowed.toFixed(2)})`;
      }
    }
  }

  // Step 7: Daily volume cap
  if (cfg.maxDailyVolumeUsd) {
    const todayVolume = db.getDailyVolume();
    const remaining = cfg.maxDailyVolumeUsd - todayVolume;
    if (remaining <= 0) {
      finalAmount = 0;
      reasoning += ' → Daily volume limit reached';
    } else if (finalAmount > remaining) {
      finalAmount = remaining;
      reasoning += ` → Capped by daily volume ($${remaining.toFixed(2)} remaining)`;
    }
  }

  // Step 8: Check available balance (with 1% safety buffer)
  const maxAffordable = availableBalance * 0.99;
  if (finalAmount > maxAffordable) {
    finalAmount = maxAffordable;
    reducedByBalance = true;
    reasoning += ` → Reduced to balance ($${maxAffordable.toFixed(2)})`;
  }

  // Step 9: Check minimum order size
  if (finalAmount < cfg.minOrderSizeUsd) {
    belowMinimum = true;
    reasoning += ` → Below minimum $${cfg.minOrderSizeUsd}`;
    finalAmount = 0;
  }

  // Round to cents
  finalAmount = Math.round(finalAmount * 100) / 100;

  return {
    finalAmount,
    baseAmount: Math.round(baseAmount * 100) / 100,
    reasoning,
    cappedByMax,
    reducedByBalance,
    belowMinimum,
    strategy: cfg.strategy,
  };
}

/**
 * Validate strategy config and return any errors
 */
function validateConfig(cfg) {
  const errors = [];
  if (!Object.values(STRATEGIES).includes(cfg.strategy)) {
    errors.push(`Unknown strategy: ${cfg.strategy}. Use PERCENTAGE, FIXED, or ADAPTIVE`);
  }
  if (cfg.copySize <= 0) errors.push('copySize must be positive');
  if (cfg.strategy === STRATEGIES.PERCENTAGE && cfg.copySize > 100) {
    errors.push('copySize for PERCENTAGE should be <= 100');
  }
  if (cfg.maxOrderSizeUsd <= 0) errors.push('maxOrderSizeUsd must be positive');
  if (cfg.minOrderSizeUsd <= 0) errors.push('minOrderSizeUsd must be positive');
  if (cfg.minOrderSizeUsd > cfg.maxOrderSizeUsd) {
    errors.push('minOrderSizeUsd cannot exceed maxOrderSizeUsd');
  }
  return errors;
}

module.exports = {
  STRATEGIES,
  calculateOrderSize,
  getDefaultConfig,
  parseTieredMultipliers,
  getTieredMultiplier,
  validateConfig,
};
