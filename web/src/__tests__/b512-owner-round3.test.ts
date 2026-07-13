import fs from "node:fs";
import path from "node:path";
import { computeHoraryFacts, horaryFactsForAI } from "@/lib/horary";
import { buildNatalEphemerisWheel, canResolveAstrologicalLocation, resolveAstrologicalCoordinates } from "@/lib/natal-ephemeris";
import { resolveRussianLocality, searchRussianLocalities } from "@/lib/russian-localities";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B512 owner acceptance round 3", () => {
  it("finds and disambiguates Ivanteevka and Pushkino by region", () => {
    const ivanteevka = searchRussianLocalities("Ивантеевка");
    expect(ivanteevka.map((item) => item.region)).toEqual(expect.arrayContaining(["Московская область", "Саратовская область"]));
    expect(searchRussianLocalities("Пушкино").map((item) => item.region)).toEqual(expect.arrayContaining(["Московская область", "Саратовская область"]));

    expect(resolveRussianLocality("Ивантеевка")).toBeNull();
    expect(resolveRussianLocality("Ивантеевка, Московская область")).toMatchObject({
      latitude: 55.97111,
      longitude: 37.92083,
    });
    expect(canResolveAstrologicalLocation("Место: Ивантеевка, Московская область")).toBe(true);
    expect(canResolveAstrologicalLocation("Место: Пушкино")).toBe(false);
  });

  it("uses coordinates persisted with an autocomplete selection", () => {
    expect(resolveAstrologicalCoordinates("Место: Ивантеевка, Московская область\nКоординаты: 55.97111, 37.92083")).toEqual({
      latitude: 55.97111,
      longitude: 37.92083,
    });
  });

  it("keeps horary runtime facts fully Russian", () => {
    const input = "Вопрос: Состоится ли покупка квартиры?\nМесто: Ивантеевка, Московская область\nКоординаты: 55.97111, 37.92083\nКатегория: покупка\nМомент фиксации UTC: 2026-07-12T15:42:00.000Z";
    const future = input.replace("15:42:00.000Z", "15:52:00.000Z");
    const facts = computeHoraryFacts(buildNatalEphemerisWheel(input), input, buildNatalEphemerisWheel(future));
    const runtime = horaryFactsForAI(facts);
    expect(runtime).not.toMatch(/\b(?:applying|separating|unknown|early|late|ordinary)\b/iu);
    expect(runtime).toMatch(/сходящ|расходящ|фаза не определена/u);
  });

  it("restores every recap field for Horary and birth arcana after refresh", () => {
    const actions = source("src/components/products/new-symbolic-product-actions.tsx");
    expect(actions).toContain('useSymbolicService("horary", (userInput) =>');
    expect(actions).toContain('{ label: "Контекст", value: context }');
    expect(actions).toContain('useSymbolicService("tarot-numerology", (userInput) =>');
    expect(actions).toContain('{ label: "Вопрос", value: question }');
  });

  it("ships a region-aware combobox and the interactive six-layer surname rose", () => {
    const actions = source("src/components/products/new-symbolic-product-actions.tsx");
    const surname = source("src/components/products/surname-story-actions.tsx");
    expect(actions).toContain("<LocationSuggestInput");
    expect(surname).toContain("Фамильная роза");
    expect(surname).toContain('role="tablist"');
    expect(surname).toContain('role="tabpanel"');
    expect(surname).toContain("Образ характера");
    expect(surname).toContain("Архивный след");
    expect(surname).not.toContain("слоговых ударов");
  });

  it("removes the Chisinau Human Design hint from public UI and preview fixtures", () => {
    for (const file of [
      "src/components/products/human-design-actions.tsx",
      "src/app/dev-preview/b503-human-design/page.tsx",
    ]) {
      const text = source(file);
      expect(text).not.toContain("03.03.1988");
      expect(text).not.toMatch(/Кишин[её]в/u);
    }
  });
});
