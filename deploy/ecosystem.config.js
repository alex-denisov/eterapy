// PM2 process descriptor for eterapy production.
// Matches the actual prod topology (single instance, fork mode,
// /home/admin/eterapy/web). See ../DEPLOY.md.
//
// Apply on the VPS with:
//   pm2 startOrReload deploy/ecosystem.config.js --update-env
//
// Do NOT switch to cluster mode without first verifying that LiveKit
// signalling, in-memory rate limits, and the notification poller tolerate
// multiple workers.

module.exports = {
  apps: [
    {
      name: "eterapy",
      script: "npm",
      args: "start -- --port 3000 --hostname localhost",
      cwd: "/home/admin/eterapy/web",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "localhost",
      },
      max_memory_restart: "1G",
      error_file: "/home/admin/.pm2/logs/eterapy-error.log",
      out_file: "/home/admin/.pm2/logs/eterapy-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "eterapy-worker",
      script: "npm",
      args: "run worker",
      cwd: "/home/admin/eterapy/web",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        WORKER_QUEUE: "default",
        WORKER_POLL_MS: 2000,
        WORKER_STALE_AFTER_MS: 600000,
      },
      max_memory_restart: "512M",
      error_file: "/home/admin/.pm2/logs/eterapy-worker-error.log",
      out_file: "/home/admin/.pm2/logs/eterapy-worker-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
