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
import { CONTENT_PLAN, contentPlanFor, nextPlanSlots, plannedAtFor } from "@/lib/marketing/content-plan";
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
  const activePlan = contentPlanFor(now);
  const target = input.target ?? activePlan.length;
  const firstVkSlot = activePlan.find((entry) => entry.channel === "vk");

  // INC-094: the launch post was entered before the autonomous editor existed
  // and remained forever in the non-executable PLANNED state. Put it through
  // the same writer → independent editor → scheduler route as every new item.
  if (firstVkSlot) {
    await db.externalPublication.updateMany({
      where: { key: "vk-community-first-post-2026-07-25", status: "PLANNED" },
      data: {
        status: "DRAFT",
        scheduledFor: new Date(plannedAtFor(firstVkSlot).getTime() - 60 * 60_000),
        autoPublish: false,
        agentReviewedAt: null,
        lastError: null,
        notes: JSON.stringify({
          format: "первый пост сообщества",
          editorialAngle: "полезный самостоятельный ответ: факты отдельно от догадок, затем один спокойный CTA",
          timezone: "Europe/Moscow",
          reconciledFrom: "INC-094",
        }),
      },
    });
  }

  const existing = await db.externalPublication.findMany({
    where: { planSlot: { not: null } },
    select: { planSlot: true },
  });

  const currentKeys = new Set(activePlan.map((slot) => slot.key));
  const taken = existing
    .map((row) => row.planSlot)
    .filter((slot): slot is string => typeof slot === "string" && currentKeys.has(slot));
  await db.externalPublication.updateMany({
    where: {
      AND: [
        { planSlot: { not: null } },
        { planSlot: { startsWith: "b589-" } },
        { status: { in: ["DRAFT", "REVIEW", "SCHEDULED", "FAILED"] } },
      ],
    },
    data: {
      status: "ARCHIVED",
      autoPublish: false,
      lastError: "SUPERSEDED_BY_B610_TWO_WEEK_PLAN",
    },
  });
  // Comments discovered by the SMM agent and ad-hoc drafts must not crowd
  // scheduled content out of the plan. The target applies only to plan slots.
  const shortfall = Math.max(0, target - taken.length);
  const slots = nextPlanSlots(taken, shortfall, activePlan);

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
          notes: JSON.stringify({
            format: slot.format,
            editorialAngle: slot.editorialAngle,
            timezone: "Europe/Moscow",
          }),
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
    planExhausted: taken.length + created >= activePlan.length,
  };
}

/**
 * INC-094 taught us that a row can sit in a state nothing acts on — created by
 * hand as `PLANNED`, never picked up by the generator, never published, and
 * invisible as a problem because no step ever failed. The registry now audits
 * itself: any row that has been parked in a non-terminal state past a
 * reasonable window raises a signal in the superadmin cockpit.
 */
const STALLED_STATE_WINDOW_MS = 48 * 60 * 60_000;

export interface StalledPublicationsResult {
  stalled: Array<{ id: string; key: string; status: string; ageHours: number }>;
}

export async function auditStalledPublications(
  input: { now?: Date } = {},
): Promise<StalledPublicationsResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - STALLED_STATE_WINDOW_MS);
  const rows = await db.externalPublication.findMany({
    where: {
      // PLANNED has no executor; PUBLISHING means a dispatch that never
      // finished. Both are silent stalls rather than reported failures.
      status: { in: ["PLANNED", "PUBLISHING"] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, key: true, status: true, platform: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  const stalled = rows.map((row) => ({
    id: row.id,
    key: row.key,
    status: row.status,
    ageHours: Math.round((now.getTime() - row.updatedAt.getTime()) / 3_600_000),
  }));

  const { resolveMarketingSignal, upsertMarketingSignal } = await import("@/lib/marketing/agent");
  if (stalled.length === 0) {
    await resolveMarketingSignal("registry:stalled").catch(() => undefined);
    return { stalled };
  }
  await upsertMarketingSignal({
    key: "registry:stalled",
    kind: "REGISTRY",
    severity: "WARNING",
    title: `Материалы без исполняемого статуса: ${stalled.length}`,
    summary: stalled
      .slice(0, 5)
      .map((row) => `${row.key} — ${row.status}, ${row.ageHours} ч`)
      .join("; "),
    evidence: { rows: stalled },
  }).catch(() => undefined);
  return { stalled };
}
