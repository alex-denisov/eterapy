/**
 * B731 — шрифт для обложек `next/og`.
 *
 * До этой правки обложки рисовались шрифтом по умолчанию, а мокап переписки
 * объявлял `fontFamily: "Arial"` — то есть выглядел чем угодно, только не
 * скриншотом Telegram, который на Android набран Roboto. Требование владельца
 * («хоть немного непохож — уже провал») закрывается только настоящим шрифтом.
 *
 * Файлы вшиты в образ (`public/og-fonts`, кладёт `scripts/vendor-og-fonts.mjs`)
 * и НЕ забираются из сети: на походе за шрифтами уже падала сборка
 * ([[reference_google_fonts_break_the_build]]). Satori понимает ttf/otf/woff и
 * НЕ понимает woff2 — поэтому взять готовые файлы из `public/fonts` нельзя.
 *
 * `process.cwd()` указывает на `web/` и в разработке, и в standalone-образе
 * (`WORKDIR /app/web`), а `public` в образ копируется целиком
 * (`scripts/build-standalone.mjs`).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500;
  style: "normal";
}

/** Имя семейства — то же, что просит разметка обложки. */
export const OG_FONT_FAMILY = "Roboto";

let cached: Promise<OgFont[]> | null = null;

async function load(): Promise<OgFont[]> {
  const dir = path.join(process.cwd(), "public", "og-fonts");
  const weights: (400 | 500)[] = [400, 500];
  const files = await Promise.all(
    weights.map(async (weight) => {
      const bytes = await readFile(path.join(dir, `roboto-${weight}.ttf`));
      return {
        name: OG_FONT_FAMILY,
        // Копия, а не `bytes.buffer`: Node отдаёт представление на общий пул,
        // и `buffer` целиком — это чужие байты, а не наш файл.
        data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        weight,
        style: "normal" as const,
      };
    }),
  );
  return files;
}

/**
 * Шрифты обложки. Читаются с диска один раз на процесс.
 *
 * При неудаче возвращается пустой список, а не исключение: обложка без Roboto
 * некрасива, но обложка, отдающая 500, ломает публикацию целиком.
 */
export async function ogFonts(): Promise<OgFont[]> {
  if (!cached) {
    cached = load().catch((error) => {
      console.warn("[cover] og-fonts.unavailable", error);
      cached = null;
      return [];
    });
  }
  return cached;
}
