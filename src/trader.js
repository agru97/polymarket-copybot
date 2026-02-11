/**
 * Trade Executor v2.3
 *
 * Handles all trade execution via the Polymarket CLOB API.
 * Matches Novus-Tech professional patterns with order book walking,
 * allowance checking, retry logic, and proportional sells.
 *
 * v2.3 changes:
 *   - Order book walking for illiquid markets
 *   - Allowance check before trades
 *   - Proportional close (leader reduces 30% → we sell 30%)
 *   - Audit logging integration
 *
 * v2.2 changes:
 *   - Position closing: full mirror-sell execution when leaders exit
 *   - PnL calculation: realized PnL tracked per position (side-aware)
 *   - Copy strategy engine: PERCENTAGE / FIXED / ADAPTIVE sizing
 *   - Per-trader overrides from hot-config (multiplier, maxTrade)
 *   - Order retry with permanent failure detection
 *   - Token-based sell amounts (not USD)
 */

const { ClobClient, Side, OrderType } = require('@polymarket/clob-client');
const { Wallet, ethers } = require('ethers');
const { config } = require('./config');
const risk = require('./risk');
const db = require('./db');
const log = require('./logger');
const hotConfig = require('./hot-config');
const { calculateOrderSize } = require('./copy-strategy');
const C = require('./constants');

let clobClient = null;
let provider = null;
let walletSigner = null;

/**
 * Calculate PnL for a closed position
 * Side-aware: handles both BUY (YES) and SELL (NO) positions correctly
 */
function calculatePnl(entryPrice, exitPrice, sizeUsd, side) {
  if (!entryPrice || entryPrice <= 0 || !exitPrice) return 0;
  const shares = sizeUsd / entryPrice;

  // BUY/YES positions: profit when price goes up
  // SELL/NO positions: profit when price goes down
  const isBuy = !side || side === 'BUY' || side === 'YES' || side.startsWith('CLOSE_YES') || side.startsWith('CLOSE_BUY');
  let pnl;
  if (isBuy) {
    pnl = (shares * exitPrice) - sizeUsd;
  } else {
    // For NO/SELL: you sold at entryPrice, buy-back at exitPrice
    pnl = sizeUsd - (shares * exitPrice);
  }
  return Math.round(pnl * 100) / 100;
}

/**
 * Calculate token count from position (not just USD)
 * Critical fix: sell orders must use token count, not USD notional
 */
function getTokenCount(sizeUsd, entryPrice) {
  if (!entryPrice || entryPrice <= 0) return sizeUsd; // fallback
  return sizeUsd / entryPrice;
}

/**
 * Place a market order with retry logic (Novus-Tech pattern)
 * Retries up to MAX_RETRIES on transient failures, with backoff
 */
const MAX_ORDER_RETRIES = 2;
async function placeOrderWithRetry(params, orderType) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_ORDER_RETRIES; attempt++) {
    try {
      const order = await clobClient.createAndPostMarketOrder(params, orderType);
      return order;
    } catch (err) {
      lastError = err;
      const errMsg = (err.message || '').toLowerCase();

      // Don't retry on permanent failures (insufficient funds, allowance, bad request)
      if (errMsg.includes('balance') || errMsg.includes('allowance') ||
          errMsg.includes('invalid') || errMsg.includes('bad request') ||
          errMsg.includes('unauthorized')) {
        throw err; // Permanent — no retry
      }

      if (attempt < MAX_ORDER_RETRIES) {
        const waitMs = (attempt + 1) * 1500; // 1.5s, 3s
        log.warn(`Order attempt ${attempt + 1} failed (${err.message}) — retrying in ${waitMs / 1000}s`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError;
}

async function initClobClient() {
  // Validate wallet credentials (needed for both dry-run and live)
  if (!config.wallet.privateKey || config.wallet.privateKey === 'your_private_key_here') {
    throw new Error('PRIVATE_KEY not set in .env — run "node src/setup-keys.js" first');
  }

  try {
    // Always create provider + signer — needed for balance reads even in dry-run
    provider = new ethers.providers.JsonRpcProvider(C.POLYGON_RPC);
    walletSigner = new Wallet(config.wallet.privateKey, provider);
    log.info(`Wallet: ${walletSigner.address}`);

    if (config.bot.dryRun) {
      log.info('DRY RUN mode — trades will be simulated, not executed');
      // Skip CLOB client setup but still read balances
    } else {
      // Validate API credentials for live trading
      if (!config.api.key || config.api.key === 'your_api_key_here') {
        throw new Error('API credentials not set in .env — run "node src/setup-keys.js" first');
      }

      const creds = {
        key: config.api.key,
        secret: config.api.secret,
        passphrase: config.api.passphrase,
      };

      clobClient = new ClobClient(
        config.api.clobUrl,
        C.POLYGON_CHAIN_ID,
        walletSigner,
        creds,
        0,
        config.wallet.address || walletSigner.address
      );

      log.info('CLOB client initialized for LIVE trading');
    }

    // Check balances on startup (both modes)
    const usdcBalance = await getUSDCBalance();
    if (usdcBalance !== null) {
      log.info(`USDC.e balance: $${usdcBalance.toFixed(2)}`);
      if (usdcBalance < 5 && !config.bot.dryRun) log.warn('Low USDC — fund your wallet before trading');
    }

    const maticBal = await provider.getBalance(walletSigner.address);
    const matic = parseFloat(ethers.utils.formatEther(maticBal));
    log.info(`MATIC balance: ${matic.toFixed(4)}`);
    if (matic < 0.01 && !config.bot.dryRun) log.warn('Low MATIC — you need gas for transactions');

  } catch (err) {
    log.error(`Failed to init: ${err.message}`);
    throw err;
  }
}

/**
 * Get USDC balance from Polygon chain (tries primary RPC then fallbacks)
 */
async function getUSDCBalance() {
  if (!provider || !walletSigner) return null;

  // Try primary provider first
  try {
    const usdc = new ethers.Contract(C.USDC_ADDRESS, C.ERC20_ABI, provider);
    const balance = await usdc.balanceOf(walletSigner.address);
    return parseFloat(ethers.utils.formatUnits(balance, C.USDC_DECIMALS));
  } catch (primaryErr) {
    log.warn(`Primary RPC balance fetch failed: ${primaryErr.message}`);
  }

  // Try fallback RPCs
  for (const rpc of (C.POLYGON_RPC_FALLBACKS || [])) {
    try {
      const fallbackProvider = new ethers.providers.JsonRpcProvider(rpc);
      const usdc = new ethers.Contract(C.USDC_ADDRESS, C.ERC20_ABI, fallbackProvider);
      const balance = await usdc.balanceOf(walletSigner.address);
      log.info(`Balance fetched via fallback RPC: ${rpc}`);
      return parseFloat(ethers.utils.formatUnits(balance, C.USDC_DECIMALS));
    } catch (err) {
      log.debug(`Fallback RPC ${rpc} failed: ${err.message}`);
    }
  }

  log.warn('All RPCs failed to fetch USDC balance');
  return null;
}

/**
 * Check USDC allowance for CTF Exchange (Novus-Tech pattern)
 * Ensures the exchange can spend our USDC before we try to trade
 */
async function checkAllowance() {
  if (!provider || !walletSigner) return null;
  try {
    const usdc = new ethers.Contract(C.USDC_ADDRESS, C.ERC20_ABI, provider);
    const allowance = await usdc.allowance(walletSigner.address, C.CTF_EXCHANGE);
    return parseFloat(ethers.utils.formatUnits(allowance, C.USDC_DECIMALS));
  } catch (err) {
    log.warn(`Could not check allowance: ${err.message}`);
    return null;
  }
}

/**
 * Fetch the current best price for a token
 */
async function getMarketPrice(tokenId, side) {
  if (!clobClient) return null;
  try {
    const querySide = (side === 'YES' || side === 'BUY') ? 'SELL' : 'BUY';
    const priceData = await clobClient.getPrice(tokenId, querySide);
    return parseFloat(priceData.price);
  } catch (err) {
    log.warn(`Could not fetch market price: ${err.message}`);
    return null;
  }
}

/**
 * Order Book Walking (Novus-Tech pattern)
 *
 * Fetches the order book and walks through price levels to calculate
 * the effective fill price for a given order amount. This handles
 * illiquid markets where a single level can't fill the full order.
 *
 * Returns: { effectivePrice, fillable, levels } or null on error
 */
async function getBookWalkPrice(tokenId, side, amountUsd) {
  if (!clobClient) return null;
  try {
    const book = await clobClient.getOrderBook(tokenId);
    if (!book) return null;

    // For BUY: walk the asks (sellers). For SELL: walk the bids (buyers).
    const isBuy = (side === 'YES' || side === 'BUY');
    const levels = isBuy ? (book.asks || []) : (book.bids || []);

    if (levels.length === 0) return null;

    let remaining = amountUsd;
    let totalCost = 0;
    let totalTokens = 0;
    let levelsUsed = 0;
    const bestPrice = parseFloat(levels[0].price);

    for (const level of levels) {
      if (levelsUsed >= C.MAX_BOOK_DEPTH) break;

      const levelPrice = parseFloat(level.price);
      const levelSize = parseFloat(level.size);
      const levelValue = levelSize * levelPrice;

      // Check slippage from best price
      const slippage = Math.abs(levelPrice - bestPrice) / bestPrice * 100;
      if (slippage > C.MAX_BOOK_SLIPPAGE_PCT) {
        log.debug(`Book walk: stopping at level ${levelsUsed + 1}, slippage ${slippage.toFixed(1)}% > ${C.MAX_BOOK_SLIPPAGE_PCT}%`);
        break;
      }

      if (levelValue < C.MIN_BOOK_LIQUIDITY_USD) continue;

      const fillFromLevel = Math.min(remaining, levelValue);
      const tokensFromLevel = fillFromLevel / levelPrice;

      totalCost += fillFromLevel;
      totalTokens += tokensFromLevel;
      remaining -= fillFromLevel;
      levelsUsed++;

      if (remaining <= 0.01) break; // Filled
    }

    const filled = totalCost > 0;
    const effectivePrice = filled ? totalCost / totalTokens : null;
    const fillable = amountUsd - remaining;

    return {
      effectivePrice: effectivePrice ? Math.round(effectivePrice * 10000) / 10000 : null,
      fillable: Math.round(fillable * 100) / 100,
      fullyFillable: remaining <= 0.01,
      levels: levelsUsed,
      bestPrice,
      slippageFromBest: effectivePrice ? Math.round(Math.abs(effectivePrice - bestPrice) / bestPrice * 10000) / 100 : 0,
    };
  } catch (err) {
    log.debug(`Book walk failed: ${err.message}`);
    return null;
  }
}

/**
 * Execute a trade signal
 */
async function executeSignal(signal, currentEquity) {
  const { type, bucket, marketId, tokenId, side, size: leaderSize, price, traderAddress, marketName } = signal;

  // Handle close signals — mirror-sell our position
  if (type === 'CLOSE') {
    const isPartial = signal.isPartialClose === true;
    log.info(`${isPartial ? 'PARTIAL ' : ''}CLOSE from ${traderAddress.slice(0, 10)}... — executing mirror-sell`);

    // Find our open position for this market
    const ourPosition = db.getOpenPositionByMarket(marketId, tokenId);
    if (!ourPosition) {
      log.info(`No open position to close for market ${(marketName || marketId).slice(0, 40)}`);
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
        price, sizeUsd: 0, leaderSizeUsd: leaderSize, status: 'no_position',
        dryRun: config.bot.dryRun, notes: 'No matching open position found',
      });
      return null;
    }

    // Proportional close (Novus-Tech pattern):
    // If leader reduced by 30%, we sell 30% of our position too
    let closeSize = ourPosition.size_usd;
    if (isPartial && leaderSize > 0 && leaderSize < ourPosition.size_usd) {
      // leaderSize in a partial close = the decrease amount
      // Calculate proportion: what fraction of our position to sell
      const knownLeaderPositions = db.getTraderPositions(traderAddress);
      const knownLeader = knownLeaderPositions.find(p => p.market_id === marketId && p.token_id === tokenId);
      if (knownLeader && knownLeader.size > 0) {
        const closeFraction = leaderSize / (knownLeader.size + leaderSize); // decrease / original
        closeSize = Math.round(ourPosition.size_usd * closeFraction * 100) / 100;
        log.info(`Proportional close: leader closed ${(closeFraction * 100).toFixed(0)}% → selling $${closeSize.toFixed(2)} of $${ourPosition.size_usd.toFixed(2)}`);
      }
    }

    // Calculate token-based sell amount (not USD — critical fix from audit)
    const tokens = getTokenCount(closeSize, ourPosition.entry_price);

    // === DRY RUN CLOSE ===
    if (config.bot.dryRun) {
      // Use real market price for PnL — the CLOSE signal's price is the leader's OLD entry (cost basis),
      // not the actual exit price, so it would always show $0 PnL. Fetch current market price instead.
      const marketPrice = await getMarketPrice(tokenId, 'SELL');
      const exitPrice = marketPrice || price || ourPosition.current_price || ourPosition.entry_price;
      const pnl = calculatePnl(ourPosition.entry_price, exitPrice, closeSize, ourPosition.side);
      log.info(`SIM ${isPartial ? 'PARTIAL ' : ''}CLOSE: Sell ${tokens.toFixed(2)} tokens ($${closeSize.toFixed(2)}) on "${(marketName || marketId).slice(0, 40)}" | Entry: ${ourPosition.entry_price} → Exit: ${exitPrice} | PnL: $${pnl.toFixed(2)}`);
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
        price: exitPrice, sizeUsd: closeSize, leaderSizeUsd: leaderSize,
        status: 'simulated', dryRun: true, pnl,
        notes: `Simulated ${isPartial ? 'partial ' : ''}close. ${tokens.toFixed(2)} tokens. PnL: $${pnl.toFixed(2)}`,
      });
      if (isPartial) {
        // Partial close: reduce position size, don't close entirely
        const d = db.getDb();
        const remainingSize = ourPosition.size_usd - closeSize;
        d.prepare(`UPDATE positions SET size_usd = ?, current_price = ?, unrealized_pnl = ? WHERE id = ?`)
          .run(Math.round(remainingSize * 100) / 100, exitPrice, 0, ourPosition.id);
      } else {
        db.closePositionWithPnl(marketId, tokenId, exitPrice, pnl);
      }
      return { simulated: true, closed: !isPartial, partial: isPartial, size: closeSize, pnl };
    }

    // === LIVE CLOSE ===
    if (!clobClient) {
      log.error('CLOB client not initialized — cannot close position');
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
        price, sizeUsd: closeSize, leaderSizeUsd: leaderSize,
        status: 'failed', dryRun: false, notes: 'CLOB client not initialized',
      });
      return null;
    }

    try {
      // Get current market price for the sell
      const currentPrice = await getMarketPrice(tokenId, 'SELL');
      const sellPrice = currentPrice || price || ourPosition.entry_price;

      // Slippage check for sell — enforce limit (don't bypass)
      if (currentPrice && price > 0) {
        const slip = risk.checkSlippage(price, currentPrice);
        if (!slip.ok && slip.slippage > C.CLOSE_SLIPPAGE_HARD_LIMIT) {
          log.error(`CLOSE SLIPPAGE TOO HIGH: ${slip.reason} — aborting to preserve capital`);
          db.logTrade({
            traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
            price: currentPrice, sizeUsd: closeSize, leaderSizeUsd: leaderSize,
            status: 'slippage_blocked', dryRun: false,
            notes: `Close blocked: slippage ${slip.slippage.toFixed(2)}% > ${C.CLOSE_SLIPPAGE_HARD_LIMIT}% max`,
          });
          return null;
        }
        if (!slip.ok) {
          log.warn(`SELL SLIPPAGE: ${slip.reason} — closing within tolerance`);
        }
      }

      // Order book walk: check liquidity before placing order (Novus-Tech pattern)
      const bookWalk = await getBookWalkPrice(tokenId, 'SELL', closeSize);
      if (bookWalk && !bookWalk.fullyFillable) {
        log.warn(`Book walk: only $${bookWalk.fillable} fillable of $${closeSize.toFixed(2)} (${bookWalk.levels} levels)`);
      }

      // Use token-based sell amount (critical fix: not USD notional)
      const sellAmountUsd = (tokens * sellPrice).toFixed(2);
      log.info(`EXEC ${isPartial ? 'PARTIAL ' : ''}CLOSE: Sell ${tokens.toFixed(2)} tokens (~$${sellAmountUsd}) on "${(marketName || marketId).slice(0, 40)}" @ ~${sellPrice}`);

      // Place FOK sell order (with retry on transient failures)
      const orderSide = Side.SELL;
      const order = await placeOrderWithRetry(
        { tokenID: tokenId, side: orderSide, amount: sellAmountUsd },
        OrderType.FOK
      );

      // Validate order response (don't assume success)
      if (!order || typeof order !== 'object') {
        log.error(`Invalid order response: ${JSON.stringify(order).slice(0, 200)}`);
        db.logTrade({
          traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
          price: sellPrice, sizeUsd: closeSize, leaderSizeUsd: leaderSize,
          status: 'failed', dryRun: false, notes: 'Invalid order response from CLOB',
        });
        return null;
      }

      const orderId = order.orderID || order.id;
      if (!orderId) {
        log.error('Order response missing orderID — rejecting');
        db.logTrade({
          traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
          price: sellPrice, sizeUsd: closeSize, leaderSizeUsd: leaderSize,
          status: 'failed', dryRun: false, notes: 'Missing orderId in response',
        });
        return null;
      }

      const orderStatus = String(order.status || order.orderStatus || 'UNKNOWN').toUpperCase();
      const exitPrice = currentPrice || price;
      const pnl = calculatePnl(ourPosition.entry_price, exitPrice, closeSize, ourPosition.side);

      if (C.VALID_ORDER_STATUSES.includes(orderStatus)) {
        db.logTrade({
          traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
          price: exitPrice, sizeUsd: closeSize, leaderSizeUsd: leaderSize,
          status: 'executed', orderId, dryRun: false, pnl,
          notes: `${isPartial ? 'Partial c' : 'C'}losed. ${tokens.toFixed(2)} tokens. PnL: $${pnl.toFixed(2)}`,
        });
        db.logAudit(C.AUDIT_ACTIONS.TRADE_EXECUTED, `CLOSE ${side} $${closeSize.toFixed(2)} | PnL: $${pnl.toFixed(2)}`);

        if (isPartial) {
          // Reduce position size, don't close entirely
          const d = db.getDb();
          const remainingSize = ourPosition.size_usd - closeSize;
          d.prepare(`UPDATE positions SET size_usd = ?, current_price = ? WHERE id = ?`)
            .run(Math.round(remainingSize * 100) / 100, exitPrice, ourPosition.id);
        } else {
          db.closePositionWithPnl(marketId, tokenId, exitPrice, pnl);
        }
        log.info(`${isPartial ? 'PARTIAL ' : ''}CLOSED: ${orderId} — ${tokens.toFixed(2)} tokens | PnL: $${pnl.toFixed(2)}`);
        return { executed: true, closed: !isPartial, partial: isPartial, orderId, size: closeSize, pnl };
      } else {
        db.logTrade({
          traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
          price: exitPrice, sizeUsd: closeSize, leaderSizeUsd: leaderSize,
          status: 'rejected', orderId, dryRun: false,
          notes: `FOK sell rejected: ${orderStatus}`,
        });
        log.warn(`CLOSE REJECTED: ${orderId} — ${orderStatus}`);
        return null;
      }

    } catch (err) {
      // Detect insufficient funds/allowance specifically
      const errMsg = err.message || '';
      if (errMsg.toLowerCase().includes('balance') || errMsg.toLowerCase().includes('allowance')) {
        log.error(`CLOSE FAILED (funds/allowance): ${errMsg}`);
      } else {
        log.error(`CLOSE FAILED: ${errMsg}`);
      }
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
        price, sizeUsd: closeSize, leaderSizeUsd: leaderSize,
        status: 'failed', dryRun: false, notes: `Close error: ${errMsg}`,
      });
      db.logAudit(C.AUDIT_ACTIONS.TRADE_FAILED, `CLOSE ${side}: ${errMsg}`);
      return null;
    }
  }

  // Calculate position size using copy strategy engine
  const traderConfig = hotConfig.getTraderConfig(traderAddress) || {};
  const traderOverrides = {
    multiplier: traderConfig.multiplier || undefined,
    maxTrade: traderConfig.maxTrade || undefined,
  };

  // Get current position for this market (to check position limits)
  const existingPosition = db.getOpenPositionByMarket(marketId, tokenId);
  const currentPositionSize = existingPosition ? existingPosition.size_usd : 0;

  // Get balance for sizing (use chain balance or fallback to equity estimate)
  const availableBalance = config.bot.dryRun ? currentEquity : ((await getUSDCBalance()) || currentEquity);

  const orderCalc = calculateOrderSize(
    {}, // use defaults from .env
    leaderSize,
    availableBalance,
    currentPositionSize,
    traderOverrides
  );

  let ourSize = orderCalc.finalAmount;
  if (ourSize === 0) {
    log.info(`SKIP: ${orderCalc.reasoning}`);
    db.logTrade({
      traderAddress, bucket, marketId, marketName, side, price,
      sizeUsd: 0, leaderSizeUsd: leaderSize, status: 'filtered',
      dryRun: config.bot.dryRun, notes: orderCalc.reasoning,
    });
    return null;
  }
  log.info(`SIZE: ${orderCalc.reasoning}`);

  // Price filter
  const priceCheck = risk.checkPriceFilter(price);
  if (!priceCheck.ok) {
    log.debug(`SKIP: ${priceCheck.reason}`);
    db.logTrade({
      traderAddress, bucket, marketId, marketName, side, price,
      sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'filtered',
      dryRun: config.bot.dryRun, notes: priceCheck.reason,
    });
    return null;
  }

  // Risk limits
  const riskCheck = risk.checkRiskLimits(bucket, ourSize, currentEquity);
  if (!riskCheck.allowed) {
    log.warn(`BLOCKED: ${riskCheck.reasons.join('; ')}`);
    db.logTrade({
      traderAddress, bucket, marketId, marketName, side, price,
      sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'risk_blocked',
      dryRun: config.bot.dryRun, notes: riskCheck.reasons.join('; '),
    });
    return null;
  }

  // ═══════════════════════════
  //  DRY RUN
  // ═══════════════════════════
  if (config.bot.dryRun) {
    log.info(`SIM: ${side} $${ourSize.toFixed(2)} on "${(marketName || marketId).slice(0, 50)}" @ ${price}`);
    db.logTrade({
      traderAddress, bucket, marketId, marketName, side, price,
      sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'simulated',
      dryRun: true, notes: `Simulated $${ourSize.toFixed(2)}`,
    });
    db.upsertPosition({ marketId, tokenId, side, entryPrice: price, sizeUsd: ourSize, traderAddress, bucket });
    return { simulated: true, size: ourSize, price };
  }

  // ═══════════════════════════
  //  LIVE EXECUTION
  // ═══════════════════════════
  if (!clobClient) {
    log.error('CLOB client not initialized');
    db.logTrade({
      traderAddress, bucket, marketId, marketName, side, price,
      sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'failed',
      dryRun: false, notes: 'CLOB client not initialized',
    });
    return null;
  }

  try {
    // Pre-trade balance check
    const balance = await getUSDCBalance();
    if (balance !== null && balance < ourSize) {
      log.warn(`Insufficient USDC: need $${ourSize.toFixed(2)}, have $${balance.toFixed(2)}`);
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side, price,
        sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'failed',
        dryRun: false, notes: `Insufficient USDC: $${balance.toFixed(2)}`,
      });
      return null;
    }

    // Pre-trade allowance check (Novus-Tech pattern)
    const allowance = await checkAllowance();
    if (allowance !== null && allowance < ourSize) {
      log.error(`Insufficient USDC allowance: need $${ourSize.toFixed(2)}, approved $${allowance.toFixed(2)}. Run 'node src/setup-keys.js' to set allowance.`);
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side, price,
        sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'failed',
        dryRun: false, notes: `Insufficient allowance: $${allowance.toFixed(2)}`,
      });
      return null;
    }

    // Order book walk: check liquidity (Novus-Tech pattern)
    const bookWalk = await getBookWalkPrice(tokenId, side, ourSize);
    if (bookWalk) {
      if (!bookWalk.fullyFillable) {
        log.warn(`Thin book: only $${bookWalk.fillable} of $${ourSize.toFixed(2)} fillable across ${bookWalk.levels} levels`);
        if (bookWalk.fillable < ourSize * 0.5) {
          log.warn(`SKIP: Book too thin — less than 50% fillable`);
          db.logTrade({
            traderAddress, bucket, marketId, marketName, side, price,
            sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'filtered',
            dryRun: false, notes: `Book too thin: $${bookWalk.fillable} of $${ourSize.toFixed(2)} fillable`,
          });
          return null;
        }
      }
      if (bookWalk.slippageFromBest > C.MAX_BOOK_SLIPPAGE_PCT) {
        log.warn(`Book walk slippage: ${bookWalk.slippageFromBest}% > ${C.MAX_BOOK_SLIPPAGE_PCT}%`);
      }
    }

    // Slippage check
    const currentPrice = await getMarketPrice(tokenId, side);
    if (currentPrice) {
      const slip = risk.checkSlippage(price, currentPrice);
      if (!slip.ok) {
        log.warn(`SLIPPAGE: ${slip.reason}`);
        db.logTrade({
          traderAddress, bucket, marketId, marketName, side, price,
          sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'slippage_blocked',
          dryRun: false, notes: slip.reason,
        });
        return null;
      }
    }

    log.info(`EXEC: ${side} $${ourSize.toFixed(2)} on "${(marketName || marketId).slice(0, 40)}" @ ~${currentPrice || price}`);

    // Place FOK market order (with retry on transient failures)
    const orderSide = (side === 'YES' || side === 'BUY') ? Side.BUY : Side.SELL;
    const order = await placeOrderWithRetry(
      { tokenID: tokenId, side: orderSide, amount: ourSize.toFixed(2) },
      OrderType.FOK
    );

    // Validate order response (don't assume success — audit fix)
    if (!order || typeof order !== 'object') {
      log.error(`Invalid order response: ${JSON.stringify(order).slice(0, 200)}`);
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side, price,
        sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'failed',
        dryRun: false, notes: 'Invalid order response',
      });
      return null;
    }

    const orderId = order.orderID || order.id;
    if (!orderId) {
      log.error('Order response missing orderID — rejecting as unsafe');
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side, price,
        sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'failed',
        dryRun: false, notes: 'Missing orderId — phantom trade prevention',
      });
      return null;
    }

    const status = String(order.status || order.orderStatus || 'UNKNOWN').toUpperCase();
    const txHashes = order.transactionsHashes || [];

    // Check fill status
    if (C.VALID_ORDER_STATUSES.includes(status)) {
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side,
        price: currentPrice || price,
        sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'executed',
        orderId, dryRun: false,
        notes: `FOK ${status}${txHashes.length ? ' tx:' + txHashes[0].slice(0, 14) : ''}`,
      });
      db.upsertPosition({
        marketId, tokenId, side,
        entryPrice: currentPrice || price,
        sizeUsd: ourSize, traderAddress, bucket,
      });
      db.logAudit(C.AUDIT_ACTIONS.TRADE_EXECUTED, `${side} $${ourSize.toFixed(2)} on ${(marketName || marketId).slice(0, 30)}`);
      log.info(`FILLED: ${orderId} — $${ourSize.toFixed(2)} @ ${currentPrice || price}`);
      return { executed: true, orderId, size: ourSize, price: currentPrice || price };
    } else {
      // FOK was rejected
      db.logTrade({
        traderAddress, bucket, marketId, marketName, side, price,
        sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'rejected',
        orderId, dryRun: false, notes: `FOK rejected: ${status}`,
      });
      log.warn(`REJECTED: ${orderId} — ${status}`);
      return null;
    }

  } catch (err) {
    log.error(`EXEC FAILED: ${err.message}`);
    db.logTrade({
      traderAddress, bucket, marketId, marketName, side, price,
      sizeUsd: ourSize, leaderSizeUsd: leaderSize, status: 'failed',
      dryRun: false, notes: `Error: ${err.message}`,
    });
    db.logAudit(C.AUDIT_ACTIONS.TRADE_FAILED, `${side}: ${err.message}`);
    return null;
  }
}

module.exports = { initClobClient, executeSignal, getMarketPrice, getUSDCBalance, checkAllowance, getBookWalkPrice };
