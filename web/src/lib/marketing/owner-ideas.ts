/**
 * Идеи владельца для СОБСТВЕННЫХ постов: «идея: …» в канале.
 *
 * Одно сообщение — одна или много идей: каждый пункт нумерованного/маркированного
 * списка или абзац через пустую строку — отдельная идея. Каждая становится
 * черновиком поста со сроком «как можно раньше», поэтому обгоняет плановые
 * материалы (см. `ownerIdeaFilter` в agent.ts). Пост по-прежнему проходит
 * автора, независимого редактора и премодерацию владельца — второго пути
 * наружу нет.
 */

import { createHash } from "node:crypto";

import db from "@/lib/db";
import { moscowDateKey } from "@/lib/marketing/engagement-plan";

export const OWNER_IDEA_SOURCE = "OWNER_IDEA";
export const OWNER_IDEA_PLATFORM = "threads";
const MAX_IDEAS_PER_MESSAGE = 10;
const MAX_IDEAS_PER_DAY = 15;
const MIN_IDEA_LENGTH = 15;
const FIRST_SLOT_DELAY_MS = 8 * 60_000;
const SLOT_STEP_MS = 25 * 60_000;
/** Московское окно, в котором читатель Threads онлайн; вне него — ближайшее утро. */
const WINDOW_START_MINUTE = 10 * 60;
const WINDOW_END_MINUTE = 23 * 60;

/**
 * B761: команда — слово в начале сообщения с любым регистром и с двоеточием/
 * тире ИЛИ без них («идея <url>»). Граница слова — по буквам Unicode: `\b` с
 * кириллицей не работает, а «идеальный»/«комментировать» командой быть не должны.
 */
const COMMAND = /^\s*(идея|идеи|комментарий|коммент)(?![\p{L}\p{N}])\s*[:：\-–—]?\s*/iu;
const ITEM_START = /^\s*(?:\d{1,2}[.)]|[-•*])\s+/;

export interface OwnerCommand {
  kind: "idea" | "comment";
  items: string[];
}

/** Комментарий — одно задание на сообщение: пост-образец и пожелания идут вместе. */
const MIN_COMMENT_LENGTH = 10;

/** Чистый разбор команды «идея»/«комментарий»; `null` — сообщение не команда. */
export function parseOwnerCommand(text: string): OwnerCommand | null {
  const match = COMMAND.exec(text);
  if (!match) return null;
  const isComment = match[1].toLowerCase().startsWith("коммент");
  if (isComment) {
    const body = text.slice(match[0].length).replace(/\s+/g, " ").trim();
    // Без разделителя («комментарий по отчёту…») это реплика оркестратору, а не
    // команда: без двоеточия нужна ссылка на пост.
    const hasSeparator = /[:：\-–—]/.test(match[0]);
    if (!hasSeparator && !/https?:\/\//i.test(body)) return null;
    return body.length >= MIN_COMMENT_LENGTH ? { kind: "comment", items: [body] } : null;
  }
  const rest = text.slice(match[0].length);
  // Без разделителя («идея хорошая, но…») это реплика, а не команда: нужна ссылка на пост.
  if (!/[:：\-–—]/.test(match[0]) && !/https?:\/\//i.test(rest)) return null;
  const ideas = splitIdeas(rest);
  return ideas ? { kind: "idea", items: ideas } : null;
}

/** Чистый разбор: `null` — сообщение не про идеи. */
export function parseOwnerIdeas(text: string): string[] | null {
  const command = parseOwnerCommand(text);
  return command?.kind === "idea" ? command.items : null;
}

function splitIdeas(raw: string): string[] | null {
  const body = raw.trim();
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const joined = current.join(" ").replace(/\s+/g, " ").trim();
    if (joined) blocks.push(joined);
    current = [];
  };
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
    } else if (ITEM_START.test(line)) {
      flush();
      current.push(line.replace(ITEM_START, ""));
    } else {
      current.push(line.trim());
    }
  }
  flush();
  const ideas = blocks.filter((item) => item.length >= MIN_IDEA_LENGTH).slice(0, MAX_IDEAS_PER_MESSAGE);
  return ideas.length > 0 ? ideas : null;
}

/** Время выхода идеи по счёту `index`: не раньше окна и не пачкой. */
export function ownerIdeaSlot(now: Date, index: number): Date {
  const base = new Date(now.getTime() + FIRST_SLOT_DELAY_MS + index * SLOT_STEP_MS);
  const dayKey = moscowDateKey(base);
  const midnight = new Date(`${dayKey}T00:00:00.000+03:00`).getTime();
  const minute = Math.floor((base.getTime() - midnight) / 60_000);
  if (minute >= WINDOW_START_MINUTE && minute <= WINDOW_END_MINUTE) return base;
  const dayMs = 24 * 3_600_000;
  const nextMidnight = minute < WINDOW_START_MINUTE ? midnight : midnight + dayMs;
  return new Date(nextMidnight + (WINDOW_START_MINUTE + index * 25) * 60_000);
}

function ideaKey(idea: string): string {
  return `owner-idea-${createHash("sha256").update(idea.toLowerCase()).digest("hex").slice(0, 24)}`;
}

export interface OwnerIdeasOutcome {
  queued: Array<{ idea: string; scheduledFor: Date }>;
  duplicates: number;
  overLimit: number;
}

export async function queueOwnerIdeas(ideas: readonly string[], now: Date): Promise<OwnerIdeasOutcome> {
  const dayStart = new Date(`${moscowDateKey(now)}T00:00:00.000+03:00`);
  const today = await db.externalPublication.count({
    where: { source: OWNER_IDEA_SOURCE, createdAt: { gte: dayStart } },
  });
  const room = Math.max(0, MAX_IDEAS_PER_DAY - today);
  const queued: OwnerIdeasOutcome["queued"] = [];
  let duplicates = 0;
  for (const idea of ideas.slice(0, room)) {
    const key = ideaKey(idea);
    if (await db.externalPublication.findUnique({ where: { key }, select: { id: true } })) {
      duplicates += 1;
      continue;
    }
    const scheduledFor = ownerIdeaSlot(now, queued.length);
    const topic = idea.slice(0, 80);
    await db.externalPublication.create({
      data: {
        key,
        platform: OWNER_IDEA_PLATFORM,
        title: `Идея владельца: ${topic}`,
        contentType: "POST",
        status: "DRAFT",
        cluster: topic,
        targetQuery: topic,
        body: null,
        source: OWNER_IDEA_SOURCE,
        engagementExcerpt: idea.slice(0, 1000),
        // Автор видит задание владельца целиком; образец, если он приложен,
        // служит ПРИМЕРОМ приёма, а не текстом для пересказа.
        notes: JSON.stringify({
          editorialAngle: `Идея владельца: ${idea.slice(0, 900)}. Если в идее есть образец чужого поста — разбери, чем он цепляет `
            + "(хук, структура, длина, регистр) и напиши НОВЫЙ оригинальный пост про ту же механику; не копируй формулировки и не упоминай источник.",
          ownerIdea: true,
        }),
        scheduledFor,
        autoPublish: false,
      },
    });
    queued.push({ idea, scheduledFor });
  }
  return { queued, duplicates, overLimit: Math.max(0, ideas.length - room) };
}

function moscowClock(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
  }).format(value);
}

export function describeOwnerIdeas(outcome: OwnerIdeasOutcome): string {
  const lines = outcome.queued.map((item, i) => `${i + 1}) ${item.idea.slice(0, 70)} — слот ${moscowClock(item.scheduledFor)} МСК`);
  return [
    outcome.queued.length > 0
      ? `Принял идей: ${outcome.queued.length}. Они впереди плановых постов; черновик придёт на одобрение сюда же.`
      : "Новых идей не принял.",
    ...lines,
    outcome.duplicates > 0 ? `Повторов (уже в очереди): ${outcome.duplicates}.` : "",
    outcome.overLimit > 0 ? `Не влезло в суточный предел ${MAX_IDEAS_PER_DAY}: ${outcome.overLimit} — пришлите завтра.` : "",
  ].filter(Boolean).join("\n");
}
