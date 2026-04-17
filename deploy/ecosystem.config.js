module.exports = {
  apps: [{
    name: "eterapy",
    script: "npm",
    args: "start -- --port 3000 --hostname 127.0.0.1",
    cwd: "/var/www/eterapy/web",
    instances: 2,
    exec_mode: "cluster",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      HOSTNAME: "127.0.0.1",
    },
    max_memory_restart: "1G",
    error_file: "/var/log/pm2/eterapy-error.log",
    out_file: "/var/log/pm2/eterapy-out.log",
    log_file: "/var/log/pm2/eterapy-combined.log",
    merge_logs: true,
    rotate_interval: "1d",
  }],
};
