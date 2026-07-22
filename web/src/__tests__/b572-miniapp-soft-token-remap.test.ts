/**
 * B572 (owner 2026-07-22) — «кнопка имеет неправильный контраст когда активна».
 *
 * Мини-апп тёмный, а переиспользует светлые компоненты кабинета (Центр
 * поддержки и другие), которые красятся токенами `--soft-*`. Мини-апп
 * перекладывает эти токены под тёмную тему у себя в модуле. Перекладка была
 * НЕПОЛНОЙ: `--soft-surface` в списке не значился и оставался светлым кремом
 * из :root, тогда как текст поверх него (`--soft-ink`, `--soft-bordeaux`) уже
 * становился светлым. На проде это дало #f7f4ed на #f6efe1 — контраст 1.03:1,
 * выбранная категория читалась как пустая плашка.
 *
 * Тест ловит именно КЛАСС дефекта: любой `--soft-*`, которым красится общий
 * компонент, обязан быть переложен в каждом тёмном блоке — иначе следующая
 * забытая переменная снова тихо даст светлое на светлом.
 */
import fs from "node:fs";
import path from "node:path";

const cssPath = path.join(process.cwd(), "src", "app", "miniapp", "miniapp-v21.module.css");
const css = fs.readFileSync(cssPath, "utf8");

/** Блоки, которые накрывают общие компоненты кабинета внутри тёмного мини-аппа. */
const DARK_SCOPES = [".product-native-page", ".dialogue-surface", ".miniapp-session"];

/** Токены, которыми общие компоненты задают ФОН — светлый фон здесь опаснее всего. */
const SURFACE_TOKENS = ["--soft-paper", "--soft-paper-card", "--soft-paper-deep", "--soft-surface"];

function blockFor(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const end = css.indexOf("\n}", start);
  // Комментарии срезаем: в них разбор дефекта со ссылкой на старые цвета, и
  // без этого проверка «светлого крема здесь нет» ловила бы сам разбор.
  return css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("B572 · тёмная перекладка --soft-* в мини-аппе", () => {
  it.each(DARK_SCOPES)("%s перекладывает все фоновые токены", (selector) => {
    const block = blockFor(selector);
    for (const token of SURFACE_TOKENS) {
      expect(block).toContain(`${token}:`);
    }
  });

  it.each(DARK_SCOPES)("%s не оставляет светлую заливку выбранного состояния", (selector) => {
    const block = blockFor(selector);
    // #f6efe1 — светлый крем из :root; попадание его сюда означает возврат бага.
    expect(block).not.toContain("#f6efe1");
    expect(block).toMatch(/--soft-surface:\s*rgba\(255, 101, 72/);
  });

  it("светлое значение --soft-surface остаётся только в :root-палитре v4-soft", () => {
    const soft = fs.readFileSync(path.join(process.cwd(), "src", "app", "v4-soft.css"), "utf8");
    expect(soft).toContain("--soft-surface: #f6efe1");
  });
});
