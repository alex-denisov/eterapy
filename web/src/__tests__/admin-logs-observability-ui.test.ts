import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("admin logs observability UI", () => {
  it("exposes audit, live diagnostics, and runtime log surfaces", () => {
    const page = source("src/app/admin/logs/admin-logs-page.tsx");
    const viewer = source("src/app/admin/logs/logs-viewer.tsx");

    // T7: audit/diagnostics/runtime now live in one tabbed surface rendered
    // in the new soft-admin table style; the legacy dark console was removed.
    expect(page).toContain("LogsTabs");
    expect(page).toContain('data-testid="admin-audit-log-table"');
    expect(viewer).toContain("admin-observability-tabs");
    expect(viewer).toContain("Все логи");
    expect(viewer).toContain("Kibana-like");
    expect(viewer).toContain("pm2/");
    expect(viewer).toContain("nginx/");
    expect(viewer).toContain("system/");
    expect(viewer).toContain("postgresql/");
    expect(viewer).toContain("redis/");
    expect(viewer).toContain("deploy/");
    expect(viewer).toContain("audit_logs");
    expect(viewer).toContain("Диагностика");
    expect(viewer).toContain("Runtime");
    // T8: diagnostics + runtime tables use the same filtered/paginated
    // AdminCompactDataTable surface as "Пользователи и сегменты".
    expect(viewer).toContain("AdminCompactDataTable");
    expect(viewer).not.toContain("function LogHeaderLabel");
    expect(viewer).not.toContain("CompactTableShell");
    expect(viewer).toContain("fetch(\"/api/diagnostics\"");
    expect(viewer).toContain("new EventSource(streamUrl)");
    expect(viewer).toContain("/api/admin/logs/runtime/stream");
    expect(viewer).toContain("diagnosticsColumns");
    expect(viewer).toContain("runtimeColumns");
    expect(viewer).toContain('limit: "1000"');
    expect(viewer).toContain('tailBytes: "2097152"');
    expect(viewer).toContain("Полнотекстовый поиск в реальном времени");
    expect(viewer).toContain("sourcesColumns");
    expect(viewer).toContain("Runtime");
    expect(viewer).not.toContain("Рантайм");
  });
});
