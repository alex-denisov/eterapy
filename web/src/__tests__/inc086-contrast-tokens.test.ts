/**
 * INC-086 — внешний аудит поставил мобильной юзабилити F, но детализацию не
 * отдал (суточная квота). Вместо додумывания прогнали Lighthouse mobile против
 * прода: accessibility 96, SEO 100, и ровно одно настоящее замечание —
 * контраст. Одним токеном `--soft-ink-faint` покрашен весь футер и подписи
 * карточек, поэтому промах в нём — это промах на каждой странице сайта.
 *
 * СТОРОЖ. Токен легко «вернуть посветлее» ради вида, и заметит это только
 * следующий внешний аудит. Здесь порог считается, а не декларируется.
 */

import fs from "node:fs";
import path from "node:path";

/** Относительная яркость по WCAG 2.1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function token(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`токен ${name} не найден`);
  return match[1].toLowerCase();
}

describe("INC-086 · контраст приглушённого текста дотягивает до AA", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/v4-soft.css"), "utf8");
  const faint = token(css, "--soft-ink-faint");
  const paper = token(css, "--soft-paper");
  const card = token(css, "--soft-paper-card");

  it("на бумаге (футер) — не ниже 4.5:1", () => {
    expect(contrastRatio(faint, paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("на карточке (подписи в сетке) — не ниже 4.5:1", () => {
    expect(contrastRatio(faint, card)).toBeGreaterThanOrEqual(4.5);
  });

  it("основной и полутон остаются заметно контрастнее приглушённого", () => {
    // Иначе «починить контраст» можно было бы, схлопнув всю шкалу в один цвет,
    // и текстовая иерархия исчезла бы вместе с замечанием.
    expect(contrastRatio(token(css, "--soft-ink"), paper)).toBeGreaterThan(
      contrastRatio(faint, paper),
    );
    expect(contrastRatio(token(css, "--soft-ink-soft"), paper)).toBeGreaterThan(
      contrastRatio(faint, paper),
    );
  });
});
