import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.join(process.cwd(), "src/components/cabinet/cabinet-shell.tsx"), "utf8");

describe("v5 practitioner shell", () => {
  it("builds the practitioner navigation from the shared «Practice cockpit» model (B466)", () => {
    expect(shell).toContain("PRACTITIONER_NAV");
    // The sidebar and the mobile bar are both sourced from nav-model so the
    // desktop shell keeps the same polish/IA the owner approved for mobile.
    expect(shell).toContain("PRACTITIONER_TABS.map");
    expect(shell).toContain("PRACTITIONER_MORE_HREFS");
  });

  it("exposes role-specific hooks for practitioner walkthroughs", () => {
    expect(shell).toContain("data-shell-role={role}");
    expect(shell).toContain('data-testid="app-shell-user"');
    expect(shell).toContain('role === "PRACTITIONER" ? PRACTITIONER_NAV : CLIENT_NAV');
  });

  it("keeps the practitioner Помощь row in the sidebar (approved desktop mockup)", () => {
    expect(shell).toContain('(isClient || role === "PRACTITIONER") && (');
  });
});
