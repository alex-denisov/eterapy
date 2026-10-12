const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** B762: первый контроль Threads — ранний замер через 30 минут после выхода. */
export const THREADS_FIRST_REVIEW_MINUTES = 30;

/** Первый контроль после выхода: Threads — ранний замер через 30 минут, остальные — через 7 суток. */
export function firstReviewAfterPublish(platform: string, publishedAt: Date): Date {
  return platform.toLowerCase() === "threads"
    ? new Date(publishedAt.getTime() + THREADS_FIRST_REVIEW_MINUTES * MINUTE_MS)
    : new Date(publishedAt.getTime() + 7 * DAY_MS);
}
