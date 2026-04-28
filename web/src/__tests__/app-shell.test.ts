import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.join(process.cwd(), "src/components/cabinet/cabinet-shell.tsx"), "utf8");

describe("v5 app shell", () => {
  it("exposes stable test ids for role-based browser walkthroughs", () => {
    expect(shell).toContain('data-testid="app-shell"');
    expect(shell).toContain('data-testid="app-shell-sidebar"');
    expect(shell).toContain('data-testid="app-shell-mobile-nav"');
    expect(shell).toContain('data-testid="app-shell-main"');
  });

  it("uses v5 tokenized shell styling", () => {
    expect(shell).toContain("rounded-[var(--radius-control)]");
    expect(shell).toContain("duration-[var(--motion-base)]");
    expect(shell).toContain("text-brand-soft-gold");
    expect(shell).toContain("shadow-[var(--shadow-surface)]");
  });
});
