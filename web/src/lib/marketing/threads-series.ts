/**
 * B776 F3 / B777 — СЕРИЯ «ПАТТЕРН ДНЯ N/30»: ежедневный сериал гипотетических сцен и паттернов.
 *
 * B777 (2026-10-14): автор — сооснователь платформы и людей лично не
 * консультирует, поэтому «истории из работы с людьми» заменены гипотетическими
 * сценами («представим девушку, которая…») и паттернами. Серия выходит в
 * ПОЗДНЕМ ВЕЧЕРЕ (история на сон) — вечер отдан полезным форматам.
 *
 * Состояние — ключ `platform_settings` `marketing.threads.series`:
 * `{active, startDate:'YYYY-MM-DD' (МСК), days:30, title}`. Номер суток —
 * МСК-дни от `startDate` плюс один; после тридцатого серия кончается сама.
 * Здесь только чистая логика: чтение и запись ключа — в `threads-series-store.ts`.
 *
 * Голова поста — крючок + «Паттерн дня N/30» + «Подпишись, чтобы не пропустить»;
 * сама сцена лежит в продолжении (replyText, 1–3 части). Тема серии строго
 * психология: работа, жизнь, отношения, стресс, измена, тревога, семья, горе
 * расставаний — без диагнозов и без кризисных тем.
 */

import { NO_DUTY, TEXT_ONLY } from "@/lib/marketing/format-rules";
import type { PostFormat } from "@/lib/marketing/post-formats";
import { EXPERT_CHAIN_RULES, EXPERT_PERSONA_RULES } from "@/lib/marketing/threads-expert-rules";

export const SERIES_SETTING_KEY = "marketing.threads.series";
export const SERIES_TOTAL_DAYS = 30;
/** Серия занимает последний слот суток — поздний вечер (22:45 МСК). */
export function seriesSlotIndex(slotCount: number): number {
  return Math.max(0, slotCount - 1);
}

/** Прежнее название формата: строки реестра, заведённые до B777, несут его. */
export const LEGACY_SERIES_LABEL = "серия «День N/30»";

export interface SeriesConfig {
  active: boolean;
  startDate: string;
  days: number;
  title: string;
}

export interface SeriesDayInfo {
  day: number;
  total: number;
  isAnnouncement: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MSK_OFFSET_MS = 3 * 3_600_000;

function dateMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function parseSeriesConfig(raw: string | null | undefined): SeriesConfig | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SeriesConfig>;
    const days = Number(value.days);
    if (typeof value.active !== "boolean" || typeof value.startDate !== "string") return null;
    if (!DATE_RE.test(value.startDate) || Number.isNaN(dateMs(value.startDate))) return null;
    if (!Number.isInteger(days) || days < 1 || days > 365) return null;
    return { active: value.active, startDate: value.startDate, days, title: typeof value.title === "string" ? value.title : "" };
  } catch {
    return null;
  }
}

/** Сутки серии для МСК-даты плана; `null` — серии нет, она ещё не началась или уже кончилась. */
export function seriesDayFor(config: SeriesConfig | null, date: string): SeriesDayInfo | null {
  if (!config || !config.active || !DATE_RE.test(date)) return null;
  const day = Math.round((dateMs(date) - dateMs(config.startDate)) / DAY_MS) + 1;
  if (!Number.isFinite(day) || day < 1 || day > config.days) return null;
  return { day, total: config.days, isAnnouncement: day === 1 };
}

export function mskDateOf(now: Date): string {
  return new Date(now.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Старт: по умолчанию первые сутки — завтра по МСК (план строится «от завтра»);
 * `includeToday` — сегодня. Номер суток считается по МСК-дате от `startDate`, а не
 * по числу вышедших постов: сутки, где пост уже написан под прежний формат,
 * остаются пропущенным номером.
 */
export function startSeries(now: Date, includeToday = false): SeriesConfig {
  const first = new Date(now.getTime() + MSK_OFFSET_MS + (includeToday ? 0 : DAY_MS));
  return {
    active: true,
    startDate: first.toISOString().slice(0, 10),
    days: SERIES_TOTAL_DAYS,
    title: "Паттерн дня",
  };
}

export function stopSeries(config: SeriesConfig | null): SeriesConfig {
  return { ...(config ?? { startDate: "2000-01-01", days: SERIES_TOTAL_DAYS, title: "" }), active: false };
}

export const SERIES_FORMAT: PostFormat = {
  label: "серия «Паттерн дня N/30»",
  cluster: "K29",
  construction:
    "Голова: крючок + «Паттерн дня N/30» + «Подпишись, чтобы не пропустить» (до 480 знаков, без ссылки). "
    + "Сама сцена — в продолжении: гипотетический пример («представим девушку, которая…») или знакомый многим паттерн, 1–3 части.",
  contentClass: "story",
  weight: 0,
  media: "none",
  link: false,
  reply: "continuation",
  rules: [
    ...NO_DUTY,
    ...TEXT_ONLY,
    ...EXPERT_PERSONA_RULES,
    ...EXPERT_CHAIN_RULES,
    "Область серии — только психология: работа, жизнь, отношения, стресс, измена, тревога, семья, горе расставаний. Не медицинские диагнозы, не кризис и не самоповреждение; тема каждый день новая.",
  ],
  example:
    "Знакомый многим паттерн: всё сделано, а отдыхать стыдно. Паттерн дня 3/30. Подпишись, чтобы не пропустить",
};

/** Правила суток серии — уходят автору в задачу слота. */
export function seriesRules(info: SeriesDayInfo): string[] {
  const head = `Пост серии: Паттерн дня ${info.day}/${info.total}. Голова поста: крючок + «Паттерн дня ${info.day}/${info.total}» + «Подпишись, чтобы не пропустить», до 480 знаков, сцену в голове не рассказывай.`;
  const story = "Сцена в replyText (1–3 части до 480 знаков): гипотетический пример («представим…») или знакомый многим паттерн; не называй людей, места, даты, диагнозы и суммы; не говори «из практики», «ко мне пришла», что сцена реальная или выдуманная; не представляй eTerapy как источник результата. Выходит на ночь: тёплый тон, без тревоги на сон грядущий.";
  if (!info.isAnnouncement) return [head, story];
  return [
    head,
    `Сегодня День 1 — объявление. Голова: «Я буду каждый день рассказывать про один паттерн — ${info.total} дней, чтобы увидеть, зайдёт ли вам. Подпишись, чтобы не пропустить. Начну прямо сейчас. Паттерн дня 1/${info.total}», затем в replyText первая сцена.`,
    story,
  ];
}
