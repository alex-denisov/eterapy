import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

/**
 * B717. Кнопки вариантов shadcn красятся утилитами Tailwind (@layer utilities),
 * а палитра Soft Clarity живёт в @layer components — утилиты в каскаде идут
 * позже и выигрывают. Поэтому на бумажных страницах любой <Button> с вариантом
 * получает `text-foreground` = #f8fafc, то есть белый текст на #fffcf5.
 *
 * Тест на исходник не доказывает цвет — цвет доказывает браузер (см. тикет).
 * Он держит два условия, при которых дефект возвращается молча.
 */
describe("B717 — кнопки Soft Clarity не красятся тёмной темой", () => {
  const softCss = source("src/app/v4-soft.css");

  it("палитра ghost/soft перебивает утилиты варианта", () => {
    // Без !important утилита `text-foreground` варианта выигрывает у @layer
    // components — ровно так «Назад» в анкете практика стал невидимым.
    const ghost = /\.soft-button-ghost \{[^}]+\}/.exec(softCss)?.[0] ?? "";
    const soft = /\.soft-button-soft \{[^}]+\}/.exec(softCss)?.[0] ?? "";

    expect(ghost).toContain("color: var(--soft-bordeaux) !important");
    expect(ghost).toContain("background: transparent !important");
    expect(soft).toContain("color: var(--soft-bordeaux) !important");
  });

  it("публичная бумажная страница переопределяет --foreground тёмной темы", () => {
    // Без этой строки любая утилита `text-foreground` на публичной странице
    // берёт #f8fafc из :root — белый по бумаге. Оболочки кабинета и админки
    // перекрывают токен давно, публичные страницы не перекрывали.
    const page = /\.soft-clarity-page \{[^}]+\}/.exec(softCss)?.[0] ?? "";
    expect(page).toContain("--foreground: var(--soft-ink)");
  });

  it("бесплатный расчёт на трёх витринах покрашен палитрой бумаги", () => {
    const screens = [
      ["src/components/products/natal-chart-actions.tsx", "natal-preview-start"],
      ["src/components/products/compatibility-by-date-actions.tsx", "synastry-preview-start"],
      ["src/components/products/symbolic-product-actions.tsx", "tarot-preview-start"],
    ] as const;

    for (const [file, testId] of screens) {
      const text = source(file);
      const index = text.indexOf(`data-testid="${testId}"`);
      expect(index).toBeGreaterThan(-1);

      // Разметка кнопки — от <Button до её data-testid.
      const open = text.lastIndexOf("<Button", index);
      const markup = text.slice(open, index);
      expect(markup).toContain("soft-button-ghost");
    }
  });
});
