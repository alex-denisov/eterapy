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
  it("keeps the worker command installable with production dependencies only", () => {
    // The release image installs with --omit=dev and runs `npm run worker`,
    // so tsx must stay a production dependency.
    const webPackage = readJson("web/package.json");
    const composeProd = source("deploy/compose/docker-compose.prod.yml");

    expect(webPackage.scripts.worker).toBe("tsx src/worker/index.ts");
    expect(webPackage.dependencies.tsx).toBeDefined();
    expect(webPackage.devDependencies.tsx).toBeUndefined();
    expect(composeProd).toContain('command: ["npm", "run", "worker"]');
    expect(composeProd).toContain('profiles: ["worker"]');
  });

  it("starts the dedicated marketing agent enabled in production", () => {
    const composeProd = source("deploy/compose/docker-compose.prod.yml");

    expect(composeProd).toContain('MARKETING_AGENT_ENABLED: "${MARKETING_AGENT_ENABLED:-true}"');
    expect(composeProd).toContain('MARKETING_AUTOPUBLISH: "true"');
    expect(composeProd).toContain('command: ["npm", "run", "worker:marketing"]');
  });

  it("fails deploys when the production worker container is not running", () => {
    const workflow = source(".github/workflows/deploy.yml");

    expect(workflow).toContain("▶ worker health");
    expect(workflow).toContain("docker inspect -f '{{.State.Status}}' eterapy-worker-1");
    expect(workflow).toContain('if [ "$WORKER_STATUS" != "running" ]; then');
  });

  it("shows the complete eight-character operational SHA in deploy notifications", () => {
    const workflow = source(".github/workflows/deploy.yml");

    expect(workflow).toContain("${GH_SHA:0:8}");
    expect(workflow).not.toContain("${GH_SHA:0:7}");
  });
});
