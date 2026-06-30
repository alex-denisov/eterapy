import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("V3 — practitioner session pricing as toggleable presets in the admin modal", () => {
  const modal = read("src/app/admin/users/user-edit-modal.tsx");

  it("renders one preset row per standard duration with an enable checkbox + price", () => {
    expect(modal).toContain('data-testid="user-modal-rate-presets"');
    expect(modal).toContain("SESSION_DURATIONS.map");
    expect(modal).toContain("toggleRate");
    expect(modal).toContain("setRatePrice");
    // the old single price/duration inputs are gone
    expect(modal).not.toContain("Стоимость сессии, ₽");
    expect(modal).not.toContain("Длительность, мин");
  });

  it("saves the presets through the rates API (superadmin only)", () => {
    expect(modal).toContain("/rates");
    expect(modal).toContain("rates: payload");
    expect(modal).toContain("permissions.canManageRoles");
  });

  it("keeps the W3 three-level taxonomy picker in the modal", () => {
    expect(modal).toContain("PractitionerTaxonomyFields");
  });

  it("the page loads priceRates for the modal", () => {
    const page = read("src/app/admin/users/admin-users-page.tsx");
    expect(page).toContain("priceRates:");
    const display = read("src/app/admin/users/user-display.ts");
    expect(display).toContain("priceRates: Array<{ durationMin: number; priceRub: number; enabled: boolean }>");
  });
});
