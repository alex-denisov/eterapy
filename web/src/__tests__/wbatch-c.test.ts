import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("W8 — practitioner earnings labels disambiguate wallet vs earnings", () => {
  const page = read("src/app/cabinet/practitioner/earnings/page.tsx");
  it("renames the internal wallet and clarifies that earnings are paid out, not in the wallet", () => {
    expect(page).toContain("Кошелёк кабинета");
    expect(page).toContain("Доступно к выплате");
    expect(page).toContain("Пополняется отдельно от заработка");
    expect(page).not.toContain("bg-green-500/15 text-green-400");
  });
});

describe("W18 — dialogue chips are derived per-turn when the LLM omits them", () => {
  it("the clarifier exposes a focused chip-derivation helper", () => {
    const lib = read("src/lib/dialogue-clarifier.ts");
    expect(lib).toContain("export async function generateAnswerChips");
    expect(lib).toContain("dialogue-clarifier-chip-derivation-failed");
  });
  it("the continue route derives chips before falling back to the static set", () => {
    const route = read("src/app/api/dialogues/[id]/route.ts");
    expect(route).toContain("generateAnswerChips");
    expect(route).toContain("chips = await generateAnswerChips(");
    // the static fallback is now last-resort, after derivation
    expect(route).toContain("if (chips.length === 0) chips = FALLBACK_CHIPS;");
  });
});
