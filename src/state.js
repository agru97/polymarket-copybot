/**
 * Bot State Manager
 * Controls the bot's operational state: running, paused, stopped.
 * Provides event-driven state changes and persistent state across restarts.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const STATE_FILE = path.join(__dirname, '..', 'data', 'bot-state.json');

const STATES = {
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  EMERGENCY_STOP: 'emergency_stop',
  STARTING: 'starting',
  ERROR: 'error',
};

class BotState extends EventEmitter {
  constructor() {
    super();
    this._state = STATES.STARTING;
    this._pauseReason = '';
    this._startedAt = null;
    this._lastCycleAt = null;
    this._cycleCount = 0;
    this._errors = [];
    this._maxErrors = 50;
    this._consecutiveErrors = 0;
    this._maxConsecutiveErrors = 10;
    this._load();
  }

  get state() { return this._state; }
  get isRunning() { return this._state === STATES.RUNNING; }
  get isPaused() { return this._state === STATES.PAUSED || this._state === STATES.EMERGENCY_STOP; }
  get isStopped() { return this._state === STATES.STOPPED; }
  get canTrade() { return this._state === STATES.RUNNING; }

  start() {
    this._state = STATES.RUNNING;
    this._startedAt = Date.now();
    this._consecutiveErrors = 0;
    this._save();
    this.emit('stateChange', STATES.RUNNING);
  }

  pause(reason = 'Manual pause') {
    this._state = STATES.PAUSED;
    this._pauseReason = reason;
    this._save();
    this.emit('stateChange', STATES.PAUSED, reason);
  }

  resume() {
    this._state = STATES.RUNNING;
    this._pauseReason = '';
    this._consecutiveErrors = 0;
    this._save();
    this.emit('stateChange', STATES.RUNNING);
  }

  emergencyStop(reason = 'Emergency stop triggered') {
    this._state = STATES.EMERGENCY_STOP;
    this._pauseReason = reason;
    this._save();
    this.emit('stateChange', STATES.EMERGENCY_STOP, reason);
    this.emit('emergencyStop', reason);
  }

  stop() {
    this._state = STATES.STOPPED;
    this._save();
    this.emit('stateChange', STATES.STOPPED);
  }

  recordCycle() {
    this._lastCycleAt = Date.now();
    this._cycleCount++;
    this._consecutiveErrors = 0;
  }

  recordError(error) {
    this._consecutiveErrors++;
    this._errors.push({
      timestamp: new Date().toISOString(),
      message: error.message || String(error),
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });
    if (this._errors.length > this._maxErrors) {
      this._errors = this._errors.slice(-this._maxErrors);
    }
    // Auto-pause after too many consecutive errors
    if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
      this.pause(`Auto-paused: ${this._maxConsecutiveErrors} consecutive errors`);
    }
    this._save();
  }

  getStatus() {
    return {
      state: this._state,
      pauseReason: this._pauseReason,
      startedAt: this._startedAt,
      lastCycleAt: this._lastCycleAt,
      cycleCount: this._cycleCount,
      consecutiveErrors: this._consecutiveErrors,
      uptime: this._startedAt ? Date.now() - this._startedAt : 0,
      recentErrors: this._errors.slice(-5),
    };
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        state: this._state,
        pauseReason: this._pauseReason,
        startedAt: this._startedAt,
        cycleCount: this._cycleCount,
      }, null, 2));
    } catch { /* non-critical */ }
  }

  _load() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        // Don't restore running state — always start fresh
        if (data.state === STATES.EMERGENCY_STOP) {
          this._state = STATES.EMERGENCY_STOP;
          this._pauseReason = data.pauseReason || 'Restored emergency stop from previous session';
        }
      }
    } catch { /* start fresh */ }
  }
}

// Singleton
const botState = new BotState();

module.exports = { botState, STATES };
