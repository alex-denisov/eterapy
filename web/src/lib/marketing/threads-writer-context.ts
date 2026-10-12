/**
 * B762 — что получает автор поста Threads сверх общей задачи и чем его
 * результат проверяется до утверждения.
 *
 *   • тема — живая сцена из пула разведчика (`threads-material.ts`), а не
 *     SEO-запрос слота: из-за SEO-темы сухой прогон дал 56 постов про одно;
 *   • хуки ленты за 30 суток — чтобы автор видел, какие зачины уже были;
 *   • копирка хука — жёсткий отказ в утверждении (`hookCopyVerdict`).
 *
 * Идея владельца (B761) сцену не получает: у неё своя тема — сам владелец.
 */

import db from "@/lib/db";
import { isOwnerReviewed } from "@/lib/marketing/owner-review-state";
import { CONVERSATIONAL_CONTENT_TYPES } from "@/lib/marketing/perimeter";
import { claimThreadsScene, type ThreadsScene } from "@/lib/marketing/threads-material";
import {
  HOOK_MEMORY_DAYS,
  hookCopyFindings,
  recentHooksForPrompt,
  type RecentThreadsPost,
} from "@/lib/marketing/threads-hooks";
import { factFindings, pickThreadsFact, type ThreadsFact } from "@/lib/marketing/threads-facts";
import type { LimitViolation } from "@/lib/marketing/platform-limits";

export const FREE_THREADS_TOPIC =
  "Тема свободная: выбери сама живую сцену из отношений, работы, денег, дружбы, семьи или знаков — такую, "
  + "которой нет среди недавних хуков ленты. Не про «сложный разговор» и не про «выбор между карьерой и любовью».";

export interface ThreadsWriterContext {
  scene: ThreadsScene | null;
  recent: RecentThreadsPost[];
  recentHooks: string[];
  /** Время слота: соседи по ленте считаются от него. */
  at: Date;
  /** B766: проверенный факт из механик платформы; `null` — теме он не нужен. */
  fact: ThreadsFact | null;
}

function draftText(value: unknown): string {
  if (value && typeof value === "object" && "text" in value && typeof (value as { text?: unknown }).text === "string") {
    return (value as { text: string }).text;
  }
  return "";
}

export function isThreadsOwnedPost(publication: { platform: string; contentType: string | null }): boolean {
  return publication.platform.trim().toLowerCase() === "threads"
    && !CONVERSATIONAL_CONTENT_TYPES.includes((publication.contentType ?? "").toUpperCase());
}

export async function recentThreadsPosts(excludeId: string, at: Date): Promise<RecentThreadsPost[]> {
  const since = new Date(at.getTime() - HOOK_MEMORY_DAYS * 86_400_000);
  const rows = await db.externalPublication.findMany({
    where: {
      id: { not: excludeId },
      platform: { equals: "threads", mode: "insensitive" },
      contentType: { notIn: [...CONVERSATIONAL_CONTENT_TYPES] },
      status: { in: ["PUBLISHED", "SCHEDULED", "MANUAL", "REVIEW", "DRAFT"] },
      OR: [{ publishedAt: { gte: since } }, { scheduledFor: { gte: since } }],
    },
    select: { body: true, agentWriterDraft: true, publishedAt: true, scheduledFor: true },
    take: 400,
  });
  return rows
    .map((row) => ({
      text: row.body?.trim() || draftText(row.agentWriterDraft),
      at: row.publishedAt ?? row.scheduledFor ?? at,
    }))
    .filter((post) => post.text.trim().length > 0);
}

export async function threadsWriterContext(publication: {
  id: string;
  cluster?: string | null;
  platform: string;
  contentType: string | null;
  source: string | null;
  scheduledFor: Date | null;
}, now = new Date()): Promise<ThreadsWriterContext> {
  const at = publication.scheduledFor ?? now;
  const recent = await recentThreadsPosts(publication.id, at).catch(() => []);
  const scene = isOwnerReviewed(publication) ? null : await claimThreadsScene(publication.id, now);
  const fact = isOwnerReviewed(publication)
    ? null
    : pickThreadsFact({ at, cluster: publication.cluster ?? null, scene: scene?.scene ?? null, seed: publication.id });
  return { scene, recent, recentHooks: recentHooksForPrompt(recent, at), at, fact };
}

/** Находки копирки для текста-кандидата; пусто — копирки нет. */
export function hookCopyVerdict(context: ThreadsWriterContext | null, text: string): LimitViolation[] {
  if (!context) return [];
  return [
    ...hookCopyFindings({ text, recent: context.recent, now: context.at }),
    // B766: пост не выдумывает астрологии сверх проверенного факта.
    ...factFindings(context.fact, text),
  ];
}
