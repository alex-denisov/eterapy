// PM2 process descriptor for eterapy STAGING.
// Runs alongside production on the same VPS, isolated by port (3100 vs 3000),
// process name, working directory (/home/admin/eterapy-staging/web) and a
// separate PostgreSQL database (eterapy_staging). See ../DEPLOY.md.
//
// Apply on the VPS with:
//   pm2 startOrReload deploy/ecosystem.staging.config.js --update-env
//
// Lower memory ceilings than prod — staging is for QA, not load. Single
// instance / fork mode mirrors prod so behaviour matches.

module.exports = {
  apps: [
    {
      name: "eterapy-staging",
      script: "npm",
      args: "start -- --port 3100 --hostname 127.0.0.1",
      cwd: "/home/admin/eterapy-staging/web",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3100,
        HOSTNAME: "127.0.0.1",
      },
      max_memory_restart: "768M",
      error_file: "/home/admin/.pm2/logs/eterapy-staging-error.log",
      out_file: "/home/admin/.pm2/logs/eterapy-staging-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "eterapy-staging-worker",
      script: "npm",
      args: "run worker",
      cwd: "/home/admin/eterapy-staging/web",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        WORKER_QUEUE: "default",
        WORKER_POLL_MS: 2000,
        WORKER_STALE_AFTER_MS: 600000,
      },
      max_memory_restart: "384M",
      error_file: "/home/admin/.pm2/logs/eterapy-staging-worker-error.log",
      out_file: "/home/admin/.pm2/logs/eterapy-staging-worker-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
