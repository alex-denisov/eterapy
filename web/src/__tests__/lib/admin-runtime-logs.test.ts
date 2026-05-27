import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readRuntimeLogSnapshot, resolveRuntimeLogSources } from "@/lib/admin-runtime-logs";

describe("admin-runtime-logs", () => {
  const originalEnv = process.env.ETERAPY_RUNTIME_LOG_FILES;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "eterapy-runtime-logs-"));
  });

  afterEach(async () => {
    process.env.ETERAPY_RUNTIME_LOG_FILES = originalEnv;
    await rm(tmpDir, { recursive: true, force: true });
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
});
