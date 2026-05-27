import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("admin logs observability UI", () => {
  it("exposes audit, live diagnostics, and runtime log surfaces", () => {
    const page = source("src/app/admin/logs/page.tsx");
    const viewer = source("src/app/admin/logs/logs-viewer.tsx");

    expect(page).toContain("AdminLogsConsole");
    expect(viewer).toContain("admin-observability-tabs");
    expect(viewer).toContain("Diagnostics live");
    expect(viewer).toContain("Runtime logs");
    expect(viewer).toContain("fetch(\"/api/diagnostics\"");
    expect(viewer).toContain("new EventSource(streamUrl)");
    expect(viewer).toContain("/api/admin/logs/runtime/stream");
    expect(viewer).toContain("polling fallback");
  });
});
