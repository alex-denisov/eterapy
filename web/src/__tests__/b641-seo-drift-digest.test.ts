/**
 * B641 — сводка сторожа поисковой разметки.
 *
 * Сборщик написан на Python: он живёт в шаге GitHub Actions рядом с остальным
 * SEO-инструментарием, где Node нет вовсе. Тест поэтому запускает настоящий
 * скрипт настоящим python3 и проверяет то, ради чего он написан: одно
 * расхождение на сорока страницах должно читаться как одно событие, а не как
 * сорок, и сообщение обязано влезать в экран телефона.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.join(__dirname, "../../../scripts/seo/drift_digest.py");

function digest(report: unknown, format: "telegram" | "summary" = "telegram", indexnow?: string) {
  const args = [SCRIPT, "--format", format];
  if (indexnow) args.push("--indexnow", indexnow);
  return execFileSync("python3", args, {
    input: JSON.stringify(report),
    encoding: "utf8",
  });
}

const page = (url: string, rule: string, severity: "CRITICAL" | "WARNING") => ({
  url,
  findings: [{ rule, severity, message: `${rule} on ${url}` }],
});

describe("B641 · сводка сторожа разметки", () => {
  it("спокойный прогон умещается в три строки и не пугает", () => {
    const text = digest({ urls_total: 205, checked: 205, pages: [], errors: [] }, "telegram", "изменений нет");
    expect(text.split("\n")).toHaveLength(3);
    expect(text).toContain("всё совпало");
    expect(text).toContain("IndexNow: изменений нет");
    expect(text).not.toContain("🔴");
  });

  it("одно расхождение на многих адресах — одна строка, а не сорок", () => {
    const pages = Array.from({ length: 40 }, (_, i) =>
      page(`https://eterapy.com/library/card-${i}`, "title_changed", "WARNING"),
    );
    const text = digest({ urls_total: 205, checked: 205, pages, errors: [] });

    expect(text).toContain("🟡 сменился заголовок title — 40");
    // Показаны три пути и «+37» — не сорок строк.
    expect(text).toContain("+37");
    expect(text.match(/🟡/g)).toHaveLength(1);
    expect(text.length).toBeLessThanOrEqual(1200);
  });

  it("критичное идёт выше предупреждений", () => {
    const text = digest({
      urls_total: 3,
      checked: 3,
      pages: [
        page("https://eterapy.com/a", "title_changed", "WARNING"),
        page("https://eterapy.com/b", "title_changed", "WARNING"),
        page("https://eterapy.com/c", "noindex_added", "CRITICAL"),
      ],
      errors: [],
    });
    expect(text.indexOf("появился запрет индексации")).toBeLessThan(text.indexOf("сменился заголовок title"));
  });

  it("адреса печатаются путями, а не полными URL", () => {
    const text = digest({
      urls_total: 1,
      checked: 1,
      pages: [page("https://eterapy.com/products/tarot", "canonical_changed", "CRITICAL")],
      errors: [],
    });
    expect(text).toContain("/products/tarot");
    expect(text).not.toContain("https://eterapy.com/products/tarot");
  });

  it("длинный отчёт обрезается и говорит, что он обрезан", () => {
    const rules = [
      "status_code_error", "noindex_added", "canonical_removed", "canonical_changed",
      "title_removed", "title_changed", "h1_removed", "h1_changed",
      "meta_description_changed", "og_tags_removed", "schema_removed", "schema_modified",
    ];
    const pages = rules.flatMap((rule, i) =>
      Array.from({ length: 5 }, (_, j) =>
        page(`https://eterapy.com/very/long/section-${i}/page-${j}`, rule, "CRITICAL"),
      ),
    );
    const text = digest({ urls_total: 205, checked: 205, pages, errors: [] });
    expect(text.length).toBeLessThanOrEqual(1200);
    expect(text).toMatch(/сокращён|и ещё \d+ видов/);
  });

  it("не сверенные адреса считаются отдельно от расхождений", () => {
    const text = digest({
      urls_total: 205,
      checked: 205,
      pages: [],
      errors: ["https://eterapy.com/x: no baseline"],
    });
    expect(text).toContain("не сверено 1");
  });

  it("один адрес с двумя находками одного правила считается один раз", () => {
    const text = digest({
      urls_total: 1,
      checked: 1,
      pages: [{
        url: "https://eterapy.com/a",
        findings: [
          { rule: "schema_modified", severity: "WARNING", message: "one" },
          { rule: "schema_modified", severity: "WARNING", message: "two" },
        ],
      }],
      errors: [],
    });
    expect(text).toContain("изменилась разметка Schema — 1");
  });

  it("полная сводка прогона содержит все адреса целиком", () => {
    const markdown = digest({
      urls_total: 2,
      checked: 2,
      pages: [
        page("https://eterapy.com/a", "title_changed", "WARNING"),
        page("https://eterapy.com/b", "title_changed", "WARNING"),
      ],
      errors: [],
    }, "summary");
    expect(markdown).toContain("https://eterapy.com/a");
    expect(markdown).toContain("https://eterapy.com/b");
    expect(markdown).toContain("<details>");
  });
});
