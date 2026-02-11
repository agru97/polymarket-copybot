/**
 * Trade Executor v2.0
 *
 * Handles all trade execution via the Polymarket CLOB API.
 *
 * Features:
 *   - Real CLOB client initialization with credential validation
 *   - Order verification after placement (checks fill status)
 *   - USDC balance checking from Polygon chain
 *   - Slippage protection with real-time price checks
 *   - Fill-or-Kill (FOK) market orders for instant execution
 */

const { ClobClient, Side, OrderType } = require('@polymarket/clob-client');
const { Wallet, ethers } = require('ethers');
const { config } = require('./config');
const risk = require('./risk');
const db = require('./db');
const log = require('./logger');

// USDC on Polygon (6 decimals)
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const POLYGON_RPC = 'https://polygon-rpc.com';

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
];

let clobClient = null;
let provider = null;
let walletSigner = null;

async function initClobClient() {
  if (config.bot.dryRun) {
    log.info('DRY RUN mode — trades will be simulated, not executed');
    return;
  }

  // Validate credentials
  if (!config.wallet.privateKey || config.wallet.privateKey === 'your_private_key_here') {
    throw new Error('PRIVATE_KEY not set in .env — run "node src/setup-keys.js" first');
  }
  if (!config.api.key || config.api.key === 'your_api_key_here') {
    throw new Error('API credentials not set in .env — run "node src/setup-keys.js" first');
  }

  try {
    // Create provider and signer for on-chain reads
    provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
    walletSigner = new Wallet(config.wallet.privateKey, provider);

    const creds = {
      key: config.api.key,
      secret: config.api.secret,
      passphrase: config.api.passphrase,
    };

    clobClient = new ClobClient(
      config.api.clobUrl,
      137,
      walletSigner,
      creds,
      0,
      config.wallet.address || walletSigner.address
    );

    log.info('CLOB client initialized for LIVE trading');
    log.info(`Wallet: ${walletSigner.address}`);

    // Check balances on startup
    const usdcBalance = await getUSDCBalance();
    if (usdcBalance !== null) {
      log.info(`USDC balance: $${usdcBalance.toFixed(2)}`);
      if (usdcBalance < 5) log.warn('Low USDC — fund your wallet before trading');
    }

    const maticBal = await provider.getBalance(walletSigner.address);
    const matic = parseFloat(ethers.utils.formatEther(maticBal));
    log.info(`MATIC balance: ${matic.toFixed(4)}`);
    if (matic < 0.01) log.warn('Low MATIC — you need gas for transactions');

  } catch (err) {
    log.error(`Failed to init CLOB client: ${err.message}`);
    throw err;
  }
}

/**
 * Get USDC balance from Polygon chain
 */
async function getUSDCBalance() {
  if (!provider || !walletSigner) return null;
  try {
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    const balance = await usdc.balanceOf(walletSigner.address);
    return parseFloat(ethers.utils.formatUnits(balance, 6));
  } catch (err) {
    log.warn(`Could not fetch USDC balance: ${err.message}`);
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
 * Execute a trade signal
 */
async function executeSignal(signal, currentEquity) {
  const { type, bucket, marketId, tokenId, side, size: leaderSize, price, traderAddress, marketName } = signal;

  // Handle close signals
  if (type === 'CLOSE') {
    log.info(`CLOSE from ${traderAddress.slice(0, 10)}... — logged`);
    db.logTrade({
      traderAddress, bucket, marketId, marketName, side: `CLOSE_${side}`,
      price, sizeUsd: 0, leaderSizeUsd: leaderSize, status: 'skipped',
      dryRun: config.bot.dryRun, notes: 'Mirror-sell not yet implemented',
    });
    return null;
  }

  // Calculate position size
  const ourSize = risk.calculatePositionSize(bucket, leaderSize);

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

    // Place FOK market order
    const orderSide = (side === 'YES' || side === 'BUY') ? Side.BUY : Side.SELL;
    const order = await clobClient.createAndPostMarketOrder(
      { tokenID: tokenId, side: orderSide, amount: ourSize.toFixed(2) },
      OrderType.FOK
    );

    const orderId = order.orderID || order.id || `live_${Date.now()}`;
    const status = order.status || 'MATCHED';
    const txHashes = order.transactionsHashes || [];

    // Check fill status
    if (status === 'MATCHED' || status === 'FILLED' || status === 'SUCCESS') {
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
    return null;
  }
}

module.exports = { initClobClient, executeSignal, getMarketPrice, getUSDCBalance };
