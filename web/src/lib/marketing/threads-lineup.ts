/**
 * B762 — СОСТАВ СУТОК THREADS: 8 ПОСТОВ БЕЗ «КОПИРКИ».
 *
 * До B762 формат каждого слота выбирался независимо (`formatFor(day, seq)`), а
 * знак оклика — один на сутки (`zodiacSignFor(day)`). При двух постах в сутки
 * это почти не было видно; при восьми одни и те же сутки получали два оклика
 * подряд с ОДНИМ знаком — «Раки, ало» дважды за вечер. Владелец 2026-10-12:
 * «"*знак* ало" не должен идти подряд — это выглядит как пост под копирку».
 *
 * Поэтому сутки собираются целиком, как ряд:
 *   • формат внутри суток не повторяется;
 *   • семья оклика знака (K1p, K1, K2) — не больше двух в сутки и никогда
 *     подряд, в том числе через полночь;
 *   • знак каждого оклика свой, по кругу из двенадцати;
 *   • герой ядра (Никита, Миша, Катя, Котлета) внутри суток не повторяется;
 *   • пара «кластер × приём» не повторяется за неделю.
 *
 * Выбор детерминированный: план пересобирается каждым заходом воркера, и
 * случайность сдвигала бы формат под уже созданной строкой.
 */

import { THREADS_FORMATS, ZODIAC_SIGNS, type PostFormat } from "@/lib/marketing/post-formats";
import { CORE_HEROES, TECHNIQUES, type Technique } from "@/lib/marketing/threads-clusters";
import { reorderByDaypart } from "@/lib/marketing/threads-daypart";
import { isCtaEligibleLabel } from "@/lib/marketing/threads-cta";
import { SERIES_FORMAT, seriesSlotIndex, type SeriesDayInfo } from "@/lib/marketing/threads-series";
import {
  dateOfDayNumber, THREADS_MAX_POSTS_PER_DAY, threadsPostsPerDay, threadsSlotRoles, type ThreadsRole,
} from "@/lib/marketing/threads-ladder";
import { usefulFormatForWeekday, weekdayOfDayNumber } from "@/lib/marketing/threads-useful-formats";

/**
 * Максимум слотов Threads в сутки (потолок лесенки B777). Число постов в
 * конкретные сутки — `threadsPostsPerDay(date)`: 4 до 31.10, с 1.11 по ступеням до 8.
 */
export const THREADS_SLOTS_PER_DAY = THREADS_MAX_POSTS_PER_DAY;

/** Сколько постов в сутки с номером `day` (по лесенке B777). */
export function threadsCountForDay(day: number): number {
  return threadsPostsPerDay(dateOfDayNumber(day));
}

/** Во сколько суток подряд призыв не повторяется: не больше одного в сутки, при 8 постах — двух. */
const MAX_CTA_PER_DAY = 1;
const MAX_CTA_PER_DAY_FULL = 2;
const MIN_CTA_GAP = 3;

/** Кластеры, пост которых начинается обращением к знаку зодиака. */
export const ZODIAC_FAMILY_CLUSTERS: ReadonlySet<string> = new Set(["K1p", "K1", "K2"]);
const MAX_ZODIAC_PER_DAY = 2;

export interface LineupEntry {
  format: PostFormat;
  /** Знак оклика — только у семьи оклика. */
  sign?: string;
  /** Номер героя «библии» для форматов с героями; у ядра внутри суток разный. */
  heroIndex?: number;
  /** Приём поста; у тестового плеча крепкой лексики его задаёт план. */
  technique?: Technique;
  /** B776: сутки серии «День N/30» — только у вечернего слота. */
  series?: SeriesDayInfo;
  /** B776: в этом слоте цепочка несёт призыв (не больше одного в сутки, при 8 постах — двух). */
  cta?: boolean;
  /** B777: место призыва для замера A/B — `mid` (перед закрывающей частью) или `end` (последней частью). */
  ctaPlace?: "mid" | "end";
}

export interface LineupOptions {
  /** Сутки серии для этой даты; без него серии в составе нет. */
  series?: SeriesDayInfo | null;
}

function mix(value: number): number {
  let x = (value | 0) ^ 0x5bd1e995;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

function textHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

const LANE: readonly PostFormat[] = THREADS_FORMATS.flatMap((format) =>
  Array.from({ length: format.weight }, () => format));

const isZodiac = (format: PostFormat | undefined) => Boolean(format && ZODIAC_FAMILY_CLUSTERS.has(format.cluster ?? ""));

/** Только форматы, без знаков, героев и приёмов: нужен соседним суткам для стыка. */
function dayFormats(day: number, previousLast: PostFormat | undefined): PostFormat[] {
  const slotCount = threadsCountForDay(day);
  const chosen: PostFormat[] = [];
  const used = new Set<string>();
  const fits = (format: PostFormat, strict: boolean) => {
    if (used.has(format.label)) return false;
    if (!strict) return true;
    const before = chosen.length > 0 ? chosen[chosen.length - 1] : previousLast;
    if (isZodiac(format) && isZodiac(before)) return false;
    if (isZodiac(format) && chosen.filter(isZodiac).length >= MAX_ZODIAC_PER_DAY) return false;
    if (format.heroes === "core" && chosen.filter((item) => item.heroes === "core").length >= CORE_HEROES.length) return false;
    return true;
  };
  for (const strict of [true, false]) {
    for (let draw = 0; chosen.length < slotCount && draw < LANE.length * 4; draw += 1) {
      const format = LANE[mix(day * 131 + draw) % LANE.length];
      if (!fits(format, strict)) continue;
      chosen.push(format);
      used.add(format.label);
    }
  }
  return chosen;
}

/**
 * Сутки подряд идут блоками по 16: на стыке блоков последний пост суток — не оклик
 * знака, а следующий блок начинается «с чистого листа». Внутри блока состав каждых
 * суток считается от НАСТОЯЩЕГО последнего поста вчерашних (а не от «голого»
 * ряда — тот расходился с настоящим, и на стыке суток вставали два оклика подряд).
 */
const BLOCK_DAYS = 16;
const realDayCache = new Map<number, PostFormat[]>();

const mod = (value: number, size: number) => ((value % size) + size) % size;
const zodiacConflict = (left: PostFormat | undefined, right: PostFormat) => isZodiac(left) && isZodiac(right);

function validOrder(order: readonly PostFormat[], previousLast: PostFormat | undefined, noZodiacLast: boolean): boolean {
  if (noZodiacLast && isZodiac(order[order.length - 1])) return false;
  return order.every((format, index) => !zodiacConflict(index === 0 ? previousLast : order[index - 1], format));
}

/** B776: перестановка по времени суток поверх выбранного состава; соседство окликов проверяется. */
function orderedDayFormats(day: number, previousLast: PostFormat | undefined, noZodiacLast: boolean): PostFormat[] {
  const natural = dayFormats(day, previousLast);
  const roles: ThreadsRole[] = threadsSlotRoles(natural.length).map((slot) => slot.role);
  const last = natural.length - 1;
  const forbiddenAt = (slot: number, format: PostFormat) => noZodiacLast && slot === last && isZodiac(format);
  const ordered = reorderByDaypart(natural, roles, previousLast, zodiacConflict, forbiddenAt);
  if (validOrder(ordered, previousLast, noZodiacLast)) return ordered;
  if (validOrder(natural, previousLast, noZodiacLast)) return natural;
  // Крайний случай: меняем последний пост с каждым из прочих, пока ряд не станет допустимым.
  for (let index = 0; index < last; index += 1) {
    const swapped = natural.map((format, at) => (at === index ? natural[last] : at === last ? natural[index] : format));
    if (validOrder(swapped, previousLast, noZodiacLast)) return swapped;
  }
  return natural;
}

function fullDayFormats(day: number): PostFormat[] {
  const cached = realDayCache.get(day);
  if (cached) return cached;
  let previousLast: PostFormat | undefined;
  for (let current = day - mod(day, BLOCK_DAYS); current <= day; current += 1) {
    let formats = realDayCache.get(current);
    if (!formats) {
      formats = orderedDayFormats(current, previousLast, mod(current + 1, BLOCK_DAYS) === 0);
      realDayCache.set(current, formats);
    }
    previousLast = formats[formats.length - 1];
  }
  return realDayCache.get(day)!;
}

/**
 * Приём слота. Индекс растёт на 3 в сутки (3 и 26 взаимно просты), поэтому у
 * одного кластера приём повторится не раньше, чем через 26 суток; второй пост
 * того же кластера в сутках сдвинут на 13 — совпадение возможно лишь через 13
 * суток, то есть за пределами недели.
 */
function techniqueFor(day: number, cluster: string, occurrence: number): Technique {
  const size = TECHNIQUES.length;
  const index = (day * 3 + (textHash(cluster) % size) + occurrence * 13) % size;
  return TECHNIQUES[(index + size) % size];
}

/**
 * Сутки, с которых знаки оклика идут сплошным кругом. Знак — по сквозному
 * номеру оклика от этих суток: шаг по номеру суток давал повтор, когда в
 * какие-то сутки окликов не было. Раньше эпохи — прежний шаг по суткам.
 */
const SIGN_EPOCH_DAY = 20_720;
const MAX_EPOCH_SPAN_DAYS = 3_650;
const zodiacBeforeCache = new Map<number, number>();

/**
 * B776/B777: серия занимает последний слот суток (поздний вечер), а в будни
 * главный вечерний слот (19:30) отдан полезному формату дня недели. Ни серия, ни
 * полезные форматы — не оклик знака, соседство окликов от замены не страдает.
 */
function withScheduledFormats(
  formats: readonly PostFormat[],
  day: number,
  series: SeriesDayInfo | null | undefined,
): PostFormat[] {
  const slots = threadsSlotRoles(formats.length);
  const useful = usefulFormatForWeekday(weekdayOfDayNumber(day));
  return formats.map((format, index) => {
    if (series && index === seriesSlotIndex(formats.length)) return SERIES_FORMAT;
    if (useful && slots[index]?.main) return useful;
    return format;
  });
}

/** Индексы слотов с призывом: первый подходящий формат; при восьми постах — второй не ближе MIN_CTA_GAP. */
function ctaIndexes(formats: readonly PostFormat[]): number[] {
  const eligible = formats.flatMap((format, index) => (isCtaEligibleLabel(format.label) ? [index] : []));
  const limit = formats.length >= THREADS_MAX_POSTS_PER_DAY ? MAX_CTA_PER_DAY_FULL : MAX_CTA_PER_DAY;
  const chosen: number[] = [];
  for (const index of eligible) {
    if (chosen.length >= limit) break;
    if (chosen.every((other) => Math.abs(other - index) >= MIN_CTA_GAP)) chosen.push(index);
  }
  return chosen;
}

function zodiacCountBefore(day: number): number | null {
  if (day < SIGN_EPOCH_DAY || day - SIGN_EPOCH_DAY > MAX_EPOCH_SPAN_DAYS) return null;
  let start = day;
  while (start > SIGN_EPOCH_DAY && !zodiacBeforeCache.has(start)) start -= 1;
  let count = zodiacBeforeCache.get(start) ?? 0;
  zodiacBeforeCache.set(start, count);
  for (let current = start; current < day; current += 1) {
    count += fullDayFormats(current).filter(isZodiac).length;
    zodiacBeforeCache.set(current + 1, count);
  }
  return count;
}

export function threadsDayLineup(day: number, options: LineupOptions = {}): LineupEntry[] {
  const formats = withScheduledFormats(fullDayFormats(day), day, options.series);
  const ctaAt = new Set(ctaIndexes(formats));
  // A/B места призыва: чётные сутки — перед закрывающей частью, нечётные — последней частью.
  const ctaPlace: "mid" | "end" = mod(day, 2) === 0 ? "mid" : "end";
  const before = zodiacCountBefore(day);
  let zodiacSeen = 0;
  const heroSeen = new Map<string, number>();
  const clusterSeen = new Map<string, number>();
  return formats.map((format, index) => {
    const cluster = format.cluster ?? format.label;
    const clusterOccurrence = clusterSeen.get(cluster) ?? 0;
    clusterSeen.set(cluster, clusterOccurrence + 1);
    const entry: LineupEntry = {
      format,
      technique: techniqueFor(day, cluster, clusterOccurrence),
      ...(format === SERIES_FORMAT && options.series ? { series: options.series } : {}),
      ...(ctaAt.has(index) ? { cta: true, ctaPlace } : {}),
    };
    if (isZodiac(format)) {
      // Сквозной номер оклика от эпохи: двенадцать окликов подряд — двенадцать
      // разных знаков, сколько бы окликов ни выпало на сутки.
      const position = before === null ? day * 5 + zodiacSeen * 6 : before + zodiacSeen;
      entry.sign = ZODIAC_SIGNS[((position % ZODIAC_SIGNS.length) + ZODIAC_SIGNS.length) % ZODIAC_SIGNS.length];
      zodiacSeen += 1;
    }
    if (format.heroes) {
      const seen = heroSeen.get(format.heroes) ?? 0;
      heroSeen.set(format.heroes, seen + 1);
      // Ядро — четыре героя; шаг суток 3 сдвигает «первого героя дня», а внутри
      // суток номера идут подряд и не совпадают, пока героев хватает.
      entry.heroIndex = format.heroes === "core"
        ? (day * 3 + seen) % CORE_HEROES.length
        : day * THREADS_SLOTS_PER_DAY + seen;
    }
    return entry;
  });
}
