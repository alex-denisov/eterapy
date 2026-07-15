import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("B482 — superadmin client-support console", () => {
  it("protects the page and APIs with the shared support.manage gate", () => {
    const page = source("src/app/admin/support/page.tsx");
    const list = source("src/app/api/admin/support/conversations/route.ts");
    const thread = source("src/app/api/admin/support/conversations/[id]/route.ts");
    const access = source("src/lib/admin-support-access.ts");
    expect(page).toContain("getSupportOperatorAccess");
    expect(list).toContain("getSupportOperatorAccess");
    expect(thread).toContain("getSupportOperatorAccess");
    expect(access).toContain('permissions.includes("support.manage")');
    expect(access).toContain('["ADMIN", "SUPERADMIN"]');
  });

  it("ships queue, thread, reply and lifecycle controls", () => {
    const page = source("src/app/admin/support/page.tsx");
    const console = source("src/app/admin/support/support-console.tsx");
    expect(page).toContain("SupportConsole");
    expect(console).toContain('data-testid="admin-support-queue"');
    expect(console).toContain('data-testid="admin-support-thread"');
    expect(console).toContain('data-testid="admin-support-reply-input"');
    expect(console).toContain('changeStatus("CLOSED")');
    expect(console).toContain('changeStatus("OPEN")');
  });

  it("creates staff replies only through the authenticated admin API and audits them", () => {
    const thread = source("src/app/api/admin/support/conversations/[id]/route.ts");
    expect(thread).toContain('role: "STAFF"');
    expect(thread).toContain('"SUPPORT_REPLY"');
    expect(thread).toContain('"SUPPORT_STATUS_CHANGE"');
  });

  it("adds support.manage to the moderator CRUD matrix and gates the nav with it", () => {
    const shell = source("src/app/admin/admin-shell.tsx");
    const permissionModel = source("src/lib/moderator-permissions.ts");
    const matrix = source("src/app/admin/users/user-display.ts");
    expect(shell).toContain('adminUrl("/admin/support")');
    expect(shell).toContain('label: "Поддержка"');
    expect(shell).toContain('permission: "support.manage"');
    expect(shell).toContain('return "support"');
    expect(permissionModel).toContain('"support.manage"');
    expect(matrix).toContain('group: "Поддержка"');
    expect(matrix).toContain('key: "support.manage", label: "Консоль клиентских обращений"');
  });
});
