import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.join(process.cwd(), "src/app/admin/admin-shell.tsx"), "utf8");

describe("v5 admin shell", () => {
  it("exposes stable admin walkthrough hooks", () => {
    expect(shell).toContain('data-testid="admin-shell"');
    expect(shell).toContain('data-testid="admin-shell-sidebar"');
    expect(shell).toContain('data-testid="admin-shell-mobile-nav"');
    expect(shell).toContain('data-testid="admin-shell-main"');
  });

  it("keeps admin navigation dense, permission-aware, and tokenized", () => {
    expect(shell).toContain("permission?: Permission");
    expect(shell).toContain("permissions.includes(item.permission)");
    expect(shell).toContain("w-64");
    expect(shell).toContain("text-[var(--soft-bordeaux)]");
    expect(shell).toContain("duration-[var(--motion-base)]");
  });

  it("gives mobile superadmin users access to nested section pages, not only top-level tabs", () => {
    expect(shell).toContain("mobileSectionNav");
    expect(shell).toContain("mobilePageNav");
    expect(shell).toContain('data-testid="admin-shell-mobile-section-select"');
    expect(shell).toContain('data-testid="admin-shell-mobile-page-select"');
    expect(shell).toContain("Текущий раздел");
    expect(shell).toContain("Страница раздела");
  });

  it("renders desktop navigation as a fixed accordion with pinned account actions", () => {
    expect(shell).toContain("useState");
    expect(shell).toContain("openSections");
    expect(shell).toContain("admin-shell-nav-section-toggle");
    expect(shell).toContain("aria-expanded");
    expect(shell).toContain("ChevronDown");
    expect(shell).toContain("rotate-180");
    expect(shell).toContain("h-[calc(100vh-var(--header-height))]");
    expect(shell).toContain("md:fixed");
    expect(shell).toContain("md:top-[var(--header-height)]");
    expect(shell).toContain("md:pl-64");
    expect(shell).toContain("overflow-hidden");
    expect(shell).toContain('data-testid="admin-shell-nav-scroll"');
    expect(shell).toContain("overflow-y-auto");
    expect(shell).toContain('data-testid="admin-shell-sidebar-footer"');
    expect(shell).toContain("mt-auto");
  });
});
