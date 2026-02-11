/**
 * Configuration Validator v1.0
 *
 * Validates all .env configuration before the bot starts.
 * Inspired by Novus-Tech's comprehensive validation with helpful error messages.
 *
 * Run automatically on startup, or standalone: node src/validate-config.js
 */

const log = require('./logger');

const isValidEthAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr);

function validateConfig() {
  const errors = [];
  const warnings = [];

  // ─── Required credentials ────────────────────
  if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === 'your_private_key_here') {
    errors.push(
      'PRIVATE_KEY is not set.\n' +
      '  Fix: Run "node src/setup-keys.js" to derive API keys from your wallet.\n' +
      '  Or manually set PRIVATE_KEY in your .env file.'
    );
  }

  if (process.env.WALLET_ADDRESS && !isValidEthAddress(process.env.WALLET_ADDRESS)) {
    errors.push(
      `WALLET_ADDRESS is invalid: "${process.env.WALLET_ADDRESS}"\n` +
      '  Expected format: 0x followed by 40 hex characters\n' +
      '  Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
    );
  }

  // ─── API credentials ─────────────────────────
  const apiKey = process.env.POLYMARKET_API_KEY;
  const apiSecret = process.env.POLYMARKET_API_SECRET;
  const apiPass = process.env.POLYMARKET_API_PASSPHRASE;

  if (!apiKey || apiKey === 'your_api_key_here') {
    errors.push(
      'POLYMARKET_API_KEY is not set.\n' +
      '  Fix: Run "node src/setup-keys.js" to generate API credentials.\n' +
      '  The setup script derives keys from your wallet automatically.'
    );
  }
  if (!apiSecret || apiSecret === 'your_api_secret_here') {
    errors.push('POLYMARKET_API_SECRET is not set. Run "node src/setup-keys.js".');
  }
  if (!apiPass || apiPass === 'your_passphrase_here') {
    errors.push('POLYMARKET_API_PASSPHRASE is not set. Run "node src/setup-keys.js".');
  }

  // ─── Trader addresses ────────────────────────
  const grinders = (process.env.GRINDER_TRADERS || '').split(',').filter(Boolean);
  const events = (process.env.EVENT_TRADERS || '').split(',').filter(Boolean);
  const totalTraders = grinders.length + events.length;

  if (totalTraders === 0) {
    warnings.push(
      'No traders configured in GRINDER_TRADERS or EVENT_TRADERS.\n' +
      '  You can add traders from the dashboard after starting the bot.\n' +
      '  Or set them in .env: GRINDER_TRADERS=0xAddress1,0xAddress2'
    );
  }

  for (const addr of [...grinders, ...events]) {
    const trimmed = addr.trim();
    if (trimmed && !isValidEthAddress(trimmed)) {
      errors.push(
        `Invalid trader address: "${trimmed}"\n` +
        '  Trader addresses must be valid Ethereum addresses (0x + 40 hex chars).\n' +
        '  Find traders at: https://polymarket.com/leaderboard'
      );
    }
  }

  // ─── Numeric configuration ───────────────────
  const numericChecks = [
    { key: 'MAX_PER_TRADE', min: 1, max: 1000, desc: 'Maximum per-trade size' },
    { key: 'MAX_TOTAL_EXPOSURE', min: 10, max: 100000, desc: 'Maximum total exposure' },
    { key: 'MAX_OPEN_POSITIONS', min: 1, max: 100, desc: 'Maximum open positions' },
    { key: 'DAILY_LOSS_LIMIT', min: 1, max: 10000, desc: 'Daily loss limit' },
    { key: 'EQUITY_STOP_LOSS', min: 0, max: 100000, desc: 'Equity stop-loss floor' },
    { key: 'SLIPPAGE_TOLERANCE', min: 0.1, max: 50, desc: 'Slippage tolerance %' },
    { key: 'POLL_INTERVAL_MS', min: 3000, max: 120000, desc: 'Poll interval (ms)' },
  ];

  for (const check of numericChecks) {
    const val = process.env[check.key];
    if (val !== undefined && val !== '') {
      const num = parseFloat(val);
      if (isNaN(num)) {
        errors.push(`${check.key} is not a valid number: "${val}" (${check.desc})`);
      } else if (num < check.min || num > check.max) {
        warnings.push(`${check.key}=${num} is outside recommended range [${check.min}-${check.max}] (${check.desc})`);
      }
    }
  }

  // ─── Price range validation ──────────────────
  const minPrice = parseFloat(process.env.MIN_PRICE || '0.08');
  const maxPrice = parseFloat(process.env.MAX_PRICE || '0.97');
  if (minPrice >= maxPrice) {
    errors.push(`MIN_PRICE (${minPrice}) must be less than MAX_PRICE (${maxPrice})`);
  }
  if (minPrice < 0.01 || maxPrice > 0.99) {
    warnings.push(`Price range [${minPrice}-${maxPrice}] is very wide. Polymarket prices are typically 0.01-0.99.`);
  }

  // ─── Copy strategy validation ────────────────
  const strategy = (process.env.COPY_STRATEGY || 'PERCENTAGE').toUpperCase();
  if (!['PERCENTAGE', 'FIXED', 'ADAPTIVE'].includes(strategy)) {
    errors.push(
      `Unknown COPY_STRATEGY: "${process.env.COPY_STRATEGY}"\n` +
      '  Valid options: PERCENTAGE, FIXED, ADAPTIVE\n' +
      '  PERCENTAGE: Copy a % of leader\'s trade size (default)\n' +
      '  FIXED: Use a fixed $ amount per trade\n' +
      '  ADAPTIVE: Auto-scale % based on trade size'
    );
  }

  // ─── Dashboard password ──────────────────────
  const dashPassword = process.env.DASHBOARD_PASSWORD || 'changeme123';
  if (dashPassword === 'changeme123') {
    warnings.push(
      'Using default DASHBOARD_PASSWORD. Change it in .env for security.\n' +
      '  Set: DASHBOARD_PASSWORD=your_secure_password'
    );
  }

  // ─── URL validation ──────────────────────────
  const clobUrl = process.env.POLYMARKET_CLOB_URL || '';
  if (clobUrl && !clobUrl.startsWith('http')) {
    errors.push(
      `Invalid POLYMARKET_CLOB_URL: "${clobUrl}"\n` +
      '  Default: https://clob.polymarket.com'
    );
  }

  // ─── Report results ──────────────────────────
  if (errors.length > 0) {
    console.error('\n  ╔══════════════════════════════════════════════╗');
    console.error('  ║  CONFIGURATION ERRORS                         ║');
    console.error('  ╚══════════════════════════════════════════════╝\n');
    errors.forEach((err, i) => {
      console.error(`  ${i + 1}. ${err}\n`);
    });
    console.error('  Fix these errors in your .env file and restart.\n');
  }

  if (warnings.length > 0 && errors.length === 0) {
    warnings.forEach(w => log.warn(`Config: ${w}`));
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Allow running standalone: node src/validate-config.js
if (require.main === module) {
  require('dotenv').config();
  const result = validateConfig();
  if (result.valid) {
    console.log('\n  ✅ Configuration is valid!\n');
    if (result.warnings.length > 0) {
      console.log(`  ⚠️  ${result.warnings.length} warning(s) — see above.\n`);
    }
  } else {
    process.exit(1);
  }
}

module.exports = { validateConfig };
