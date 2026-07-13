import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.join(process.cwd(), "src/components/cabinet/cabinet-shell.tsx"), "utf8");

describe("v5 practitioner shell", () => {
  it("keeps the mobile bar on the shared 5-tab «Practice cockpit» model (B466)", () => {
    // The mobile bottom bar and its «Ещё» umbrella still come from nav-model so
    // the mobile IA the owner approved cannot drift.
    expect(shell).toContain("PRACTITIONER_TABS.map");
    expect(shell).toContain("PRACTITIONER_MORE_HREFS");
  });

  it("expands the DESKTOP sidebar into the approved cockpit groups (B466 R9-5)", () => {
    // Desktop is NOT the 5-tab mobile model — sections fan out into three
    // groups (main · Практика · Аккаунт), no «Ещё» hiding.
    expect(shell).toContain("PRACTITIONER_DESKTOP_GROUPS");
    expect(shell).toContain("PRACTITIONER_DESKTOP_GROUPS.map");
    expect(shell).toContain('heading: "Практика"');
    expect(shell).toContain('heading: "Аккаунт"');
    // Sections that used to hide under «Ещё» are first-class desktop rows.
    expect(shell).toContain('label: "Отзывы"');
    expect(shell).toContain('label: "Настройки"');
    expect(shell).toContain('label: "Этика и безопасность"');
  });

  it("exposes role-specific hooks for practitioner walkthroughs", () => {
    expect(shell).toContain("data-shell-role={role}");
    expect(shell).toContain('data-testid="app-shell-user"');
    expect(shell).toContain("isPractitionerBar");
  });

  it("keeps the practitioner Помощь row in the sidebar (approved desktop mockup)", () => {
    expect(shell).toContain('(isClient || role === "PRACTITIONER") && (');
  });
});
