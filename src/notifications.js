/**
 * Notification System
 *
 * Sends alerts via Telegram Bot API and/or Discord webhooks.
 * All sends are fire-and-forget — failures are logged but never block bot operation.
 */

const log = require('./logger');

const NOTIFY_COOLDOWN_MS = 10000; // 10 seconds between identical notifications
const lastNotifyTime = new Map();

function shouldNotify(key) {
  const now = Date.now();
  const last = lastNotifyTime.get(key) || 0;
  if (now - last < NOTIFY_COOLDOWN_MS) return false;
  lastNotifyTime.set(key, now);
  return true;
}

let telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
let telegramChatId = process.env.TELEGRAM_CHAT_ID || '';
let discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';

function isConfigured() {
  return !!(telegramBotToken && telegramChatId) || !!discordWebhookUrl;
}

function updateConfig(cfg) {
  if (cfg.telegramBotToken !== undefined) telegramBotToken = cfg.telegramBotToken;
  if (cfg.telegramChatId !== undefined) telegramChatId = cfg.telegramChatId;
  if (cfg.discordWebhookUrl !== undefined) discordWebhookUrl = cfg.discordWebhookUrl;

  // Persist to hot-config for restart durability
  try {
    const hotConfig = require('./hot-config');
    if (cfg.telegramBotToken !== undefined) hotConfig.setSettingsOverride('telegramBotToken', telegramBotToken || '');
    if (cfg.telegramChatId !== undefined) hotConfig.setSettingsOverride('telegramChatId', telegramChatId || '');
    if (cfg.discordWebhookUrl !== undefined) hotConfig.setSettingsOverride('discordWebhookUrl', discordWebhookUrl || '');
  } catch { /* hot-config may not be loaded yet */ }
}

function getConfig() {
  return {
    telegramConfigured: !!(telegramBotToken && telegramChatId),
    discordConfigured: !!discordWebhookUrl,
  };
}

async function sendTelegram(text) {
  if (!telegramBotToken || !telegramChatId) return;
  try {
    const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      log.warn(`Telegram send failed (${resp.status}): ${body.slice(0, 200)}`);
    }
  } catch (err) {
    log.warn(`Telegram error: ${err.message}`);
  }
}

async function sendDiscord(content) {
  if (!discordWebhookUrl) return;
  try {
    const resp = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      log.warn(`Discord send failed (${resp.status}): ${body.slice(0, 200)}`);
    }
  } catch (err) {
    log.warn(`Discord error: ${err.message}`);
  }
}

/**
 * Send a notification to all configured channels.
 * @param {string} message - Plain text message (Discord) / HTML (Telegram)
 * @param {string} [plainText] - Optional plain-text fallback for Discord if message has HTML
 */
async function send(message, plainText) {
  if (!isConfigured()) return;
  const discordMsg = plainText || message.replace(/<[^>]+>/g, '');
  await Promise.allSettled([
    sendTelegram(message),
    sendDiscord(discordMsg),
  ]);
}

// Pre-formatted notification helpers

function notifyTradeExecuted(trade) {
  if (!shouldNotify('tradeExecuted')) return;
  const side = trade.side || '?';
  const size = (trade.sizeUsd || 0).toFixed(2);
  const market = (trade.marketName || trade.marketId || '').slice(0, 50);
  const price = trade.price ? trade.price.toFixed(2) : '?';
  const pnl = trade.pnl ? ` | PnL: $${trade.pnl.toFixed(2)}` : '';
  const mode = trade.dryRun ? ' [PAPER]' : '';
  send(
    `<b>Trade Executed${mode}</b>\n${side} $${size} on "${market}" @ ${price}${pnl}`,
    `Trade Executed${mode}: ${side} $${size} on "${market}" @ ${price}${pnl}`,
  );
}

function notifyTradeBlocked(reasons, count) {
  if (!shouldNotify('tradeBlocked')) return;
  if (!count) count = 1;
  const reasonText = Array.isArray(reasons) ? reasons.join('; ') : String(reasons);
  send(
    `<b>Trade Blocked</b> (${count})\n${reasonText.slice(0, 300)}`,
    `Trade Blocked (${count}): ${reasonText.slice(0, 300)}`,
  );
}

function notifyRiskLimitHit(limitType, details) {
  if (!shouldNotify('riskLimitHit')) return;
  send(
    `<b>Risk Limit: ${limitType}</b>\n${details}`,
    `Risk Limit: ${limitType} - ${details}`,
  );
}

function notifyBotStarted(mode, traderCount) {
  send(
    `<b>Bot Started</b>\nMode: ${mode} | Traders: ${traderCount}`,
    `Bot Started - Mode: ${mode} | Traders: ${traderCount}`,
  );
}

function notifyBotPaused(reason) {
  if (!shouldNotify('botPaused')) return;
  send(
    `<b>Bot Paused</b>\n${reason || 'Manual pause'}`,
    `Bot Paused: ${reason || 'Manual pause'}`,
  );
}

function notifyEquityStopLoss(equity, floor) {
  if (!shouldNotify('equityStopLoss')) return;
  send(
    `<b>EQUITY STOP-LOSS</b>\nEquity $${equity.toFixed(2)} hit floor $${floor.toFixed(2)} — bot auto-paused`,
    `EQUITY STOP-LOSS: Equity $${equity.toFixed(2)} hit floor $${floor.toFixed(2)} — bot auto-paused`,
  );
}

async function testNotification() {
  await send(
    '<b>Test Notification</b>\nYour notification setup is working!',
    'Test Notification: Your notification setup is working!',
  );
}

// Load persisted notification config from hot-config (survives restarts)
function loadPersistedConfig() {
  try {
    const hotConfig = require('./hot-config');
    const overrides = hotConfig.getSettingsOverrides();
    if (overrides.telegramBotToken) telegramBotToken = overrides.telegramBotToken;
    if (overrides.telegramChatId) telegramChatId = overrides.telegramChatId;
    if (overrides.discordWebhookUrl) discordWebhookUrl = overrides.discordWebhookUrl;
  } catch { /* hot-config may not be loaded yet */ }
}

loadPersistedConfig();

module.exports = {
  isConfigured,
  updateConfig,
  getConfig,
  send,
  notifyTradeExecuted,
  notifyTradeBlocked,
  notifyRiskLimitHit,
  notifyBotStarted,
  notifyBotPaused,
  notifyEquityStopLoss,
  testNotification,
};
