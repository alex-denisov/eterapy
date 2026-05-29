import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B296 admin operations UI", () => {
  it("keeps all user roles in one editable admin table", () => {
    const page = source("src/app/admin/users/page.tsx");
    const panel = source("src/app/admin/users/users-control-panel.tsx");
    const shell = source("src/app/admin/admin-shell.tsx");

    expect(page).toContain('data-testid="admin-users-unified-page"');
    // T3: users table migrated to the compact "Промты продуктов" style.
    expect(panel).toContain("CompactTableShell");
    expect(panel).toContain("canManageRoles");
    expect(panel).toContain("/api/admin/impersonate?userId=");
    expect(shell).toContain('label: "Все пользователи"');
    expect(shell).not.toContain('label: "Клиенты"');
  });

  it("adds paginated operational tables for jobs, notifications, logs, and database", () => {
    expect(source("src/app/admin/jobs/page.tsx")).toContain('data-testid="admin-jobs-table"');
    expect(source("src/app/admin/jobs/page.tsx")).toContain("const PAGE_SIZE = 25");
    expect(source("src/app/admin/notifications/page.tsx")).toContain('data-testid="admin-notification-jobs-table"');
    expect(source("src/app/admin/notifications/page.tsx")).toContain("label=\"Отправить\"");
    expect(source("src/app/admin/logs/page.tsx")).toContain('data-testid="admin-audit-log-table"');
    expect(source("src/app/admin/logs/page.tsx")).toContain("const PAGE_SIZE = 50");
    expect(source("src/app/admin/database/page.tsx")).toContain('data-testid="admin-database-browser"');
    expect(source("src/app/admin/database/page.tsx")).toContain("read-only");
  });

  it("makes system health aware of AI-center credentials instead of env-only checks", () => {
    const system = source("src/lib/admin-system-status.ts");

    expect(system).toContain("AIProviderCredential");
    expect(system).toContain("db.aIProviderCredential.findMany");
    expect(system).toContain("jobsFailed");
    expect(system).toContain("aiErrors24h");
  });
});
