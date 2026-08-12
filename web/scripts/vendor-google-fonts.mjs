// B667 — забрать шрифты у Google ОДИН раз и положить в репозиторий.
//
// Зачем: `next/font/google` ходит в Google на КАЖДОЙ сборке. Google периодически
// отдаёт CSS со ссылками на файлы, которые тут же дают 404, и сборка падает
// целиком — «Failed to fetch `Cormorant Garamond` from Google Fonts». Это ловилось
// и в прогоне выкатки, и локально в тот же день; повтор помогает, но выкатка
// правки, которая нужна людям, зависит от чужого CDN.
//
// Что делает скрипт: берёт у Google ту же самую таблицу @font-face, что брал бы
// `next/font`, скачивает файлы и переписывает ссылки на локальные. Результат —
// `web/public/fonts/*.woff2` и `web/src/app/fonts.css` — коммитится. Скрипт нужен
// только чтобы ОБНОВИТЬ шрифты; сборка его не вызывает.
//
//   node scripts/vendor-google-fonts.mjs          # обновить
//   node scripts/vendor-google-fonts.mjs --check  # проверить, что ничего не разъехалось
//
// Google отдаёт по одному ПЕРЕМЕННОМУ файлу на подмножество символов: 20 правил
// Cormorant Garamond ссылаются на 5 файлов, 30 правил Manrope — на 6. Поэтому
// «вшить все начертания» стоит 11 файлов, а не полсотни.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = path.join(webDir, "public", "fonts");
const cssPath = path.join(webDir, "src", "app", "fonts.css");

// Chrome-подобный User-Agent обязателен: по умолчанию Google отдаёт ttf, а нам
// нужен woff2 — тот же формат, что забирал `next/font`.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Семейства ровно в том виде, в каком их запрашивал `layout.tsx`.
 * `preload` — подмножества, которые нужны первому экрану: у нас русский и
 * латиница. `next/font` предзагружал ровно их (файлы с меткой `.p.` в сборке).
 */
const FAMILIES = [
  {
    family: "Cormorant Garamond",
    slug: "cormorant-garamond",
    weights: [400, 500, 600, 700],
    cssVariable: "--font-heading-v4",
    // Метрики запасного шрифта — из сборки `next/font`, чтобы подмена шрифта
    // не двигала вёрстку (CLS) ровно так же, как раньше.
    fallback: {
      family: "Cormorant Garamond Fallback",
      local: "Times New Roman",
      declarations: {
        "ascent-override": "95.27%",
        "descent-override": "29.59%",
        "line-gap-override": "0.00%",
        "size-adjust": "96.98%",
      },
    },
  },
  {
    family: "Manrope",
    slug: "manrope",
    weights: [400, 500, 600, 700, 800],
    cssVariable: "--font-body-v4",
    fallback: {
      family: "Manrope Fallback",
      local: "Arial",
      declarations: {
        "ascent-override": "103.31%",
        "descent-override": "29.07%",
        "line-gap-override": "0.00%",
        "size-adjust": "103.19%",
      },
    },
  },
];

const PRELOAD_SUBSETS = new Set(["cyrillic", "latin"]);

function say(message) {
  console.log(`[fonts] ${message}`);
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

/** Разбирает CSS Google: комментарий с именем подмножества + правило @font-face. */
function parseGoogleCss(css) {
  const blocks = [];
  const pattern = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[\s\S]*?\})/g;
  for (const match of css.matchAll(pattern)) {
    const [, subset, rule] = match;
    const weight = /font-weight:\s*(\d+)/.exec(rule)?.[1];
    const style = /font-style:\s*([a-z]+)/.exec(rule)?.[1] ?? "normal";
    const url = /src:\s*url\(([^)]+)\)/.exec(rule)?.[1];
    const unicodeRange = /unicode-range:\s*([^;}]+)/.exec(rule)?.[1]?.trim();
    if (!weight || !url || !unicodeRange) {
      throw new Error(`не разобрано правило @font-face:\n${rule}`);
    }
    blocks.push({ subset, weight: Number(weight), style, url, unicodeRange });
  }
  if (blocks.length === 0) throw new Error("Google отдал CSS без @font-face — разбор сломан");
  return blocks;
}

function renderFace({ family, weight, style, file, unicodeRange }) {
  return [
    "@font-face {",
    `  font-family: "${family}";`,
    `  font-style: ${style};`,
    `  font-weight: ${weight};`,
    "  font-display: swap;",
    `  src: url("/fonts/${file}") format("woff2");`,
    `  unicode-range: ${unicodeRange};`,
    "}",
  ].join("\n");
}

function renderFallback({ family, local, declarations }) {
  return [
    "@font-face {",
    `  font-family: "${family}";`,
    `  src: local("${local}");`,
    ...Object.entries(declarations).map(([prop, value]) => `  ${prop}: ${value};`),
    "}",
  ].join("\n");
}

async function main() {
  const check = process.argv.includes("--check");
  const files = new Map(); // имя файла → байты
  const sections = [];
  const preloads = [];

  for (const family of FAMILIES) {
    const query = `family=${family.family.replace(/ /g, "+")}:wght@${family.weights.join(";")}&display=swap`;
    const css = await fetchText(`https://fonts.googleapis.com/css2?${query}`);
    const blocks = parseGoogleCss(css);

    const byUrl = new Map();
    const faces = [];
    for (const block of blocks) {
      let file = byUrl.get(block.url);
      if (!file) {
        const response = await fetch(block.url, { headers: { "user-agent": USER_AGENT } });
        if (!response.ok) throw new Error(`${block.url} → HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        // Отпечаток содержимого в имени: адрес можно кешировать навсегда
        // (`immutable` в next.config.ts), а обновление шрифта меняет имя и
        // доезжает до людей само. `next/font` делал ровно это.
        const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
        file = `${family.slug}-${block.subset}.${digest}.woff2`;
        byUrl.set(block.url, file);
        files.set(file, bytes);
        if (PRELOAD_SUBSETS.has(block.subset)) preloads.push(file);
      }
      faces.push(
        renderFace({
          family: family.family,
          weight: block.weight,
          style: block.style,
          file,
          unicodeRange: block.unicodeRange,
        }),
      );
    }

    sections.push(
      `/* ${family.family} — ${byUrl.size} файлов на ${faces.length} начертаний */`,
      ...faces,
      renderFallback(family.fallback),
      "",
    );
    say(`${family.family}: ${faces.length} правил, ${byUrl.size} файлов`);
  }

  const variables = FAMILIES.map(
    (family) => `  ${family.cssVariable}: "${family.family}", "${family.fallback.family}";`,
  );
  const css = [
    "/* Сгенерировано `node scripts/vendor-google-fonts.mjs` — руками не править.",
    " *",
    " * B667: шрифты лежат в репозитории, а не забираются у Google на каждой сборке.",
    " * Google периодически отдаёт CSS со ссылками, которые тут же дают 404, и сборка",
    " * падает целиком. Таблица @font-face здесь — та же самая, что приходила от",
    ' * Google: те же подмножества, те же unicode-range, те же метрики запасного',
    " * шрифта, чтобы подмена не двигала вёрстку.",
    " */",
    "",
    ...sections,
    ":root {",
    ...variables,
    "}",
    "",
  ].join("\n");

  const preloadPath = path.join(webDir, "src", "app", "font-preloads.json");
  const preloadJson = `${JSON.stringify([...new Set(preloads)], null, 2)}\n`;

  if (check) {
    const problems = [];
    if ((await readFile(cssPath, "utf8")) !== css) problems.push(path.relative(webDir, cssPath));
    if ((await readFile(preloadPath, "utf8")) !== preloadJson) {
      problems.push(path.relative(webDir, preloadPath));
    }
    for (const [file, bytes] of files) {
      const target = path.join(fontsDir, file);
      if (!existsSync(target)) {
        problems.push(`public/fonts/${file} (нет)`);
        continue;
      }
      const have = createHash("sha256").update(await readFile(target)).digest("hex");
      const want = createHash("sha256").update(bytes).digest("hex");
      if (have !== want) problems.push(`public/fonts/${file} (другой файл)`);
    }
    if (problems.length > 0) {
      throw new Error(`вшитые шрифты разошлись с Google:\n  ${problems.join("\n  ")}`);
    }
    say("вшитые шрифты совпадают с тем, что отдаёт Google");
    return;
  }

  await rm(fontsDir, { recursive: true, force: true });
  await mkdir(fontsDir, { recursive: true });
  for (const [file, bytes] of files) await writeFile(path.join(fontsDir, file), bytes);
  await writeFile(cssPath, css);
  await writeFile(preloadPath, preloadJson);
  const total = [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  say(`записано ${files.size} файлов (${Math.round(total / 1024)} КБ), предзагрузка: ${new Set(preloads).size}`);
  say(`каталог: ${path.relative(webDir, fontsDir)} · ${(await readdir(fontsDir)).length} файлов`);
}

await main();
