import fs from "fs";
import path from "path";

const root = process.cwd();

function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      collectSources(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("B368 (M26) — «ясность» только как бренд-тег", () => {
  it("«ясност*» встречается < 10 раз и только в осознанных бренд-местах", () => {
    const hits: Array<{ file: string; count: number }> = [];
    for (const file of collectSources(path.join(root, "src"))) {
      // B431 (M28): «баллы/баллов ясности» is the formal product name used in the
      // legal documents and the registration consent links (e.g. «Правила баллов
      // ясности») — not generic brand copy. Strip it before counting.
      const text = fs.readFileSync(file, "utf8").replace(/балл[а-яё]*\s+ясност[а-яё]*/gi, "");
      const count = (text.match(/ясност/gi) ?? []).length;
      if (count > 0) hits.push({ file: path.relative(root, file), count });
    }
    const total = hits.reduce((sum, h) => sum + h.count, 0);
    expect(total).toBeLessThan(10);
    // Бренд-тег живёт только на /about («Платформа ясности», «Ясность без давления»).
    expect(hits.map((h) => h.file)).toEqual(["src/app/about/page.tsx"]);
  });

  it("hero лендинга — «Разберитесь в ситуации за несколько минут»", () => {
    const hero = fs.readFileSync(path.join(root, "src/components/landing/hero.tsx"), "utf8");
    expect(hero).toContain("Разберитесь в ситуации");
    expect(hero).toContain("за несколько минут");
  });
});
