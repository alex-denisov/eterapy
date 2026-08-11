// B667 — шрифты лежат в репозитории, а не забираются у Google на каждой сборке.
//
// Проверять это тестом нужно потому, что отказ здесь тихий: сборка проходит,
// страница отдаётся, а заголовки внезапно рисуются Times New Roman. Ровно так
// уже случалось с боевыми ресурсами, которые проглатывал `.gitignore`.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const appDir = path.join(__dirname, "..", "app");
const fontsCss = readFileSync(path.join(appDir, "fonts.css"), "utf8");
const preloads: string[] = JSON.parse(
  readFileSync(path.join(appDir, "font-preloads.json"), "utf8"),
);
const layout = readFileSync(path.join(appDir, "layout.tsx"), "utf8");

function referencedFiles(): string[] {
  return [...fontsCss.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((match) => match[1]);
}

describe("B667 · вшитые шрифты", () => {
  it("каждый файл из fonts.css лежит в public/fonts", () => {
    const files = referencedFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of new Set(files)) {
      const target = path.join(__dirname, "..", "..", "public", "fonts", file);
      expect(existsSync(target)).toBe(true);
    }
  });

  it("предзагружаются только те файлы, которые реально объявлены", () => {
    const files = new Set(referencedFiles());
    expect(preloads.length).toBeGreaterThan(0);
    for (const file of preloads) expect(files.has(file)).toBe(true);
  });

  it("объявлены обе переменные, которыми пользуется globals.css", () => {
    expect(fontsCss).toMatch(/--font-heading-v4:\s*"Cormorant Garamond"/);
    expect(fontsCss).toMatch(/--font-body-v4:\s*"Manrope"/);
  });

  it("каждое семейство несёт и кириллицу, и запасные метрики", () => {
    for (const family of ["Cormorant Garamond", "Manrope"]) {
      expect(fontsCss).toContain(`font-family: "${family} Fallback"`);
      expect(fontsCss).toMatch(new RegExp(`${family}[\\s\\S]*?U\\+0400-045F`));
    }
    // size-adjust у запасного шрифта — то, что удерживает вёрстку при подмене.
    expect(fontsCss).toMatch(/size-adjust:\s*96\.98%/);
    expect(fontsCss).toMatch(/size-adjust:\s*103\.19%/);
  });

  it("layout не ходит в Google за шрифтами", () => {
    // Проверяем именно ИМПОРТ: слова «next/font/google» есть в комментарии,
    // который объясняет, почему его больше нет.
    expect(layout).not.toMatch(/^\s*import .*"next\/font\/google"/m);
    expect(layout).toContain('import "./fonts.css"');
  });
});
