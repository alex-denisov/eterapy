import fs from "node:fs";
import path from "node:path";
import { SPECIALTY_LABELS, SPECIALTY_ORDER, SPECIALTY_OPTIONS } from "@/lib/types";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("V8 — practitioner category taxonomy is a single canonical source", () => {
  it("lib/types exposes the full 6-category enum with stable labels", () => {
    expect(SPECIALTY_ORDER).toEqual(["TAROT", "ASTROLOGY", "NUMEROLOGY", "PSYCHIC", "RUNES", "DREAMS"]);
    expect(SPECIALTY_LABELS.PSYCHIC).toBe("Экстрасенсорика");
    expect(SPECIALTY_LABELS.DREAMS).toBe("Сновидения");
    expect(SPECIALTY_OPTIONS).toHaveLength(6);
    expect(SPECIALTY_OPTIONS[0]).toEqual({ value: "TAROT", label: "Таро" });
  });

  it("the admin user-display re-exports the canonical taxonomy (no local copy)", () => {
    const display = read("src/app/admin/users/user-display.ts");
    expect(display).toContain('from "@/lib/types"');
    expect(display).toContain("export { SPECIALTY_LABELS, SPECIALTY_ORDER }");
    // the old hardcoded "Сны" label is gone
    expect(display).not.toContain('DREAMS: "Сны"');
  });

  it("the W3 three-level taxonomy picker drives directions on «Услуги» + superadmin", () => {
    // R9-5 (-profile-v2): десктоп-профиль больше НЕ встраивает пикер таксономии —
    // направления правятся на «Услугах»; профиль лишь зеркалит specialties при save.
    const editor = read("src/app/cabinet/practitioner/profile/profile-editor.tsx");
    expect(editor).not.toContain("PractitionerTaxonomyFields");
    expect(editor).toContain("specialtiesForDirections");
    const services = read("src/app/cabinet/practitioner/services/services-directions-editor.tsx");
    expect(services).toContain("directionsForCategories");
    expect(services).toContain("specialtiesForDirections");
    const modal = read("src/app/admin/users/user-edit-modal.tsx");
    expect(modal).toContain("PractitionerTaxonomyFields");
  });

  it("the public cards resolve chip labels through the shared canonical helper", () => {
    // B457: the grid no longer keeps a local label copy — chips come from the
    // shared lib/practitioner-chips helper, which sources canonical labels.
    const grid = read("src/app/practitioners/practitioners-grid.tsx");
    expect(grid).toContain("practitionerHelpChips");
    expect(grid).toContain('from "@/lib/practitioner-chips"');
    expect(grid).not.toContain('PSYCHIC: "Интуитивные практики"');

    const chips = read("src/lib/practitioner-chips.ts");
    expect(chips).toContain('from "./types"');
    expect(chips).toContain("SPECIALTY_LABELS");
  });
});
