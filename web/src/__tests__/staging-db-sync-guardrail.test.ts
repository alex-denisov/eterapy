import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(process.cwd(), "..");
const source = (rel: string) => fs.readFileSync(path.join(repo, rel), "utf8");

describe("Staging database sync guardrails", () => {
  it("keeps staging data synchronized from production on a recurring schedule", () => {
    const script = source("deploy/sync-staging-db-from-prod.sh");
    const workflow = source(".github/workflows/sync-staging-db.yml");
    const deployStaging = source(".github/workflows/deploy-staging.yml");

    expect(script).toContain("pg_dump --format=custom");
    expect(script).toContain("pg_restore --no-owner --no-acl");
    expect(script).toContain("refusing to sync because production and staging DB names are identical");
    expect(script).toContain("does not look like staging");
    expect(workflow).toContain("cron: '0 */4 * * *'");
    expect(workflow).toContain("sync-staging-db-from-prod.sh --migrate --restart");
    expect(deployStaging).toContain("install staging DB sync cron");
    expect(deployStaging).toContain("sync-staging-db-from-prod.sh --migrate --restart");
  });
});
