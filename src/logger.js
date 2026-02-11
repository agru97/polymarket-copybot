const { config } = require('./config');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[config.bot.logLevel] || 1;

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function fmt(level, msg) {
  const colors = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
  const reset = '\x1b[0m';
  const icons = { debug: '·', info: '→', warn: '⚠', error: '✗' };
  return `${colors[level]}${ts()} ${icons[level]} [${level.toUpperCase()}]${reset} ${msg}`;
}

module.exports = {
  debug: (msg) => { if (currentLevel <= 0) console.log(fmt('debug', msg)); },
  info: (msg) => { if (currentLevel <= 1) console.log(fmt('info', msg)); },
  warn: (msg) => { if (currentLevel <= 2) console.warn(fmt('warn', msg)); },
  error: (msg) => { if (currentLevel <= 3) console.error(fmt('error', msg)); },
};
