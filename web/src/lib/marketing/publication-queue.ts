/**
 * B589 фаза 1 · Пополнение очереди черновиков.
 *
 * Джоб `cron.marketing-generate` держит в реестре не больше N черновиков и
 * ничего не публикует. Наружу в этой фазе не уходит ничего вовсе — адаптеры
 * каналов и `cron.marketing-publish` это фаза 2.
 *
 * ⚠ ЗАНЯТЫЙ СЛОТ НЕ ЗАНИМАЕТСЯ ПОВТОРНО. Ключ слота уникален в базе, и это не
 * подстраховка «на всякий случай»: воркер тикает часто, а генератор daily —
 * без уникального ключа один и тот же пост уехал бы в очередь столько раз,
 * сколько тиков попало в сутки. Ошибка уникальности здесь — нормальная гонка,
 * а не сбой, поэтому она проглатывается, а не роняет джоб.
 */

import db from "@/lib/db";
import { log } from "@/lib/logger";
import { CONTENT_PLAN, nextPlanSlots, plannedAtFor } from "@/lib/marketing/content-plan";
import { generatePost } from "@/lib/marketing/post-generator";

/** Сколько черновиков держим наготове. Больше — не читает никто. */
export const DRAFT_QUEUE_TARGET = CONTENT_PLAN.length;

export interface GenerateDraftsResult {
  created: number;
  skippedNoArticle: string[];
  planExhausted: boolean;
}

export async function generateMarketingDrafts(input: {
  now?: Date;
  target?: number;
} = {}): Promise<GenerateDraftsResult> {
  const now = input.now ?? new Date();
  const target = input.target ?? DRAFT_QUEUE_TARGET;

  const existing = await db.externalPublication.findMany({
    where: { planSlot: { not: null } },
    select: { planSlot: true },
  });

  const taken = existing.map((row) => row.planSlot).filter((slot): slot is string => Boolean(slot));
  // Comments discovered by the SMM agent and ad-hoc drafts must not crowd
  // scheduled content out of the plan. The target applies only to plan slots.
  const shortfall = Math.max(0, target - taken.length);
  const slots = nextPlanSlots(taken, shortfall);

  const skippedNoArticle: string[] = [];
  let created = 0;

  for (const slot of slots) {
    const post = generatePost(slot);
    if (!post) {
      // Слот указывает на несуществующую статью. Это дефект плана, и заменять
      // её «похожей» нельзя: пост уведёт читателя в никуда.
      skippedNoArticle.push(slot.key);
      log.error("marketing.plan_slot_without_article", { slot: slot.key, article: slot.articleSlug });
      continue;
    }

    try {
      await db.externalPublication.create({
        data: {
          key: slot.key,
          planSlot: slot.key,
          platform: slot.channel,
          title: post.title,
          contentType: "POST",
          status: "DRAFT",
          body: post.body,
          destinationUrl: post.destinationUrl,
          utmSource: post.utm.source,
          utmMedium: post.utm.medium,
          utmCampaign: post.utm.campaign,
          utmContent: post.utm.content,
          targetQuery: slot.targetQuery,
          cluster: slot.cluster,
          source: "CRON_B589",
          autoPublish: false,
          scheduledFor: plannedAtFor(slot),
          createdAt: now,
        },
      });
      created += 1;
    } catch (error) {
      // Гонка на уникальном ключе слота — ожидаемое состояние, а не отказ.
      log.warn("marketing.draft_slot_taken", {
        slot: slot.key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    created,
    skippedNoArticle,
    planExhausted: taken.length + created >= CONTENT_PLAN.length,
  };
}
