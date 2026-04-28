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
    expect(shell).toContain("w-60");
    expect(shell).toContain("text-brand-lavender-light");
    expect(shell).toContain("duration-[var(--motion-base)]");
  });
});
