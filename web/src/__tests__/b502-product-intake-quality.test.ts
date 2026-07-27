import fs from "node:fs";
import path from "node:path";
import { normalizeResultSectionHeadings, splitSections } from "@/lib/report-sections";
import { computeNumerology, numerologyFactsForAI } from "@/lib/numerology";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B502 shared digital-product intake quality", () => {
  it("uses universal product classes instead of tarot names on shared controls", () => {
    const files = [
      "src/components/products/reframe-actions.tsx",
      "src/components/products/deep-report-actions.tsx",
      "src/components/products/natal-chart-actions.tsx",
      "src/components/products/compatibility-by-date-actions.tsx",
      "src/components/products/numerology-actions.tsx",
      "src/components/products/option-scroll-strip.tsx",
    ].map(source).join("\n");

    expect(files).toContain("product-order-surface");
    expect(files).toContain("product-option-strip-track");
    expect(files).not.toMatch(/tarot-(?:order-surface|head|controls|strip|choice|question-input|question-label|action-row)/);
  });

  it("labels every requested option strip with service-specific copy", () => {
    expect(source("src/components/products/reframe-actions.tsx")).toContain('label="сфера ситуации"');
    expect(source("src/components/products/deep-report-actions.tsx")).toContain('label="результат разбора"');
    expect(source("src/components/products/natal-chart-actions.tsx")).toContain('label="фокус натальной карты"');
    expect(source("src/components/products/compatibility-by-date-actions.tsx")).toContain('label="фокус совместимости"');
    expect(source("src/components/products/numerology-actions.tsx")).toContain('label="что разобрать глубже"');
  });

  it("removes the unnecessary optional question from deterministic esoteric products", () => {
    for (const file of ["natal-chart-actions.tsx", "compatibility-by-date-actions.tsx", "numerology-actions.tsx", "human-design-actions.tsx", "surname-origin-actions.tsx"]) {
      const contents = source(`src/components/products/${file}`);
      expect(contents).not.toContain("ваш вопрос (необязательно)");
      expect(contents).not.toContain("вопрос пары (необязательно)");
    }
  });

  it("renders chat-analysis context chips through the same horizontal strip", () => {
    const chat = source("src/components/products/chat-analysis-actions.tsx");
    expect(chat).toContain("<OptionScrollStrip");
    expect(chat).toContain('label="кто собеседник"');
    expect(chat).toContain('label="что вы сейчас чувствуете"');
    expect(chat).toContain('className="soft-eyebrow product-question-label"');
  });

  it("repairs legacy Human Design pseudo-headings so the result renders as an accordion", () => {
    const legacy = "**Тип и стратегия**: Ваш тип — Генератор.\n\n**Внутренний авторитет**\nСакральный отклик.";
    const sections = splitSections(normalizeResultSectionHeadings("human-design", legacy));
    expect(sections.map((section) => section.title)).toEqual(["Тип и стратегия", "Внутренний авторитет"]);
  });

  it("keeps the legacy core numbers but makes the selected Destiny Matrix facts authoritative", () => {
    const portrait = computeNumerology("Имя: Алексей\nДата рождения: 03.03.1988");
    expect(portrait).toEqual(expect.objectContaining({ lifePath: 5, expression: 5, soulUrge: 4 }));
    const facts = numerologyFactsForAI(portrait);
    expect(facts).toContain("СИСТЕМЕ МАТРИЦЫ СУДЬБЫ 22 ЭНЕРГИЙ");
    expect(facts).not.toContain("ladini-lidrekon-v1");
    expect(facts).toContain("центр 10");
    expect(facts).toContain("родовое 20");
    expect(facts).toContain("не квадрат Пифагора");
  });
});
