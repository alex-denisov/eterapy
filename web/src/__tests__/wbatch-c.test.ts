import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("W8 — practitioner earnings labels disambiguate wallet vs earnings", () => {
  const page = read("src/app/cabinet/practitioner/earnings/page.tsx");
  it("shows the payout balance; the client ₽ cabinet wallet is gone (Z1-Ф2)", () => {
    // Z1-Ф1/Ф2: the client ₽ balance rail is removed — the «Кошелёк кабинета»
    // card no longer exists. Practitioner earnings («Доступно к выплате») stays.
    expect(page).not.toContain("Кошелёк кабинета");
    expect(page).not.toContain("cabinetBalanceRub");
    expect(page).toContain("Доступно к выплате");
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
