import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(process.cwd(), "..");
const source = (rel: string) => fs.readFileSync(path.join(repo, rel), "utf8");

describe("Staging database sync guardrails", () => {
  it("keeps staging data synchronized from production on a recurring schedule", () => {
    const script = source("deploy/sync-staging-db-from-prod.sh");
    const workflow = source(".github/workflows/sync-staging-db.yml");
    const deployStaging = source(".github/workflows/deploy-staging.yml");
    const ecosystem = source("deploy/ecosystem.staging.config.js");

    expect(script).toContain("pg_dump --format=custom");
    expect(script).toContain("pg_restore --exit-on-error --no-owner --no-acl");
    expect(script).toContain("refusing to sync because production and staging DB names are identical");
    expect(script).toContain("does not look like staging");
    expect(script).toContain("TARGET_DB_NAME=\"${STAGING_DB_BASE}_next\"");
    expect(script).toContain("write_database_url_atomically");
    expect(script).toContain("reload_staging_with_env_file");
    expect(script).toContain("pm2 startOrReload \"$STAGING_ECOSYSTEM\" --update-env");
    expect(script).toContain("verify_pm2_database_target");
    expect(script).toContain('verify_pm2_database_target "$TARGET_DB_NAME"');
    expect(ecosystem).toContain('parseEnv(readFileSync("/home/admin/eterapy-staging/web/.env.local"');
    expect(ecosystem).toContain("instances: 2");
    expect(ecosystem).toContain('exec_mode: "cluster"');
    expect(ecosystem).toContain('script: "/home/admin/eterapy-staging/node_modules/next/dist/bin/next"');
    expect(ecosystem).toContain('args: ["start", "--port", "3100", "--hostname", "127.0.0.1"]');
    expect(script).toContain('SYNC_LOCK_FILE="${SYNC_LOCK_FILE:-/tmp/eterapy-staging-db-sync.lock}"');
    expect(script).toContain("flock -n 9");
    expect(script).toContain('SYNC_FAILPOINT="${SYNC_FAILPOINT:-}"');
    expect(script).not.toContain("pm2 stop");
    expect(script).not.toContain("DROP SCHEMA");
    expect(workflow).toContain("cron: '0 * * * *'");
    expect(deployStaging).not.toContain("*/15 * * * * flock -n /tmp/eterapy-staging-db-sync.lock");
    expect(workflow).toContain("sync-staging-db-from-prod.sh --migrate --restart");
    expect(deployStaging).toContain("remove retired VPS DB-sync cron");
    expect(deployStaging).toContain('SHORT_SHA="${GH_SHA:0:8}"');
    expect(deployStaging).not.toContain('SHORT_SHA="${GH_SHA:0:7}"');
  });
});
