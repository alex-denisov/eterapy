/**
 * B731 — эмодзи для обложек `next/og`.
 *
 * Требование владельца 2026-09-08: «Мне также нужен эмодзи-шрифт, потому что
 * иногда люди пишут с эмодзи». Шрифтом это не решается: во вшитом подмножестве
 * Roboto глифов эмодзи нет, а `next/og` тянет эмодзи-шрифт из сети — на
 * российской ноде это отказ, а поход в сеть на сборке уже ронял выкатку
 * ([[reference_google_fonts_break_the_build]]).
 *
 * Поэтому каждый эмодзи вшит отдельным SVG (`public/og-emoji`, кладёт
 * `scripts/vendor-og-emoji.mjs`) и подставляется в разметку картинкой. Набор —
 * Noto Color Emoji: именно им Android рисует эмодзи в Telegram, то есть тот же
 * эталон, что и цвета темы.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export type EmojiMap = Record<string, string>;

let cached: Promise<EmojiMap> | null = null;

async function load(): Promise<EmojiMap> {
  const dir = path.join(process.cwd(), "public", "og-emoji");
  const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8")) as Record<string, string>;
  const entries = await Promise.all(
    Object.entries(index).map(async ([emoji, file]) => {
      const svg = await readFile(path.join(dir, file));
      return [emoji, `data:image/svg+xml;base64,${svg.toString("base64")}`] as const;
    }),
  );
  /**
   * Ключ дублируется без селектора начертания (U+FE0F). «❤️» — это ДВА
   * символа, и разбор строки по графемам отдаёт сердце и селектор по
   * отдельности: без второго ключа селектор оставался бы в тексте и печатался
   * пустым прямоугольником — ровно то, чего мы избегаем.
   */
  const map: EmojiMap = {};
  for (const [emoji, source] of entries) {
    map[emoji] = source;
    const bare = emoji.replace(/[\uFE0E\uFE0F]/gu, "");
    if (bare && !map[bare]) map[bare] = source;
  }
  return map;
}

/**
 * Карта «эмодзи → data-URI». Читается с диска один раз на процесс.
 *
 * При неудаче — пустая карта, а не исключение: без эмодзи мокап беднее, но
 * обложка, отдающая 500, ломает публикацию целиком. Разметка в этом случае
 * выбрасывает эмодзи из текста, а не печатает пустой квадрат.
 */
export async function ogEmoji(): Promise<EmojiMap> {
  if (!cached) {
    cached = load().catch((error) => {
      console.warn("[cover] og-emoji.unavailable", error);
      cached = null;
      return {};
    });
  }
  return cached;
}
