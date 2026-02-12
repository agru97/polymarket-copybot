/**
 * Centralized Constants v2.2
 *
 * All magic numbers and configuration constants in one place.
 * Matches the Novus-Tech pattern of having a single source of truth.
 */

module.exports = {
  // ─── Network ──────────────────────────────────
  POLYGON_CHAIN_ID: 137,
  POLYGON_RPC: process.env.POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com',
  POLYGON_RPC_FALLBACKS: [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.llamarpc.com',
    'https://polygon-rpc.com',
  ],
  USDC_ADDRESS: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  USDC_DECIMALS: 6,
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',           // Polymarket CTF Exchange
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',  // Polymarket Neg Risk CTF Exchange

  // ─── API Endpoints ────────────────────────────
  POLYMARKET_DATA_API: 'https://data-api.polymarket.com',
  POLYMARKET_CLOB_API: 'https://clob.polymarket.com',

  // ─── Trading ──────────────────────────────────
  ORDER_TYPES: {
    FOK: 'FOK',      // Fill-or-Kill — instant execution
    GTC: 'GTC',      // Good-til-Cancelled — sits on book
  },
  VALID_ORDER_STATUSES: ['MATCHED', 'FILLED', 'SUCCESS', 'ACCEPTED'],
  MAX_ORDER_RETRIES: 2,
  RETRY_BACKOFF_BASE_MS: 1500,

  // Permanent error keywords — don't retry these
  PERMANENT_ERROR_KEYWORDS: ['balance', 'allowance', 'invalid', 'bad request', 'unauthorized'],

  // ─── Order Book Walking ───────────────────────
  MAX_BOOK_DEPTH: 20,              // Max price levels to walk
  MAX_BOOK_SLIPPAGE_PCT: 3,        // Max acceptable slippage from best price
  MIN_BOOK_LIQUIDITY_USD: 5,       // Minimum liquidity to consider a level

  // ─── Risk Limits ──────────────────────────────
  CLOSE_SLIPPAGE_HARD_LIMIT: 5,    // Block close if slippage > 5%
  CONSECUTIVE_LOSS_COOLDOWN_H: 6,  // Hours to cool off after 3 losses
  CONSECUTIVE_LOSS_THRESHOLD: 3,   // Losses before cooldown

  // ─── Monitoring ───────────────────────────────
  SIGNAL_DEDUP_TTL_MS: 5 * 60 * 1000,     // 5 min dedup window
  POSITION_CHANGE_THRESHOLD: 0.15,          // 15% change to trigger signal
  SCANNER_CONCURRENCY: 3,                   // Max parallel trader scans
  SCANNER_BATCH_DELAY_MS: 300,              // Delay between scan batches

  // ─── Aggregation ──────────────────────────────
  MAX_BUFFER_SIGNALS: 500,
  MAX_PER_AGGREGATION_KEY: 50,
  STALE_AGGREGATION_MULTIPLIER: 2,          // 2x window = force expire

  // ─── Equity & Snapshots ───────────────────────
  EQUITY_UPDATE_INTERVAL: 30,               // Every N cycles
  SNAPSHOT_INTERVAL: 10,                    // Every N cycles
  MAX_CONSECUTIVE_ERRORS: 10,               // Auto-pause threshold

  // ─── Dashboard ────────────────────────────────
  RATE_LIMIT_PER_MINUTE: 120,
  SESSION_SALT: 'polymarket-bot-salt',
  CSRF_TOKEN_LENGTH: 32,

  // ─── Audit Logging ────────────────────────────
  AUDIT_ACTIONS: {
    BOT_START: 'bot_start',
    BOT_PAUSE: 'bot_pause',
    BOT_RESUME: 'bot_resume',
    BOT_EMERGENCY_STOP: 'bot_emergency_stop',
    TRADER_ADD: 'trader_add',
    TRADER_REMOVE: 'trader_remove',
    TRADER_UPDATE: 'trader_update',
    SETTINGS_CHANGE: 'settings_change',
    TRADE_EXECUTED: 'trade_executed',
    TRADE_FAILED: 'trade_failed',
    EQUITY_STOP_LOSS: 'equity_stop_loss',
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILED: 'login_failed',
  },

  // ─── ERC20 ABI (minimal for balance + allowance) ─
  ERC20_ABI: [
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
  ],
};
