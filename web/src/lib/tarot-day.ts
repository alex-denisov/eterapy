/**
 * B678 — «Карта дня» Таро.
 *
 * ТРИ РЕШЕНИЯ, КОТОРЫЕ ОПРЕДЕЛИЛИ УСТРОЙСТВО МОДУЛЯ.
 *
 * 1. ЧАСОВОЙ ПОЯС — МСК ДЛЯ ВСЕХ (решение владельца 2026-08-05). Дата карты
 *    считается по Москве, а не по UTC и не по зоне человека: домашний регион
 *    пользователя — открытый контур B546, а до него единая зона честнее, чем
 *    молчаливый UTC (в UTC «сегодня» наступало бы в 03:00 МСК). Зона названа
 *    вслух в интерфейсе, чтобы Владивосток видел причину, а не сбой.
 *
 * 2. ЛИНИЯ УВЕДОМЛЕНИЙ — СЛУЖЕБНАЯ (решение владельца 2026-08-05). Утренняя
 *    рассылка идёт событием `DAILY_CARD`, у которого УЖЕ есть переключатель в
 *    кабинете (`notification-events.ts`). Служебная линия уходит без
 *    рекламного согласия, но остаётся выключаемой — см.
 *    `project_notifications_two_lines`. Гейты `marketing/gates.ts` сюда не
 *    применяются вовсе.
 *
 * 3. ТРАКТОВКА КЭШИРУЕТСЯ ПО КАРТЕ, А НЕ ПО ЧЕЛОВЕКУ. Карта выпадает
 *    персонально (детерминированно по `userId` и дате), но текст трактовки
 *    «Шут в прямом положении как карта дня» одинаков для всех. Значит вариантов
 *    ровно 156 (78 карт × 2 положения), и каждый генерируется моделью ОДИН раз
 *    за всё время, а дальше читается из `platform_settings`. Персональная
 *    генерация стоила бы один вызов модели на пользователя в сутки и держала бы
 *    первый экран кабинета в ожидании ответа модели.
 *
 * Картинку не рисуем заново: 78 оригинальных сканов Райдера—Уэйта—Смит 1909
 * года (общественное достояние) уже лежат в `public/tarot` с B437 и уже
 * работают в платном «Раскладе Таро».
 */
import crypto from "node:crypto";
import { TAROT_DECK, type TarotDeckCard } from "@/lib/tarot-deck";
import { MSK_OFFSET_MS } from "@/lib/msk-time";

export interface TarotDayPick {
  card: TarotDeckCard;
  reversed: boolean;
  /** Ключ картинки и кэша трактовки: `major-00-up`, `minor-К-3-rev`. */
  key: string;
  /** Сутки карты по МСК, `YYYY-MM-DD` (см. `tarotDayKey` — рубеж в 7:00/9:00). */
  dayKey: string;
}

export interface TarotDayInterpretation {
  /** Короткий заголовок дня (2–5 слов). */
  headline: string;
  /** Трактовка карты как карты дня, 2–3 предложения. */
  body: string;
  /** На что обратить внимание сегодня, одно предложение. */
  focus: string;
  /** Один вопрос себе. */
  question: string;
}

export const TAROT_DAY_INTERPRETATION_VERSION = "v1";

/**
 * Календарная дата по МСК в виде `YYYY-MM-DD`.
 *
 * Служебная величина: по ней считается, какой сегодня день недели и наступил ли
 * рубеж смены карты. Сама карта живёт по `tarotDayKey`, а не по календарю.
 */
export function mskDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** День недели по МСК: 0 — воскресенье, 6 — суббота. */
export function mskWeekday(now: Date = new Date()): number {
  return new Date(now.getTime() + MSK_OFFSET_MS).getUTCDay();
}

/**
 * Час утренней рассылки по МСК: 7:00 в будни, 9:00 в выходные — дословно из
 * задачи владельца.
 */
export function tarotDayDueHourMsk(now: Date = new Date()): 7 | 9 {
  const weekday = mskWeekday(now);
  return weekday === 0 || weekday === 6 ? 9 : 7;
}

/**
 * B684 — СУТКИ КАРТЫ. Начинаются в час из расписания владельца (07:00 МСК в
 * будни, 09:00 МСК в выходные) и длятся до следующего такого часа.
 *
 * ПОЧЕМУ НЕ КАЛЕНДАРНАЯ ДАТА. Раньше карта выбиралась по `mskDayKey`, то есть
 * менялась в полночь, а рассылка уходила в 7:00. Между 00:00 и 07:00 человек
 * видел в кабинете уже завтрашнюю карту, про которую ему ещё не написали, а
 * утреннее сообщение приходило про карту, которую он успел посмотреть ночью.
 * Расписание относится к СМЕНЕ карты, поэтому рубеж один и тот же для экрана,
 * мини-аппа и бота — иначе они снова разъедутся.
 *
 * Сдвиг «на сутки назад» берётся от МСК-полуночи, а не вычитанием 24 часов из
 * текущего момента: у МСК нет перевода часов, но так результат не зависит от
 * времени внутри суток и остаётся чистой календарной арифметикой.
 */
export function tarotDayKey(now: Date = new Date()): string {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  if (msk.getUTCHours() >= tarotDayDueHourMsk(now)) return msk.toISOString().slice(0, 10);
  const previous = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() - 1);
  return new Date(previous).toISOString().slice(0, 10);
}

function orientationSuffix(reversed: boolean) {
  return reversed ? "rev" : "up";
}

/**
 * Карта человека на день. Детерминированно по паре (человек, МСК-дата): один и
 * тот же ответ на любом узле флота и при любом числе перезапросов — тот же
 * приём, что у `cardIndex` в `daily-card.ts` и у `tarot-birth-code.ts`.
 *
 * Положение карты — честные 50/50, как в настоящем раскладе: перевёрнутые
 * значения у колоды прописаны и не мягче прямых.
 */
export function tarotDayPick(userId: string, now: Date = new Date()): TarotDayPick {
  const dayKey = tarotDayKey(now);
  const digest = crypto.createHash("sha256").update(`tarot-day:${userId}:${dayKey}`).digest();
  const index = digest.readUInt32BE(0) % TAROT_DECK.length;
  const card = TAROT_DECK[index];
  const reversed = (digest[4] & 1) === 1;
  return { card, reversed, key: `${card.code}-${orientationSuffix(reversed)}`, dayKey };
}

// Имена файлов такие, какими их скачал `scripts/fetch-tarot-rws.py`: пентакли
// лежат как `pents-NN.jpg`, а не `pentacles-NN.jpg`. Разойтись с этим списком
// значит получить 404 на картинке при зелёной сборке — прогон B678 проверяет
// каждый из 78 путей на существование файла.
const TAROT_MINOR_SUIT_FOLDER: Record<string, string> = {
  Ж: "wands",
  К: "cups",
  М: "swords",
  П: "pents",
};

/**
 * Путь к оригинальному скану карты в `public/tarot`. Та же схема имён, что у
 * `esoteric-chart-visuals.tsx` (старшие — `major-NN.jpg`, младшие —
 * `<масть>-NN.jpg`); держим её здесь отдельно, потому что тот модуль
 * клиентский и тянуть его в серверный путь картинки незачем.
 */
export function tarotCardArtworkPath(card: TarotDeckCard): string {
  if (card.arcana === "major") return `/tarot/${card.code}.jpg`;
  const parts = card.code.split("-");
  const suit = TAROT_MINOR_SUIT_FOLDER[parts[1] ?? ""] ?? "wands";
  const num = String(Number(parts[2]) || 1).padStart(2, "0");
  return `/tarot/${suit}-${num}.jpg`;
}

/** Разбирает ключ картинки обратно в карту и положение. Ключ приходит из URL. */
export function tarotDayPickFromKey(key: string): { card: TarotDeckCard; reversed: boolean } | null {
  const match = key.trim().match(/^(.+)-(up|rev)$/);
  if (!match) return null;
  const card = TAROT_DECK.find((item) => item.code === match[1]);
  if (!card) return null;
  return { card, reversed: match[2] === "rev" };
}

export function tarotDayOrientationLabel(reversed: boolean): string {
  return reversed ? "перевёрнутое положение" : "прямое положение";
}

/**
 * Детерминированная трактовка — ответ по умолчанию и страховка.
 *
 * Возвращается, когда модель недоступна ИЛИ когда её ответ ещё не
 * сгенерирован: карта дня не имеет права быть пустой, а короткие значения
 * колоды сами по себе осмысленны. Тон совпадает с платным «Раскладом Таро»:
 * без фатальных прогнозов и обещаний.
 */
export function fallbackTarotDayInterpretation(pick: TarotDayPick): TarotDayInterpretation {
  const meaning = pick.reversed ? pick.card.reversedMeaning : pick.card.upright;
  const short = meaning.split(";")[0];
  return {
    headline: pick.card.name,
    body: pick.reversed
      ? `Сегодня «${pick.card.name}» выпала в перевёрнутом положении: ${meaning}. Это не приговор дню, а подсказка, где сейчас уходит больше сил, чем нужно.`
      : `Сегодня «${pick.card.name}» выпала в прямом положении: ${meaning}. Карта описывает не событие, а настроение дня — то, что стоит заметить в себе.`,
    focus: `Обратите внимание на то, где сегодня проявляется ${short}.`,
    question: "Что в сегодняшнем дне откликается на этот образ?",
  };
}

export function parseTarotDayInterpretation(value: unknown): TarotDayInterpretation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const headline = typeof raw.headline === "string" ? raw.headline.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const focus = typeof raw.focus === "string" ? raw.focus.trim() : "";
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  if (!headline || !body || !focus || !question) return null;
  return {
    headline: headline.slice(0, 60),
    body: body.slice(0, 600),
    focus: focus.slice(0, 240),
    question: question.slice(0, 200),
  };
}
