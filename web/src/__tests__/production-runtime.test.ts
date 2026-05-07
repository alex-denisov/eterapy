import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..");

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function source(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("production runtime", () => {
  it("keeps the PM2 worker command installable with production dependencies only", () => {
    const webPackage = readJson("web/package.json");
    const ecosystem = source("deploy/ecosystem.config.js");

    expect(webPackage.scripts.worker).toBe("tsx src/worker/index.ts");
    expect(webPackage.dependencies.tsx).toBeDefined();
    expect(webPackage.devDependencies.tsx).toBeUndefined();
    expect(ecosystem).toContain('name: "eterapy-worker"');
    expect(ecosystem).toContain('args: "run worker"');
  });

  it("fails deploys when the production worker is not online", () => {
    const workflow = source(".github/workflows/deploy.yml");

    expect(workflow).toContain("▶ worker health");
    expect(workflow).toContain("eterapy-worker PM2");
    expect(workflow).toContain('if [ "$WORKER_STATUS" != "online" ]; then');
  });
});
