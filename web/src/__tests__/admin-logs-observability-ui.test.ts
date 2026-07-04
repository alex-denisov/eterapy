import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("admin logs observability UI", () => {
  it("exposes audit, live diagnostics, and runtime log surfaces", () => {
    const page = source("src/app/admin/logs/admin-logs-page.tsx");
    const viewer = source("src/app/admin/logs/logs-viewer.tsx");

    // T7: audit/diagnostics/runtime now live in one log-center surface rendered
    // in the new soft-admin table style; the legacy dark console was removed.
    expect(page).toContain("LogsCenter");
    expect(page).toContain('data-testid="admin-audit-log-table"');
    expect(viewer).toContain('data-testid="admin-log-center"');
    expect(viewer).toContain('data-testid="admin-log-center-source-rail"');
    expect(viewer).toContain('data-testid="admin-log-center-stream"');
    expect(viewer).toContain('data-testid="admin-log-center-detail"');
    expect(viewer).not.toContain("Kibana-like");
    expect(viewer).not.toContain("kibana-like");
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

  it("renders the logs page as a full log center with operational facets and source-family navigation", () => {
    const viewer = source("src/app/admin/logs/logs-viewer.tsx");

    expect(viewer).toContain("LOG_CENTER_FACETS");
    expect(viewer).toContain("LOG_SAVED_VIEWS");
    expect(viewer).toContain('data-testid="admin-log-command-bar"');
    expect(viewer).toContain('data-testid="admin-log-query-row"');
    expect(viewer).toContain('data-testid="admin-log-center-summary"');
    expect(viewer).toContain('data-testid="admin-log-source-family-filter"');
    expect(viewer).toContain('data-testid="admin-log-saved-views"');
    expect(viewer).toContain('data-testid="admin-log-timeline"');
    expect(viewer).toContain('data-testid="admin-log-source-level-heatmap"');
    expect(viewer).toContain('data-testid="admin-log-top-events"');
    expect(viewer).toContain('data-testid="admin-log-correlation"');
    expect(viewer).toContain('data-testid="admin-log-operations"');
    expect(viewer).toContain("buildLogTimeline");
    expect(viewer).toContain("logTimelineBuckets");
    expect(viewer).toContain("sourceLevelHeatmap");
    expect(viewer).toContain("topLogEvents");
    expect(viewer).toContain("correlatedLogEntries");
    expect(viewer).toContain("field:value");
    expect(viewer).toContain("requestId");
    expect(viewer).toContain("level:error OR level:warn");
    expect(viewer).toContain("CSV");
    expect(viewer).toContain("JSON");
    expect(viewer).toContain("Экспорт расследования");
    expect(viewer).toContain("Сохранить вид");
    expect(viewer).toContain("Последние 15 минут");
    expect(viewer).toContain("runtimeSourceMatchesFamily");
    expect(viewer).toContain("Продуктовые события");
    expect(viewer).toContain("Security");
    expect(viewer).toContain("Access");
    expect(viewer).toContain("Jobs");
    expect(viewer).toContain("Database");
    expect(viewer).toContain("System");
    expect(viewer).not.toContain("setTab");
    expect(viewer).not.toContain("LOG_TABS");
  });
});
