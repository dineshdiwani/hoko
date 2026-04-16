module.exports = {
  apps: [
    {
      name: "hoko-api",
      cwd: ".",
      script: "npm",
      args: "start",
      interpreter: "none",
      env: {
        NODE_ENV: "production"
      },
      env_production: {
        NODE_ENV: "production"
      },
      max_memory_restart: "1G",
      max_restarts: 10,
      min_uptime: "10s",
      autorestart: true,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 15000
    }
  ]
};
