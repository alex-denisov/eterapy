import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readRuntimeLogSnapshot, resolveRuntimeLogSources } from "@/lib/admin-runtime-logs";

describe("admin-runtime-logs", () => {
  const originalEnv = process.env.ETERAPY_RUNTIME_LOG_FILES;
  const originalPm2Home = process.env.PM2_HOME;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "eterapy-runtime-logs-"));
  });

  afterEach(async () => {
    process.env.ETERAPY_RUNTIME_LOG_FILES = originalEnv;
    process.env.PM2_HOME = originalPm2Home;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("exposes a broad infrastructure log allowlist with real source names", async () => {
    delete process.env.ETERAPY_RUNTIME_LOG_FILES;
    process.env.PM2_HOME = path.join(tmpDir, ".pm2");

    const sources = await resolveRuntimeLogSources();
    const labels = sources.map((source) => source.label);

    expect(labels).toEqual(expect.arrayContaining([
      "pm2/eterapy-out.log",
      "pm2/eterapy-error.log",
      "pm2/eterapy-worker-out.log",
      "pm2/eterapy-staging-out.log",
      "pm2/eterapy-staging-worker-error.log",
      "nginx/access.log",
      "nginx/error.log",
      "system/syslog",
      "system/auth.log",
      "deploy/sync-staging-db.log",
    ]));
    expect(labels).not.toContain("ETerapy app stdout");
  });

  it("reads configured JSONL runtime logs and redacts sensitive values", async () => {
    const file = path.join(tmpDir, "app.log");
    await writeFile(file, [
      JSON.stringify({
        ts: "2026-05-27T10:00:00.000Z",
        level: "warn",
        event: "dialogue-clarifier-invalid-turn",
        requestId: "req-1",
        prompt: "Пользовательский вопрос",
        authorization: "Bearer secret-token",
        message: "contact user@example.com token=abc123",
      }),
      "plain error user@example.com authorization=secret",
    ].join("\n"));
    process.env.ETERAPY_RUNTIME_LOG_FILES = `app=${file}`;

    const snapshot = await readRuntimeLogSnapshot({ limit: 10 });

    expect(snapshot.sources).toEqual([expect.objectContaining({ key: "app", exists: true })]);
    expect(snapshot.entries).toHaveLength(2);
    expect(JSON.stringify(snapshot.entries)).not.toContain("Пользовательский вопрос");
    expect(JSON.stringify(snapshot.entries)).not.toContain("secret-token");
    expect(JSON.stringify(snapshot.entries)).not.toContain("user@example.com");
    expect(snapshot.entries[0]).toEqual(expect.objectContaining({
      level: "warn",
      event: "dialogue-clarifier-invalid-turn",
    }));
  });

  it("reports missing configured sources instead of throwing", async () => {
    process.env.ETERAPY_RUNTIME_LOG_FILES = `missing=${path.join(tmpDir, "missing.log")}`;

    const sources = await resolveRuntimeLogSources();
    const snapshot = await readRuntimeLogSnapshot();

    expect(sources).toEqual([expect.objectContaining({ key: "missing", exists: false })]);
    expect(snapshot.entries).toEqual([]);
  });

  it("parses timestamps and bracket levels from raw runtime lines", async () => {
    const file = path.join(tmpDir, "auth.log");
    await writeFile(file, "2026-05-23T13:15:49: [auth][error] UnknownAction\n");
    process.env.ETERAPY_RUNTIME_LOG_FILES = `auth=${file}`;

    const snapshot = await readRuntimeLogSnapshot({ limit: 10 });

    expect(snapshot.entries[0]).toEqual(expect.objectContaining({
      timestamp: "2026-05-23T13:15:49",
      level: "error",
      event: "UnknownAction",
      fields: { tags: ["auth", "error"] },
    }));
  });

  it("supports full-text search across a larger tail window without exposing arbitrary paths", async () => {
    const file = path.join(tmpDir, "large.log");
    const lines = Array.from({ length: 750 }, (_, index) => JSON.stringify({
      ts: `2026-06-01T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
      level: "info",
      event: index === 42 ? "needle-payment-reconcile" : "routine-event",
      requestId: `req-${index}`,
    }));
    await writeFile(file, lines.join("\n"));
    process.env.ETERAPY_RUNTIME_LOG_FILES = `Runtime=${file}`;

    const snapshot = await readRuntimeLogSnapshot({ limit: 1000, search: "needle-payment-reconcile", tailBytes: 2 * 1024 * 1024 });

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toEqual(expect.objectContaining({
      sourceLabel: "Runtime",
      event: "needle-payment-reconcile",
    }));
    expect(snapshot.sources[0]).toEqual(expect.objectContaining({ label: "Runtime", exists: true }));
  });
});
