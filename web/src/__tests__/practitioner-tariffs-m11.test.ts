import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("M11/D7 — practitioner tariff toggles work; price stays admin-only", () => {
  it("uses a real ToggleSwitch wired to PATCH /api/rates", () => {
    const editor = source("src/app/cabinet/practitioner/services/active-tariffs-editor.tsx");
    expect(editor).toContain("ToggleSwitch");
    expect(editor).toContain('fetch("/api/rates"');
    expect(editor).toContain('method: "PATCH"');
    expect(editor).toContain('data-testid="practitioner-active-tariffs"');
  });

  it("drops the price-edit «Изменить» button that mis-routed to schedule", () => {
    const page = source("src/app/cabinet/practitioner/services/page.tsx");
    expect(page).toContain("ActiveTariffsEditor");
    // the old static switch + price-edit link are gone from the page
    expect(page).not.toContain('<Link href={appUrl("/practitioner/schedule")} className="soft-chip">');
    expect(page).not.toContain("translate(18px, 1px)");
  });
});
