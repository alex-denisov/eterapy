// B667 — досборка standalone-дерева до полного релизного рантайма.
//
// `next build` с `output: "standalone"` кладёт в `.next/standalone` только то,
// что нужно веб-серверу: трассированные файлы пакетов и серверные чанки. В
// образе живут ещё три процесса, и каждый из них standalone не видит:
//
//   worker            — свой бандл, свои зависимости
//   marketing worker  — то же самое
//   migrate           — CLI Prisma и schema-engine
//
// Плюс статика, `public` и точка входа `npm start`. Всё это собирается здесь и
// проверяется здесь же: молча недостающий файл в этом дереве — не деградация, а
// падение процесса в проде, поэтому проверки бросают, а не предупреждают.

import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { nodeFileTrace } from "@vercel/nft";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webDir, "..");
const standaloneRoot = path.join(webDir, ".next", "standalone");
const appOut = path.join(standaloneRoot, path.basename(webDir));

// Дерево CLI Prisma собирается ПО ЕГО СОБСТВЕННОМУ манифесту, обходом
// `dependencies` вглубь, и целиком.
//
// Обе попытки сузить его провалились на прогоне, а не в рассуждении:
//   1. список пакетов «на глаз» потерял `@prisma/engines-version`;
//   2. отбрасывание веток `prisma studio` / `prisma dev` (~180 МБ) не работает:
//      `@prisma/studio-core/data/bff` и `@prisma/dev/internal/state` бандл
//      требует на ЗАГРУЗКЕ модуля, а не внутри своих команд — без них CLI не
//      стартует вовсе, включая `migrate deploy`.
// Планка образа берётся с запасом и без этой экономии, поэтому вычитать из
// чужого бандла по одному пакету — риск без выигрыша.
const PRISMA_CLI_ROOTS = ["prisma", "@prisma/config"];

const WORKERS = [
  { entry: "src/worker/index.ts", out: "dist/worker.cjs" },
  { entry: "src/marketing-worker/index.ts", out: "dist/marketing-worker.cjs" },
];

function say(message) {
  console.log(`[b667] ${message}`);
}

async function dirSizeMb(target) {
  let total = 0;
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) total += (await stat(full)).size;
    }
  };
  await walk(target);
  return Math.round(total / 1024 / 1024);
}

/** Внешними остаются все пакеты: бандлим только свой исходник. */
async function externalPackages() {
  const names = new Set();
  for (const manifest of [path.join(webDir, "package.json"), path.join(repoRoot, "package.json")]) {
    const pkg = JSON.parse(await readFile(manifest, "utf8"));
    for (const group of [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies]) {
      for (const name of Object.keys(group ?? {})) names.add(name);
    }
  }
  // Подпути тех же пакетов (`dotenv/config`, `next/og`, …) esbuild считает
  // внешними по префиксу шаблона.
  return [...names].flatMap((name) => [name, `${name}/*`]);
}

async function bundleWorkers() {
  const external = await externalPackages();
  for (const worker of WORKERS) {
    const outfile = path.join(appOut, worker.out);
    await build({
      entryPoints: [path.join(webDir, worker.entry)],
      outfile,
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      sourcemap: false,
      minify: false,
      logLevel: "warning",
      tsconfig: path.join(webDir, "tsconfig.json"),
      external,
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const size = Math.round((await stat(outfile)).size / 1024);
    say(`бандл ${worker.out}: ${size} КБ`);
  }
}

/**
 * Файлы внешних пакетов доносит тот же трассировщик, которым Next собирает
 * standalone. Один инструмент на оба дерева — значит, полнота у воркера и у
 * приложения не может разойтись.
 */
async function traceIntoStandalone(entries, label) {
  const { fileList, warnings } = await nodeFileTrace(entries, {
    base: repoRoot,
    processCwd: webDir,
    ignore: ["**/node_modules/.cache/**", "**/*.map"],
  });
  let copied = 0;
  for (const relative of fileList) {
    const source = path.join(repoRoot, relative);
    const target = path.join(standaloneRoot, relative);
    if (existsSync(target) || !existsSync(source)) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, dereference: true });
    copied += 1;
  }
  const realWarnings = [...warnings].filter(
    (warning) => !/Failed to resolve dependency/.test(String(warning?.message ?? warning)),
  );
  for (const warning of realWarnings) console.warn(`[b667] trace: ${warning}`);
  say(`${label}: трассировка добавила ${copied} файлов`);
}

async function copyPrismaCli() {
  const collected = new Set();
  const visit = async (name) => {
    if (collected.has(name)) return;
    const source = path.join(repoRoot, "node_modules", name);
    if (!existsSync(source)) {
      throw new Error(`B667: не найден пакет ${name} — миграции не поедут`);
    }
    collected.add(name);
    const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) await visit(dependency);
  };
  for (const name of PRISMA_CLI_ROOTS) await visit(name);

  for (const name of collected) {
    await cp(path.join(repoRoot, "node_modules", name), path.join(standaloneRoot, "node_modules", name), {
      recursive: true,
      dereference: true,
    });
  }
  // `npx prisma …` ищет исполняемый файл в `node_modules/.bin`. Именно ссылка, а
  // не копия: CLI грузит свой `prisma_schema_build_bg.wasm` соседом по
  // `__dirname`, и копия в `.bin/` искала бы его в `.bin/`.
  const binDir = path.join(standaloneRoot, "node_modules", ".bin");
  await mkdir(binDir, { recursive: true });
  const binLink = path.join(binDir, "prisma");
  await rm(binLink, { force: true });
  await symlink(path.join("..", "prisma", "build", "index.js"), binLink);
  say(`CLI Prisma: ${[...collected].sort().join(", ")}`);
}

async function writeRuntimeManifest() {
  const appPkg = JSON.parse(await readFile(path.join(webDir, "package.json"), "utf8"));
  const manifest = {
    name: appPkg.name,
    version: appPkg.version,
    private: true,
    scripts: {
      start: "node ./standalone-start.cjs",
      worker: "node ./dist/worker.cjs",
      "worker:marketing": "node ./dist/marketing-worker.cjs",
    },
  };
  await writeFile(path.join(appOut, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of ["standalone-start.cjs", "standalone-start-args.cjs"]) {
    await cp(path.join(webDir, "scripts", file), path.join(appOut, file));
  }
  say("точки входа: start / worker / worker:marketing");
}

/**
 * Движок запросов у нас — wasm внутри сгенерированного клиента (драйвер-адаптер,
 * см. `src/lib/db.ts`): нативного query-engine нет вовсе. Node-путь грузит его
 * не файлом `.wasm`, а base64-модулем рядом, поэтому проверять «есть ли wasm»
 * по расширению — значит проверять не то. Проверяем строго: КАЖДЫЙ относительный
 * `require` сгенерированного клиента должен существовать в собранном дереве.
 */
async function verifyGeneratedClient() {
  const clientDir = path.join(repoRoot, "node_modules", ".prisma", "client");
  const clientOut = path.join(standaloneRoot, "node_modules", ".prisma", "client");
  const index = await readFile(path.join(clientDir, "index.js"), "utf8");
  const needed = new Set(
    [...index.matchAll(/require\(["'](\.\/[^"']+)["']\)/g)].map((match) => match[1]),
  );
  if (needed.size === 0) {
    throw new Error("B667: у сгенерированного клиента нет относительных require — разбор сломан");
  }
  for (const relative of needed) {
    const target = path.join(clientOut, relative);
    if (!existsSync(target)) {
      throw new Error(`B667: движок запросов не доехал — ${relative} нет в ${clientOut}`);
    }
  }
  say(`сгенерированный клиент: ${[...needed].join(", ")}`);
}

/**
 * Самое сильное доказательство — запуск. Клиент собирает запрос wasm-компилятором
 * ДО того, как адаптер пойдёт в базу, поэтому обращение к заведомо закрытому
 * порту обязано упасть на соединении. Любая другая ошибка (нет модуля, нет
 * движка) означает неполное дерево и валит сборку здесь, а не в проде.
 */
async function smokeGeneratedClient() {
  const probe = `
    const { PrismaClient } = require("@prisma/client");
    const { PrismaPg } = require("@prisma/adapter-pg");
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: "postgresql://b667:b667@127.0.0.1:1/b667" }),
    });
    db.user.count()
      .then(() => { console.error("B667: проба неожиданно достучалась до базы"); process.exit(3); })
      .catch((error) => {
        const text = String(error && (error.stack || error.message || error));
        const reachedDatabase = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|P1001|Can't reach database/i.test(text);
        if (!reachedDatabase) { console.error(text); process.exit(4); }
        process.exit(0);
      });
  `;
  const result = spawnSync(process.execPath, ["-e", probe], {
    cwd: appOut,
    timeout: 60_000,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });
  if (result.status !== 0) {
    throw new Error(
      `B667: клиент Prisma в собранном дереве не работает (код ${result.status}):\n${result.stderr}`,
    );
  }
  say("проба клиента Prisma: движок загрузился, запрос дошёл до соединения");
}

/**
 * Проверки целостности. Каждая соответствует процессу, который иначе умрёт уже
 * в проде: web, оба воркера, migrate.
 */
async function verify() {
  const required = [
    [path.join(appOut, "server.js"), "web: сервер standalone"],
    [path.join(appOut, ".next", "static"), "web: статика"],
    [path.join(appOut, "public"), "web: public"],
    [path.join(appOut, "src", "content", "legal-pack.md"), "web: юридический пакет"],
    [path.join(appOut, "dist", "worker.cjs"), "worker: бандл"],
    [path.join(appOut, "dist", "marketing-worker.cjs"), "marketing worker: бандл"],
    [path.join(appOut, "prisma", "schema.prisma"), "migrate: схема"],
    [path.join(appOut, "prisma", "migrations"), "migrate: миграции"],
    [path.join(appOut, "prisma.config.ts"), "migrate: конфигурация Prisma"],
    [path.join(standaloneRoot, "node_modules", "prisma", "build", "index.js"), "migrate: CLI"],
    [path.join(standaloneRoot, "node_modules", "dotenv"), "migrate: dotenv для prisma.config.ts"],
  ];
  for (const [target, what] of required) {
    if (!existsSync(target)) throw new Error(`B667: в дереве нет «${what}» — ${target}`);
  }

  // Единственный нативный бинарь дерева — schema-engine, и он нужен миграциям.
  const enginesDir = path.join(standaloneRoot, "node_modules", "@prisma", "engines");
  const engines = (await readdir(enginesDir)).filter((name) => name.startsWith("schema-engine"));
  if (engines.length === 0) throw new Error("B667: нет schema-engine — `migrate deploy` не пойдёт");

  await verifyGeneratedClient();
  await smokeGeneratedClient();
  say(`schema-engine: ${engines.join(", ")}`);
}

async function main() {
  if (!existsSync(path.join(appOut, "server.js"))) {
    throw new Error(
      "B667: нет .next/standalone — сборка Next прошла без `output: \"standalone\"`?",
    );
  }

  await cp(path.join(webDir, ".next", "static"), path.join(appOut, ".next", "static"), {
    recursive: true,
  });
  await cp(path.join(webDir, "public"), path.join(appOut, "public"), { recursive: true });
  say("статика и public на месте");

  await bundleWorkers();
  await traceIntoStandalone(
    WORKERS.map((worker) => path.join(appOut, worker.out)),
    "воркеры",
  );

  // Миграции: схема, миграции и конфигурация читаются CLI из рабочего каталога.
  await cp(path.join(webDir, "prisma"), path.join(appOut, "prisma"), { recursive: true });
  await cp(path.join(webDir, "prisma.config.ts"), path.join(appOut, "prisma.config.ts"));
  await copyPrismaCli();

  await writeRuntimeManifest();
  await verify();

  say(`дерево готово: ${await dirSizeMb(standaloneRoot)} МБ`);
}

await main();
