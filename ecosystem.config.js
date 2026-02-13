module.exports = {
  apps: [{
    name: 'polymarket-bot',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '5s',
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    merge_logs: true,
    // Restart at 4 AM daily to clear memory
    cron_restart: '0 4 * * *',
    // Exponential backoff restart delay
    exp_backoff_restart_delay: 1000,
    // Kill timeout for graceful shutdown
    kill_timeout: 5000,
  }],
};
