/**
 * B777 — РАСПИСАНИЕ THREADS: 4 ПОСТА В СУТКИ ДО 31.10, ПОТОМ ЛЕСЕНКА 5→6→7→8.
 *
 * Решение владельца 2026-10-14: утро, обед, вечер, поздний вечер; с 1 ноября
 * плавно до восьми. Слоты вкладываются друг в друга: следующая ступень только
 * ДОБАВЛЯЕТ время, прежние не двигает. Поэтому у каждого времени сетки есть
 * `minCount` — с какого числа постов в сутки оно включается.
 *
 * Роль слота задаётся ВРЕМЕНЕМ СУТОК, а не номером: утро — пожелания и сильные
 * полезные, день — лёгкое, вечер — главное (полезные форматы, обсуждение),
 * поздний вечер — истории и серия. Номер слота меняется со ступенью лесенки,
 * время суток — нет.
 *
 * Модуль чистый и без зависимостей: его читают и окна публикации, и состав суток.
 */

export type ThreadsRole = "morning" | "midday" | "evening" | "night";

export interface ThreadsGridTime {
  weekday: string;
  weekend: string;
  /** С какого числа постов в сутки это время входит в расписание. */
  minCount: number;
  role: ThreadsRole;
  /** Главный вечерний слот суток: здесь выходят полезные форматы по дням недели. */
  main?: boolean;
}

/** Полная сетка из восьми времён, по возрастанию часа (МСК, будни/выходные). */
export const THREADS_GRID_TIMES: readonly ThreadsGridTime[] = [
  { weekday: "08:00", weekend: "09:00", minCount: 4, role: "morning" },
  { weekday: "10:15", weekend: "10:45", minCount: 6, role: "morning" },
  { weekday: "12:30", weekend: "13:00", minCount: 4, role: "midday" },
  { weekday: "14:30", weekend: "14:50", minCount: 7, role: "midday" },
  { weekday: "16:30", weekend: "16:55", minCount: 5, role: "midday" },
  { weekday: "19:30", weekend: "19:00", minCount: 4, role: "evening", main: true },
  { weekday: "21:15", weekend: "21:15", minCount: 8, role: "evening" },
  { weekday: "22:45", weekend: "22:45", minCount: 4, role: "night" },
];

export const THREADS_BASE_POSTS_PER_DAY = 4;
export const THREADS_MAX_POSTS_PER_DAY = THREADS_GRID_TIMES.length;

/** Ступени лесенки: с этой МСК-даты (включительно) в сутки столько постов. */
export const THREADS_LADDER_STEPS: readonly { from: string; count: number }[] = [
  { from: "2026-11-01", count: 5 },
  { from: "2026-11-08", count: 6 },
  { from: "2026-11-15", count: 7 },
  { from: "2026-11-22", count: 8 },
];

/** Число постов Threads в МСК-сутки `YYYY-MM-DD`. */
export function threadsPostsPerDay(date: string): number {
  let count = THREADS_BASE_POSTS_PER_DAY;
  for (const step of THREADS_LADDER_STEPS) {
    if (date >= step.from) count = step.count;
  }
  return count;
}

/** Номер суток эпохи → МСК-дата (сутки плана считаются от UTC-полуночи той же даты). */
export function dateOfDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Какие времена полной сетки включены при `count` постах (индексы в `THREADS_GRID_TIMES`). */
export function activeGridIndexes(count: number): number[] {
  return THREADS_GRID_TIMES
    .map((time, index) => ({ time, index }))
    .filter(({ time }) => time.minCount <= count)
    .map(({ index }) => index);
}

export interface ThreadsSlotRole {
  role: ThreadsRole;
  main: boolean;
}

/** Роли слотов суток по порядку времени: длина равна числу активных времён. */
export function threadsSlotRoles(count: number): ThreadsSlotRole[] {
  return activeGridIndexes(count).map((index) => ({
    role: THREADS_GRID_TIMES[index].role,
    main: Boolean(THREADS_GRID_TIMES[index].main),
  }));
}
