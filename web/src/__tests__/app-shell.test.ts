import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.join(process.cwd(), "src/components/cabinet/cabinet-shell.tsx"), "utf8");
const clientCabinet = fs.readFileSync(path.join(process.cwd(), "src/app/cabinet/page.tsx"), "utf8");

describe("v5 app shell", () => {
  it("exposes stable test ids for role-based browser walkthroughs", () => {
    expect(shell).toContain('data-testid="app-shell"');
    expect(shell).toContain('data-testid="app-shell-sidebar"');
    expect(shell).toContain('data-testid="app-shell-mobile-nav"');
    expect(shell).toContain('data-testid="app-shell-main"');
  });

  it("uses v5 tokenized shell styling", () => {
    expect(shell).toContain("soft-clarity-page soft-app-shell");
    expect(shell).toContain("soft-shell soft-app-layout");
    expect(shell).toContain("soft-app-sidebar-card");
    expect(shell).toContain("soft-app-mobile-nav");
    expect(shell).toContain("rounded-[var(--soft-radius-md)]");
    expect(shell).toContain("sticky top-16");
    expect(shell).toContain("duration-[var(--motion-base)]");
  });

  it("sends public product links from the app cabinet back to the public domain", () => {
    expect(clientCabinet).toContain('mainUrl("/checkin")');
    expect(clientCabinet).toContain('mainUrl("/products/deep-report")');
    expect(clientCabinet).toContain('mainUrl("/products/seven-days")');
    expect(clientCabinet).toContain('appUrl("/cabinet/action-history")');
    expect(clientCabinet).toContain('data-testid="client-map-preview"');
  });
});
