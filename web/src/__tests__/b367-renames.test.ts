import fs from "fs";
import path from "path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

/** Recursively collect .ts/.tsx sources excluding tests. */
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

describe("B367 (M26) — переименования услуг и выпил «ракурса»", () => {
  it("не содержит слова «ракурс» ни в одном UI-источнике", () => {
    const offenders = collectSources(path.join(root, "src"))
      .filter((file) => /ракурс/i.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });

  it("продукты называются по решениям M26/M28", () => {
    const products = source("src/lib/v5-products.ts");
    // B441 (M28): «Полная картина» → «Переосмысление» (когнитивный рефрейминг).
    expect(products).toContain('name: "Переосмысление"');
    expect(products).toContain('name: "Подробный разбор"');
    expect(products).toContain('name: "Совместимость по дате"');
    expect(products).not.toContain("joint-session\":");

    const labels = source("src/lib/billing-labels.ts");
    expect(labels).toContain('reframe: "Переосмысление"');
    expect(labels).toContain('"deep-report": "Подробный разбор"');
  });

  it("линзы «Переосмысления» — мысли · чувства · другой взгляд · шаг (CBT-рефрейминг)", () => {
    const reframe = source("src/lib/reframe.ts");
    expect(reframe).toContain('title: "Мысли"');
    expect(reframe).toContain('title: "Чувства"');
    expect(reframe).toContain('title: "Другой взгляд"');
    expect(reframe).toContain('title: "Шаг"');
  });

  it("joint-session выпилен: нет роутов, sitemap и упоминаний в каталоге", () => {
    expect(fs.existsSync(path.join(root, "src/app/joint"))).toBe(false);
    expect(fs.existsSync(path.join(root, "src/components/products/joint-session-actions.tsx"))).toBe(false);
    expect(source("src/lib/seo.ts")).not.toContain("joint-session");
    expect(source("src/lib/public-page-seo.ts")).not.toContain("joint-session");
    expect(source("src/proxy.ts")).not.toContain("joint");
    expect(source("src/components/footer.tsx")).not.toContain("joint-session");
  });

  it("каталог специалистов показывает бейдж универсала вместо услуги", () => {
    const grid = source("src/app/practitioners/practitioners-grid.tsx");
    expect(grid).toContain("психология + эзотерика");
    expect(grid).toContain("practitioner-universal-badge");
    expect(grid).not.toContain('"joint-session"');
  });
});
