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

  it("the practitioner profile editor uses the W3 three-level taxonomy picker", () => {
    const editor = read("src/app/cabinet/practitioner/profile/profile-editor.tsx");
    // V8's flat specialty picker is superseded by the W3 shared picker
    expect(editor).toContain("PractitionerTaxonomyFields");
    expect(editor).toContain("specialtiesForDirections");
    expect(editor).toContain("Специализация и задачи");
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
