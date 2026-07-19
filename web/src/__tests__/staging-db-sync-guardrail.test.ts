import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(process.cwd(), "..");
const source = (rel: string) => fs.readFileSync(path.join(repo, rel), "utf8");

describe("Staging database sync guardrails", () => {
  it("keeps staging data synchronized from production on a recurring schedule", () => {
    const script = source("deploy/sync-staging-db-from-prod.sh");
    const workflow = source(".github/workflows/sync-staging-db.yml");

    expect(script).toContain("pg_dump --format=custom");
    expect(script).toContain("pg_restore --exit-on-error --no-owner --no-acl");
    expect(script).toContain("refusing to sync because production and staging DB names are identical");
    expect(script).toContain("does not look like staging");
    expect(script).toContain("TARGET_DB_NAME=\"${STAGING_DB_BASE}_next\"");
    expect(script).toContain("write_database_url_atomically");
    expect(script).toContain('SYNC_LOCK_FILE="${SYNC_LOCK_FILE:-/tmp/eterapy-staging-db-sync.lock}"');
    expect(script).toContain("flock -n 9");
    expect(script).toContain('SYNC_FAILPOINT="${SYNC_FAILPOINT:-}"');
    expect(script).not.toContain("DROP SCHEMA");
    expect(workflow).toContain("cron: '0 * * * *'");
    expect(workflow).toContain("sync-staging-db-from-prod.sh --migrate --restart");
  });

  // B473: staging switched to the container model. The A/B flip must recreate
  // the compose containers (env_file is only read at creation) and must never
  // fall back to the retired PM2 flow.
  it("flips the A/B database by recreating the staging containers", () => {
    const script = source("deploy/sync-staging-db-from-prod.sh");

    expect(script).toContain('PROD_ENV_FILE="${PROD_ENV_FILE:-/opt/eterapy/.env}"');
    expect(script).toContain('STAGING_ENV_FILE="${STAGING_ENV_FILE:-$STAGING_DIR/.env}"');
    expect(script).toContain("reload_staging_containers");
    expect(script).toContain("--force-recreate --no-deps web worker");
    expect(script).toContain('verify_container_database_target "$TARGET_DB_NAME"');
    // Migrations run inside the release image against the INACTIVE database.
    expect(script).toMatch(/docker compose -f "\$STAGING_COMPOSE_FILE" run --rm --no-deps[\s\S]*?-e DATABASE_URL="\$TARGET_DATABASE_URL" migrate/);
    expect(script).not.toContain("pm2");
  });

  // B473: the staging deploy is the same immutable-image flow as production —
  // staging domains baked into the image, loopback bind, no prod secrets.
  it("deploys staging as an immutable container image", () => {
    const deployStaging = source(".github/workflows/deploy-staging.yml");
    const compose = source("deploy/compose/docker-compose.staging.yml");

    expect(deployStaging).toContain('NEXT_PUBLIC_MAIN_DOMAIN="staging.eterapy.com"');
    expect(deployStaging).toContain("eterapy-web-staging:${GITHUB_SHA::8}");
    expect(deployStaging).toContain("docker-compose.staging.yml");
    expect(deployStaging).not.toContain("pm2");
    // The Telegram alert must report an 8-char short SHA, never a 7-char one.
    expect(deployStaging).toContain("${GH_SHA:0:8}");
    expect(deployStaging).not.toContain("${GH_SHA:0:7}");

    // Own project name — containers must never collide with the prod stack
    // on the same VM; web binds loopback only, on a port ≠ prod's 3200.
    expect(compose).toContain("name: eterapy-staging");
    expect(compose).toContain('"${ETERAPY_APP_PORT:-3201}", "--hostname", "127.0.0.1"');
    expect(compose).toMatch(/migrate:[\s\S]*?condition: service_completed_successfully/);
  });
});
