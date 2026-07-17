// PM2 process descriptor for eterapy STAGING.
// Runs alongside production on the same VPS, isolated by port (3100 vs 3000),
// process name, working directory (/home/admin/eterapy-staging/web) and a
// separate PostgreSQL database (eterapy_staging). See ../DEPLOY.md.
//
// Apply on the VPS with:
//   pm2 startOrReload deploy/ecosystem.staging.config.js --update-env
//
// The runtime env is declared explicitly so PM2 cannot retain a stale
// DATABASE_URL after an A/B database switch. Node 22 provides parseEnv.
const { readFileSync } = require("node:fs");
const { parseEnv } = require("node:util");

const runtimeEnv = parseEnv(readFileSync("/home/admin/eterapy-staging/web/.env.local", "utf8"));

module.exports = {
  apps: [
    {
      name: "eterapy-staging",
      // Runtime dependencies are hoisted at the workspace root by npm ci.
      script: "/home/admin/eterapy-staging/node_modules/next/dist/bin/next",
      args: ["start", "--port", "3100", "--hostname", "127.0.0.1"],
      cwd: "/home/admin/eterapy-staging/web",
      // Two cluster workers let PM2 replace one HTTP process at a time.
      instances: 2,
      exec_mode: "cluster",
      env: {
        ...runtimeEnv,
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
        ...runtimeEnv,
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
