// B731 — эмодзи для картинок `next/og` лежат в репозитории.
//
// Люди пишут в мессенджерах эмодзи, и мокап без них выдаёт себя не меньше, чем
// шрифт. Взять их шрифтом нельзя: во вшитом подмножестве Roboto глифов эмодзи
// нет, а `next/og` умеет тянуть эмодзи-шрифт ТОЛЬКО из сети — на российской
// ноде это отказ, а поход в сеть на сборке уже ронял выкатку
// ([[reference_google_fonts_break_the_build]]).
//
// Поэтому каждый эмодзи вшит отдельным SVG и подставляется в разметку
// картинкой (`<img src="data:image/svg+xml;base64,…">`). Источник — Noto Color
// Emoji (googlefonts/noto-emoji, Apache-2.0): именно этим набором Android
// рисует эмодзи в Telegram, то есть это тот же эталон, что и цвета темы.
//
//   node scripts/vendor-og-emoji.mjs          # обновить
//   node scripts/vendor-og-emoji.mjs --check  # сверить с источником
//
// ⚠ Только односимвольные эмодзи. Последовательности с ZWJ (🤦‍♀️) в Noto лежат
// под составными именами файлов, а в разметке требуют разбора графемных
// кластеров — цена не стоит выигрыша.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(webDir, "public", "og-emoji");
const BASE = "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/svg";

/** Набор ровно тот, что встречается в живой русской переписке. */
const EMOJI = [
  "😂", "🤣", "🙂", "🙃", "😅", "😊", "😍", "🥰", "😘", "😔",
  "😭", "😢", "😞", "😡", "🤬", "🥲", "😳", "🙄", "😐", "😬",
  "😴", "🤔", "😱", "🤡", "💩", "❤️", "💔", "🔥", "👍", "👎",
  "🙏", "✨", "🤝", "🤢", "🥴", "😇", "😈", "🫡", "🫠", "😤",
];

function codepoints(emoji) {
  return [...emoji]
    .map((char) => char.codePointAt(0).toString(16))
    // Noto хранит файлы без селектора начертания (FE0F) у части символов —
    // пробуем оба имени.
    .join("_");
}

async function fetchSvg(emoji) {
  const full = codepoints(emoji);
  const bare = full.replace(/_fe0f$/u, "");
  for (const name of [full, bare]) {
    const response = await fetch(`${BASE}/emoji_u${name}.svg`);
    if (response.ok) return { name: `${name}.svg`, body: await response.text() };
  }
  throw new Error(`нет файла для ${emoji} (u${full})`);
}

async function main() {
  const check = process.argv.includes("--check");
  await mkdir(outDir, { recursive: true });
  const problems = [];
  const index = {};
  for (const emoji of EMOJI) {
    const { name, body } = await fetchSvg(emoji);
    index[emoji] = name;
    const target = path.join(outDir, name);
    if (check) {
      if (!existsSync(target)) problems.push(`public/og-emoji/${name} (нет)`);
      else if ((await readFile(target, "utf8")) !== body) problems.push(`public/og-emoji/${name} (другой файл)`);
      continue;
    }
    await writeFile(target, body);
  }
  const indexJson = `${JSON.stringify(index, null, 2)}\n`;
  const indexPath = path.join(outDir, "index.json");
  if (check) {
    if (!existsSync(indexPath) || (await readFile(indexPath, "utf8")) !== indexJson) {
      problems.push("public/og-emoji/index.json");
    }
    if (problems.length > 0) throw new Error(`вшитые эмодзи разошлись:\n  ${problems.join("\n  ")}`);
    console.log("[og-emoji] совпадают с источником");
    return;
  }
  await writeFile(indexPath, indexJson);
  console.log(`[og-emoji] ${EMOJI.length} файлов`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
