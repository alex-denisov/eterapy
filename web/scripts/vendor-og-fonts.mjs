// B731 — шрифт для картинок `next/og` (Satori) лежит в репозитории.
//
// Обложка-мокап обязана выглядеть как скриншот Telegram, а Telegram на Android
// набран Roboto. Взять шрифт из `public/fonts` нельзя: там woff2, а Satori
// понимает только ttf/otf/woff. Ходить за шрифтом в сеть во время сборки тоже
// нельзя — ровно на этом уже падала выкатка ([[reference_google_fonts_break_the_build]]).
//
// Поэтому файлы вшиты. Скрипт нужен только чтобы их ОБНОВИТЬ или сверить;
// сборка его не вызывает.
//
//   node scripts/vendor-og-fonts.mjs          # обновить
//   node scripts/vendor-og-fonts.mjs --check  # сверить с тем, что отдаёт Google
//
// ⚠ Каталог отдельный от `public/fonts`: `vendor-google-fonts.mjs` стирает свой
// каталог целиком перед записью и унёс бы эти файлы с собой.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(webDir, "public", "og-fonts");

// Старый User-Agent обязателен: современному браузеру Google отдаёт woff2,
// которого Satori не понимает. `Mozilla/4.0` — это ttf.
const USER_AGENT = "Mozilla/4.0";

const FAMILY = "Roboto";
const WEIGHTS = [400, 500];
const SUBSETS = "cyrillic,latin";

async function main() {
  const check = process.argv.includes("--check");
  const css = await fetch(
    `https://fonts.googleapis.com/css?family=${FAMILY}:${WEIGHTS.join(",")}&subset=${SUBSETS}`,
    { headers: { "user-agent": USER_AGENT } },
  ).then((response) => {
    if (!response.ok) throw new Error(`css → HTTP ${response.status}`);
    return response.text();
  });

  const urls = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\((https:[^)]+\.ttf)\)/g)];
  if (urls.length !== WEIGHTS.length) {
    throw new Error(`Google отдал ${urls.length} начертаний вместо ${WEIGHTS.length}`);
  }

  await mkdir(outDir, { recursive: true });
  const problems = [];
  for (const [, weight, url] of urls) {
    const bytes = Buffer.from(
      await fetch(url, { headers: { "user-agent": USER_AGENT } }).then((response) => {
        if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
    );
    const target = path.join(outDir, `roboto-${weight}.ttf`);
    if (check) {
      if (!existsSync(target)) problems.push(`public/og-fonts/roboto-${weight}.ttf (нет)`);
      else if (!(await readFile(target)).equals(bytes)) {
        problems.push(`public/og-fonts/roboto-${weight}.ttf (другой файл)`);
      }
      continue;
    }
    await writeFile(target, bytes);
    console.log(`[og-fonts] roboto-${weight}.ttf — ${bytes.length} Б`);
  }

  if (problems.length > 0) throw new Error(`вшитые шрифты разошлись:\n  ${problems.join("\n  ")}`);
  console.log(check ? "[og-fonts] совпадают с Google" : "[og-fonts] обновлены");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
