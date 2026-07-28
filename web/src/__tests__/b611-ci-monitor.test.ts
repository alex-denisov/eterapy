import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Monitor = {
  HELP: string;
  collectActionRefs: (files: string[]) => Array<{
    action: string;
    ref: string;
    pinned: boolean;
    line: number;
  }>;
  parseTestSummary: (log: string) => string[];
  renderRuns: (raw: string) => string;
  validateRunId: (value: string) => string;
};

const monitor = jest.requireActual("../../../scripts/ci_monitor.cjs") as Monitor;

describe("B611 CI monitor", () => {
  test("documents every workflow operation required by the agent skill", () => {
    for (const command of [
      "runs",
      "watch",
      "fail-fast",
      "log-failed",
      "test-summary",
      "check-actions",
      "grep",
      "wait-for",
    ]) {
      expect(monitor.HELP).toContain(command);
    }
  });

  test("accepts numeric run ids and rejects command injection", () => {
    expect(monitor.validateRunId("30324898666")).toBe("30324898666");
    expect(() => monitor.validateRunId("30324898666; touch /tmp/no")).toThrow("Invalid run id");
  });

  test("extracts Jest evidence without copying the full workflow log", () => {
    const summary = monitor.parseTestSummary(`
Test Suites: 455 passed, 455 total
Tests:       3231 passed, 3231 total
Snapshots:   0 total
Time:        93.659 s
`);
    expect(summary).toEqual([
      "Test Suites: 455 passed, 455 total",
      "Tests:       3231 passed, 3231 total",
      "Snapshots:   0 total",
      "Time:        93.659 s",
    ]);
  });

  test("finds version tags and immutable SHA pins in workflow files", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eterapy-ci-monitor-"));
    const workflow = path.join(directory, "deploy.yml");
    fs.writeFileSync(workflow, `
steps:
  - uses: actions/checkout@v4
  - uses: vendor/action@0123456789abcdef0123456789abcdef01234567
`);
    const refs = monitor.collectActionRefs([workflow]);
    expect(refs).toEqual([
      expect.objectContaining({ action: "actions/checkout", ref: "v4", pinned: false }),
      expect.objectContaining({
        action: "vendor/action",
        ref: "0123456789abcdef0123456789abcdef01234567",
        pinned: true,
      }),
    ]);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test("renders bounded, reviewable run rows", () => {
    const output = monitor.renderRuns(JSON.stringify([{
      databaseId: 42,
      status: "completed",
      conclusion: "success",
      workflowName: "Deploy",
      headSha: "abcdef0123456789",
      createdAt: "2026-07-28T00:00:00Z",
      url: "https://github.example/run/42",
    }]));
    expect(output).toBe(
      "42\tcompleted\tsuccess\tDeploy\tabcdef01\t2026-07-28T00:00:00Z\thttps://github.example/run/42\n",
    );
  });
});
