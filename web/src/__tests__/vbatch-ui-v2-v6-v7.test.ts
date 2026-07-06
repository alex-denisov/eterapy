import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("V2 — admin user modal stacks above the public-shell-header (z-50)", () => {
  it("modal overlays use z-[100], not z-50", () => {
    const modal = read("src/app/admin/users/user-edit-modal.tsx");
    const panel = read("src/app/admin/users/users-control-panel.tsx");
    expect(modal).toContain("fixed inset-0 z-[100]");
    expect(panel).toContain("fixed inset-0 z-[100]");
    expect(modal).not.toContain("fixed inset-0 z-50");
  });
});

describe("V6 — practitioner subscription is reachable from the cockpit nav", () => {
  // B466: the flat «Подписка» sidebar item merged into «Финансы» (Тариф tab);
  // the sidebar itself is sourced from the shared PRACTITIONER_TABS model.
  it("cabinet-shell routes practitioners to «Финансы» (subscription lives on its Тариф tab)", () => {
    const shell = read("src/components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain("PRACTITIONER_TABS.map");
    const navModel = read("src/lib/nav-model.ts");
    expect(navModel).toContain('appUrl("/practitioner/finance")');
    expect(navModel).toContain('label: "Финансы"');
  });
});

describe("V7 — unreadable terracotta buttons/avatars replaced with readable treatments", () => {
  it("defines the shared avatar-fallback + select-pill utilities", () => {
    const css = read("src/app/v4-soft.css");
    expect(css).toContain(".soft-avatar-fallback");
    expect(css).toContain(".soft-select-pill");
  });

  it("practitioner schedule/earnings/calendar use the readable pill, not text-primary on tint", () => {
    expect(read("src/app/cabinet/practitioner/schedule/schedule-tabs.tsx")).toContain("soft-select-pill");
    expect(read("src/components/schedule/week-calendar.tsx")).toContain("soft-select-pill");
    const earnings = read("src/app/cabinet/practitioner/earnings/page.tsx");
    expect(earnings).toContain("soft-select-pill");
    expect(earnings).not.toContain("bg-primary/15 text-primary");
  });

  it("avatar fallbacks use the elegant gradient across cabinets", () => {
    expect(read("src/app/cabinet/practitioner/profile/profile-editor.tsx")).toContain("soft-avatar-fallback");
    expect(read("src/app/cabinet/settings/settings-client.tsx")).toContain("soft-avatar-fallback");
  });
});
