#!/usr/bin/env node
/**
 * Сторож непрерывности заходов — `task-lifecycle.md` §6b.
 *
 * ПОЧЕМУ ЭТО СКРИПТ, А НЕ ПУНКТ В ИНСТРУКЦИИ. Правило «запиши состояние в
 * тикет» существовало и раньше, в §6, и всё равно нарушалось: тикет открытой
 * задачи мог месяцами не говорить, где остановились. Инструкция, соблюдение
 * которой нечем проверить, соблюдается ровно до первого длинного захода.
 *
 * ПОЧЕМУ НЕ ПРОГОН JEST. `docs/` не в репозитории (`.gitignore:111`), поэтому
 * в CI этих файлов нет вовсе. Сторож живёт в `scripts/` (каталог отслеживается)
 * и молча выходит с нулём, когда доски рядом нет: в CI ему проверять нечего, а
 * падать на её отсутствии значило бы валить каждую сборку.
 *
 * Запуск:  node scripts/check-task-board.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const TASKS = path.join(ROOT, "docs/v5-release/tasks");
const BOARD = path.join(TASKS, "BOARD.md");
const TICKETS = path.join(TASKS, "tickets");

if (!existsSync(BOARD) || !existsSync(TICKETS)) {
  console.log("check-task-board: доски рядом нет (docs/ вне репозитория) — пропускаем");
  process.exit(0);
}

const board = readFileSync(BOARD, "utf8");
const problems = [];

/**
 * Строка ТАБЛИЦЫ в разделах 1–3 — это заявка «работа открыта». Ссылки внутри
 * прозы и внутри чужих строк (что закрыло вопрос, где разбор) состояния не
 * требуют: они историческая справка, а не незавершённая работа.
 */
const openSection = board.split("## 4. Открытые инциденты")[0];
const openTickets = [...openSection.matchAll(/^\|\s*\[[^\]]+\]\(\.\/tickets\/(B\d+[^)]*\.md)\)\s*\|/gm)]
  .map((match) => match[1]);
const uniqueReferenced = [...new Set(openTickets)];

for (const file of uniqueReferenced) {
  const full = path.join(TICKETS, file);
  if (!existsSync(full)) {
    problems.push(`${file}: доска ссылается на несуществующий тикет`);
    continue;
  }
  const text = readFileSync(full, "utf8");

  // 1. Открытый тикет обязан говорить, где остановились и что делать дальше.
  const state = text.match(/^##\s+Состояние\s*\(обновлено\s+(\d{4}-\d{2}-\d{2})\)/m);
  if (!state) {
    problems.push(`${file}: нет блока «## Состояние (обновлено YYYY-MM-DD)» (§6b)`);
  } else {
    for (const required of ["Сделано и подтверждено", "Следующее действие"]) {
      if (!text.includes(required)) {
        problems.push(`${file}: в блоке «Состояние» нет строки «${required}»`);
      }
    }
  }

  // 2. Закрытый тикет не имеет права держать строку на доске (§6a). Статус
  // пишут двумя способами — во frontmatter и списком в шапке; ловим оба.
  const status = text.match(/^status:\s*(\S+)/m)?.[1]
    ?? text.match(/^-\s+\*\*Тип:.*?\*\*Статус:\*\*\s*([^\n·]+)/m)?.[1];
  if (status && /\b(done|closed|сделано|закрыт)/i.test(status)) {
    problems.push(`${file}: статус «${status.trim()}», но строка осталась на доске (§6a)`);
  }
}

if (problems.length === 0) {
  console.log(`check-task-board: ${uniqueReferenced.length} открытых тикетов — все с актуальным состоянием`);
  process.exit(0);
}

console.error("check-task-board: доска и тикеты разошлись\n");
for (const problem of problems) console.error(`  · ${problem}`);
console.error(`\n${problems.length} замечаний. Правила — docs/agents/task-lifecycle.md §6a/§6b.`);
process.exit(1);
