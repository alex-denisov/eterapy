import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B503–B507 local visual cleanup", () => {
  it("removes the obsolete surname and numerology captions and lets surname facts auto-fit", () => {
    const surname = source("src/components/products/surname-story-actions.tsx");
    const numerology = source("src/components/products/numerology-actions.tsx");

    expect(surname).not.toContain("форма, версия, география и проверка");
    expect(surname).toContain("grid-cols-[repeat(auto-fit,minmax(150px,1fr))]");
    expect(numerology).not.toContain("число пути · выражения · души — язык повторов и ритма, не прогноз");
  });

  it("removes the natal and synastry wheel captions without touching tarot captions", () => {
    const visuals = source("src/components/products/esoteric-chart-visuals.tsx");

    expect(visuals).not.toContain("12 домов · 10 планет · аспекты");
    expect(visuals).not.toContain("bi-wheel: внешний круг");
    expect(visuals).toContain("tarot-card-caption");
  });
});
