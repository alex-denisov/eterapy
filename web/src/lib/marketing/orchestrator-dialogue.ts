/**
 * B750 — диалог владельца с оркестратором в том же канале, куда идут отчёты.
 *
 * Действуют ТОЛЬКО типизированные намерения ниже. Всё остальное — заметка:
 * данные для оркестратора, а не команда. Текст владельца никогда не
 * исполняется и не попадает в SQL/код.
 */
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { moderationChatIds } from "@/lib/ops-notification-channel";
import { sendTelegram } from "@/lib/telegram";
import {
  BACKLINK_STATUS_KEY,
  parseBacklinkStatus,
  withBacklinkStatus,
  type BacklinkStepStatus,
} from "@/lib/seo/backlink-targets";

export const ORCHESTRATOR_HOLD_KEY = "marketing.orchestrator.hold";
export const ORCHESTRATOR_NOTES_KEY = "marketing.orchestrator.owner_notes";
export const ORCHESTRATOR_REPORT_NOW_KEY = "marketing.orchestrator.report_now";
const MAX_NOTES = 30;
const MAX_NOTE_LENGTH = 300;
const MAX_PAGE_LIST = 20;
export const RETIRE_APPROVED_KEY = "seo.retire_approved";
export const RESTORE_REQUESTED_KEY = "seo.restore_requested";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,120}$/;
const OWNER_CHAT_TYPES = new Set(["group", "supergroup", "channel"]);
/** Команды — короткие фразы; длинный текст со словом «отчёт» — это факт, а не команда. */
const MAX_COMMAND_LENGTH = 60;

export type OwnerIntent =
  | { kind: "backlink_done"; targetIds: string[]; status: BacklinkStepStatus; note: string }
  | { kind: "hold" }
  | { kind: "resume" }
  | { kind: "report_now" }
  | { kind: "retire_page"; slug: string }
  | { kind: "restore_page"; slug: string }
  | { kind: "note"; text: string };

// \b не работает с кириллицей — границы через lookbehind по \p{L}.
const L = "(?<![\\p{L}\\p{N}])";
const re = (src: string) => new RegExp(src, "iu");

const TARGET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["yandex-business", re(`${L}(?:яндекс|yandex)[\\s.\\-]*(?:бизнес|business|справочник|sprav)`)],
  ["google-business", re(`${L}(?:(?:гугл|google)[\\s.\\-]*(?:бизнес|business|мой бизнес|my business)|gbp)`)],
];

const PENDING_RE = re(`(?:${L}(?:ещё|еще|пока)\\s+не|не\\s+(?:созда|готов|сделан|наполн|заполн|заведен))`);
const SKIPPED_RE = re(`(?:не\\s+нуж(?:ен|на|но|ны)|не\\s+надо|не\\s+будем|${L}пропуст|${L}отказ|${L}отмен)`);
const DONE_RE = re(`${L}(?:созда|готов|сделан|наполнен|заполнен|заведен|оформлен|есть|подтвержден|подтверждён)`);

const RESUME_RE = re(`^(?:${L}(?:продолжай|продолжить|возобнов|сними\\s+паузу|снять\\s+паузу|работай))`);
const HOLD_RE = re(`^(?:стоп|${L}пауза|${L}приостанов|${L}заморозь|не\\s+вноси\\s+правки|не\\s+меняй\\s+ничего)`);
const REPORT_RE = re(`(?:${L}отч[её]т|что\\s+нов)`);

const RETIRE_RE = re(`^(?:сними|убери|снять|убрать)\\s+страниц\\S*\\s+(\\S+)\\s*$`);
const RESTORE_RE = re(`^(?:верни|вернуть|восстанови)\\s+страниц\\S*\\s+(\\S+)\\s*$`);
const SECRET_RE = /(?:парол\p{L}*|password|passwd)[^\n.;]*|(?:токен|token|ключ|secret)\s*[:=\-]?\s*\S+|[A-Za-z0-9+/_-]{24,}={0,2}/giu;

export function scrubSecrets(text: string): string {
  return text.replace(SECRET_RE, "[скрыто]");
}

function pageSlug(raw: string): string | null {
  let candidate = raw.trim().replace(/[.,;!?»«"']+$/g, "");
  const m = /^https?:\/\/[^/\s]+\/library\/([^/?#\s]+)/i.exec(candidate);
  if (m) candidate = m[1];
  candidate = candidate.toLowerCase();
  return SLUG_RE.test(candidate) ? candidate : null;
}

export function interpretOwnerMessage(rawText: string): OwnerIntent {
  const text = (rawText ?? "").trim();
  const lower = text.toLowerCase();

  const retire = RETIRE_RE.exec(text);
  const restore = RESTORE_RE.exec(text);
  const pageMatch = retire ?? restore;
  const slug = pageMatch ? pageSlug(pageMatch[1]) : null;
  if (slug) return { kind: retire ? "retire_page" : "restore_page", slug };

  const targetIds = TARGET_PATTERNS.filter(([, pattern]) => pattern.test(lower)).map(([id]) => id);
  if (targetIds.length > 0) {
    const status: BacklinkStepStatus = PENDING_RE.test(lower)
      ? "pending"
      : SKIPPED_RE.test(lower)
        ? "skipped"
        : DONE_RE.test(lower) ? "done" : "pending";
    // Без явного слова о состоянии это вопрос или факт, а не отметка.
    const explicit = PENDING_RE.test(lower) || SKIPPED_RE.test(lower) || DONE_RE.test(lower);
    if (explicit) {
      return { kind: "backlink_done", targetIds, status, note: scrubSecrets(text).slice(0, 300) };
    }
  }

  if (text.length <= MAX_COMMAND_LENGTH) {
    if (RESUME_RE.test(lower)) return { kind: "resume" };
    if (HOLD_RE.test(lower)) return { kind: "hold" };
    if (REPORT_RE.test(lower)) return { kind: "report_now" };
  }
  return { kind: "note", text: scrubSecrets(text).slice(0, MAX_NOTE_LENGTH) };
}

async function readSetting(key: string): Promise<string | null> {
  const row = await db.platformSetting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

interface OwnerNote { at: string; text: string }

function parseNotes(raw: string | null): OwnerNote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n): n is OwnerNote => !!n && typeof n.at === "string" && typeof n.text === "string",
    );
  } catch {
    return [];
  }
}

async function readList(key: string): Promise<string[]> {
  try {
    const parsed = JSON.parse((await readSetting(key)) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function appendNote(text: string, now: Date): Promise<OwnerNote[]> {
  const notes = [...parseNotes(await readSetting(ORCHESTRATOR_NOTES_KEY)), { at: now.toISOString(), text }]
    .slice(-MAX_NOTES);
  await writeSetting(ORCHESTRATOR_NOTES_KEY, JSON.stringify(notes));
  return notes;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TARGET_TITLES: Record<string, string> = { "yandex-business": "Яндекс Бизнес", "google-business": "Google Business" };

async function applyIntent(intent: OwnerIntent, now: Date): Promise<string> {
  switch (intent.kind) {
    case "backlink_done": {
      let map = parseBacklinkStatus(await readSetting(BACKLINK_STATUS_KEY));
      for (const id of intent.targetIds) {
        map = withBacklinkStatus(map, id, intent.status, intent.note, now);
      }
      await writeSetting(BACKLINK_STATUS_KEY, JSON.stringify(map));
      const names = intent.targetIds.map((id) => TARGET_TITLES[id] ?? id).join(" и ");
      if (intent.status === "done") return `Принял: ${names} — отмечены как сделанные. Больше не прошу.`;
      if (intent.status === "skipped") return `Принял: ${names} — снято, больше не прошу.`;
      return `Принял: ${names} — отмечены как не сделанные, продолжу напоминать.`;
    }
    case "hold":
      await writeSetting(ORCHESTRATOR_HOLD_KEY, "true");
      return "Принял: правки на удержании, диагноз собираю, ничего не меняю. «Продолжай» — снять.";
    case "resume":
      await writeSetting(ORCHESTRATOR_HOLD_KEY, "false");
      return "Принял: удержание снято, правки возобновлены.";
    case "report_now":
      await writeSetting(ORCHESTRATOR_REPORT_NOW_KEY, "true");
      return "Принял: внеочередной отчёт соберу на ближайшем шаге.";
    case "note": {
      await appendNote(intent.text, now);
      return "Принял к сведению: записал, учту в следующем отчёте.";
    }
    case "retire_page": {
      const list = [...new Set([...(await readList(RETIRE_APPROVED_KEY)), intent.slug])].slice(-MAX_PAGE_LIST);
      await writeSetting(RETIRE_APPROVED_KEY, JSON.stringify(list));
      return `Принял: страница ${intent.slug} будет снята и отдаст редирект на /library; верну командой «верни страницу ${intent.slug}»`;
    }
    case "restore_page": {
      const approved = (await readList(RETIRE_APPROVED_KEY)).filter((x) => x !== intent.slug);
      await writeSetting(RETIRE_APPROVED_KEY, JSON.stringify(approved));
      const requested = [...new Set([...(await readList(RESTORE_REQUESTED_KEY)), intent.slug])].slice(-MAX_PAGE_LIST);
      await writeSetting(RESTORE_REQUESTED_KEY, JSON.stringify(requested));
      return `Принял: страница ${intent.slug} снята со списка на снятие, возврат записан.`;
    }
  }
}

export interface OwnerMessageInput {
  text: string;
  chatId: string;
  now: Date;
  messageId?: number | null;
  fromBot?: boolean;
  /** Тип чата Telegram. Личные чаты и неизвестный тип диалог не перехватывает. */
  chatType?: string;
}

export interface OwnerMessageResult { handled: boolean; intent?: OwnerIntent["kind"] }

/** Никогда не бросает. handled=false — сообщение не наше, webhook продолжает как обычно. */
export async function handleOwnerMessage(input: OwnerMessageInput): Promise<OwnerMessageResult> {
  try {
    if (input.fromBot || !input.text?.trim()) return { handled: false };
    // Команды (/start <token>, /stop, /status) и личные чаты — не наши.
    if (input.text.trimStart().startsWith("/")) return { handled: false };
    if (!input.chatType || !OWNER_CHAT_TYPES.has(input.chatType)) return { handled: false };
    const allowed = await moderationChatIds();
    if (!allowed.includes(String(input.chatId))) return { handled: false };
  } catch (error) {
    log.error("orchestrator.dialogue_auth_failed", { error: serializeError(error) });
    return { handled: false };
  }

  const intent = interpretOwnerMessage(input.text);
  let reply: string;
  try {
    reply = await applyIntent(intent, input.now);
  } catch (error) {
    log.error("orchestrator.dialogue_apply_failed", { intent: intent.kind, error: serializeError(error) });
    reply = "Не смог записать это — попробуйте ещё раз чуть позже.";
  }

  // Побочное действие — вне try основной операции.
  try {
    await sendTelegram(input.chatId, escapeHtml(reply), input.messageId ? { replyToMessageId: input.messageId } : undefined);
  } catch (error) {
    log.warn("orchestrator.dialogue_reply_failed", { error: serializeError(error) });
  }
  return { handled: true, intent: intent.kind };
}
