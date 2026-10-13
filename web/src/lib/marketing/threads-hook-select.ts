/**
 * B777 — выбор хука для поста Threads: пул от автора, оценка редактора, выбор кодом.
 *
 * Вызовы моделей приходят снаружи (`complete`): конвейер автора держит свою
 * очередь провайдеров, бюджет обращений и правило «редактор — другая модель»,
 * и дублировать это здесь значило бы завести второй, расходящийся перебор.
 */

import {
  HOOK_PICK_SYSTEM, HOOK_POOL_SYSTEM, hookPickUser, hookPoolUser, parseHookPool, parseHookScores, pickHook,
  type HookChoice, type HookPoolTask,
} from "@/lib/marketing/threads-hook-pool";
import type { RecentThreadsPost } from "@/lib/marketing/threads-hooks";

export type HookRole = "writer" | "reviewer";

export interface HookMessage {
  role: "system" | "user";
  content: string;
}

export type HookComplete = <T>(input: {
  role: HookRole;
  messages: HookMessage[];
  parse: (raw: string) => T;
  /** Модель, которой роль пользоваться не может (редактор ≠ автор пула). */
  excludeModel?: string | null;
}) => Promise<{ value: T; model: string }>;

export async function chooseThreadsHook(input: {
  task: HookPoolTask;
  recent: readonly RecentThreadsPost[];
  now: Date;
  complete: HookComplete;
}): Promise<HookChoice> {
  const pool = await input.complete({
    role: "writer",
    messages: [{ role: "system", content: HOOK_POOL_SYSTEM }, { role: "user", content: hookPoolUser(input.task) }],
    parse: (raw) => parseHookPool(raw, { recent: input.recent, now: input.now }),
  });
  const scores = await input.complete({
    role: "reviewer",
    excludeModel: pool.model,
    messages: [
      { role: "system", content: HOOK_PICK_SYSTEM },
      { role: "user", content: hookPickUser(pool.value, input.task) },
    ],
    parse: (raw) => parseHookScores(raw, pool.value.length),
  });
  return pickHook(pool.value, scores.value, input.task.recentIntents);
}
