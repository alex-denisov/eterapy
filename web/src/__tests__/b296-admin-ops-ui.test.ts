import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B296 admin operations UI", () => {
  it("keeps all user roles in one read-only admin table with modal editing", () => {
    const page = source("src/app/admin/users/admin-users-page.tsx");
    const panel = source("src/app/admin/users/users-control-panel.tsx");
    const modal = source("src/app/admin/users/user-edit-modal.tsx");
    const shell = source("src/app/admin/admin-shell.tsx");

    expect(page).toContain('data-testid="admin-users-unified-page"');
    // T3: users table migrated to the compact "Промты продуктов" style.
    expect(panel).toContain("CompactTableShell");
    // U1/U2: role management + impersonation moved into the edit modal.
    expect(modal).toContain("permissions.canManageRoles");
    expect(modal).toContain("/api/admin/impersonate?userId=");
    expect(shell).toContain('label: "Пользователи и сегменты"');
    expect(shell).not.toContain('label: "Клиенты"');
  });

  it("adds paginated operational tables for jobs, notifications, logs, and database", () => {
    expect(source("src/app/admin/jobs/admin-jobs-page.tsx")).toContain('data-testid="admin-jobs-table"');
    expect(source("src/app/admin/jobs/admin-jobs-page.tsx")).toContain("const PAGE_SIZE = 25");
    expect(source("src/app/admin/notifications/admin-notifications-page.tsx")).toContain('data-testid="admin-notification-jobs-table"');
    expect(source("src/app/admin/notifications/admin-notifications-page.tsx")).toContain("label=\"Отправить\"");
    expect(source("src/app/admin/logs/admin-logs-page.tsx")).toContain('data-testid="admin-audit-log-table"');
    expect(source("src/app/admin/logs/admin-logs-page.tsx")).toContain("const PAGE_SIZE = 50");
    expect(source("src/app/admin/database/admin-database-page.tsx")).toContain('data-testid="admin-database-browser"');
    expect(source("src/app/admin/database/admin-database-page.tsx")).toContain("read-only");
  });

  it("makes system health aware of AI-center credentials instead of env-only checks", () => {
    const system = source("src/lib/admin-system-status.ts");

    expect(system).toContain("AIProviderCredential");
    expect(system).toContain("db.aIProviderCredential.findMany");
    expect(system).toContain("jobsFailed");
    expect(system).toContain("aiErrors24h");
  });
});
