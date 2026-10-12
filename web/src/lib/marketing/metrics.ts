import db from "@/lib/db";
import { resolveMarketingSignal, upsertMarketingSignal } from "@/lib/marketing/agent";
import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";
import { firstReviewAfterPublish } from "@/lib/marketing/review-schedule";
import { requiredMarketingPlatformValue } from "@/lib/marketing/platform-settings";

const DAY_MS = 86_400_000;
const VK_API_VERSION = "5.199";
const RETRY_MS = 6 * 60 * 60_000;

export type PublicationMetricSnapshot = {
  reach: number | null;
  views: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
};

export type PublicationMetricAdapter = (publication: {
  externalPostId: string;
  contentType: string;
  engagementTargetId: string | null;
}) => Promise<PublicationMetricSnapshot>;

type Milestone = 7 | 14 | 28;

const MINUTE_MS = 60_000;
/** B762: ранние замеры Threads — реакция в первые минуты решает, показывает ли лента пост дальше. */
const EARLY_MINUTES = [30, 90] as const;
/** Показатели накопительные: замер, снятый много позже срока, говорил бы о другом сроке — его не пишем. */
const EARLY_VALID_MS = 3 * 60 * MINUTE_MS;

/** Какой ранний замер пора снять: 30 или 90 минут; `null` — не Threads, рано, уже записан или опоздал. */
function firstDueEarlyMinutes(publishedAt: Date, now: Date, recordedSources: Set<string>, platform: string): 30 | 90 | null {
  if (platform !== "threads") return null;
  for (const minutes of EARLY_MINUTES) {
    const dueAt = publishedAt.getTime() + minutes * MINUTE_MS;
    if (now.getTime() < dueAt) return null;
    if (recordedSources.has(`API_THREADS_M${minutes}`) || recordedSources.has(`AUTO_UNAVAILABLE_THREADS_M${minutes}`)) continue;
    if (now.getTime() - dueAt <= EARLY_VALID_MS) return minutes;
  }
  return null;
}



function optionalInt(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.min(2_000_000_000, Math.round(number))
    : null;
}

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(`HTTP ${response.status}`);
  return payload as Record<string, unknown>;
}

const EMPTY_SNAPSHOT: PublicationMetricSnapshot = {
  reach: null,
  views: null,
  reactions: null,
  comments: null,
  shares: null,
};

export const metricAdapters: Partial<Record<string, PublicationMetricAdapter>> = {
  vk: async (publication) => {
    const token = await requiredMarketingPlatformValue("VK_COMMUNITY_TOKEN");
    const communityId = (await requiredMarketingPlatformValue("VK_COMMUNITY_ID")).replace(/^-/, "");
    const payload = await json("https://api.vk.com/method/wall.getById", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: token,
        v: VK_API_VERSION,
        posts: `-${communityId}_${publication.externalPostId}`,
      }),
    });
    const error = payload.error as { error_msg?: string; error_code?: number } | undefined;
    if (error) {
      if (error.error_code === 27 || /group auth|authorization failed/i.test(error.error_msg ?? "")) {
        console.warn(`[metrics:vk] wall.getById unavailable with group token (${error.error_msg}), skipping without crash`);
        return EMPTY_SNAPSHOT;
      }
      throw new Error(`VK metrics failed: ${error.error_msg ?? "unknown error"}`);
    }
    const item = (payload.response as Array<Record<string, unknown>> | undefined)?.[0];
    if (!item) return EMPTY_SNAPSHOT;
    return {
      reach: optionalInt((item.reach as { count?: unknown } | undefined)?.count),
      views: optionalInt((item.views as { count?: unknown } | undefined)?.count),
      reactions: optionalInt((item.likes as { count?: unknown } | undefined)?.count),
      comments: optionalInt((item.comments as { count?: unknown } | undefined)?.count),
      shares: optionalInt((item.reposts as { count?: unknown } | undefined)?.count),
    };
  },
  instagram: async (publication) => {
    const token = await requiredMarketingPlatformValue("INSTAGRAM_ACCESS_TOKEN");
    const base = `${metaEndpoint("instagram")}/v25.0/${encodeURIComponent(publication.externalPostId)}`;
    const [media, insights] = await Promise.all([
      json(`${base}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`, { headers: metaRequestHeaders() }),
      json(`${base}/insights?metric=impressions,reach,views,shares,total_interactions&access_token=${encodeURIComponent(token)}`, { headers: metaRequestHeaders() })
        .catch(() => ({ data: [] })),
    ]);
    const values = Object.fromEntries(
      ((insights.data as Array<{ name?: string; values?: Array<{ value?: unknown }> }> | undefined) ?? [])
        .flatMap((item) => item.name ? [[item.name, item.values?.[0]?.value]] : []),
    );
    return {
      reach: optionalInt(values.reach),
      views: optionalInt(values.views ?? values.impressions),
      reactions: optionalInt(media.like_count ?? values.total_interactions),
      comments: optionalInt(media.comments_count),
      shares: optionalInt(values.shares),
    };
  },
  threads: async (publication) => {
    const token = await requiredMarketingPlatformValue("THREADS_ACCESS_TOKEN");
    const payload = await json(
      `${metaEndpoint("threads")}/v1.0/${encodeURIComponent(publication.externalPostId)}/insights`
      + `?metric=views,likes,replies,reposts,quotes,shares&access_token=${encodeURIComponent(token)}`,
      { headers: metaRequestHeaders() },
    );
    const values = Object.fromEntries(
      ((payload.data as Array<{ name?: string; values?: Array<{ value?: unknown }> }> | undefined) ?? [])
        .flatMap((item) => item.name ? [[item.name, item.values?.[0]?.value]] : []),
    );
    return {
      reach: null,
      views: optionalInt(values.views),
      reactions: optionalInt(values.likes),
      comments: optionalInt(values.replies),
      shares: optionalInt(
        (optionalInt(values.reposts) ?? 0)
        + (optionalInt(values.quotes) ?? 0)
        + (optionalInt(values.shares) ?? 0),
      ),
    };
  },
};

function firstDueMilestone(
  publishedAt: Date,
  now: Date,
  recordedSources: Set<string>,
  platform: string,
) {
  for (const milestone of [7, 14, 28] as const) {
    const source = `API_${platform.toUpperCase()}_D${milestone}`;
    const unavailableSource = `AUTO_UNAVAILABLE_${platform.toUpperCase()}_D${milestone}`;
    if (
      now.getTime() >= publishedAt.getTime() + milestone * DAY_MS
      && !recordedSources.has(source)
      && !recordedSources.has(unavailableSource)
    ) {
      return milestone;
    }
  }
  return null;
}

/** После M30 — M90, после M90 — D7 (как у остальных площадок). */
function earlyNextReview(publishedAt: Date, minutes: 30 | 90): Date {
  return minutes === 30
    ? new Date(publishedAt.getTime() + 90 * MINUTE_MS)
    : new Date(publishedAt.getTime() + 7 * DAY_MS);
}

function nextReviewAt(publishedAt: Date, milestone: Milestone) {
  if (milestone === 7) return new Date(publishedAt.getTime() + 14 * DAY_MS);
  if (milestone === 14) return new Date(publishedAt.getTime() + 28 * DAY_MS);
  return null;
}

export async function collectDuePublicationMetrics(input: {
  now?: Date;
  adapters?: Partial<Record<string, PublicationMetricAdapter>>;
} = {}) {
  const now = input.now ?? new Date();
  const due = await db.externalPublication.findMany({
    where: {
      status: "PUBLISHED",
      contentType: { in: ["POST", "COMMENT"] },
      publishedAt: { not: null },
      nextReviewAt: { lte: now },
      externalPostId: { not: null },
    },
    orderBy: { nextReviewAt: "asc" },
    take: 20,
    select: {
      id: true,
      platform: true,
      contentType: true,
      publishedAt: true,
      nextReviewAt: true,
      externalPostId: true,
      engagementTargetId: true,
      utmSource: true,
      utmCampaign: true,
      metrics: { select: { source: true } },
    },
  });

  let recorded = 0;
  let failed = 0;
  for (const publication of due) {
    if (!publication.publishedAt || !publication.externalPostId || !publication.nextReviewAt) continue;
    const platform = publication.platform.toLowerCase();
    const recordedSources = new Set(publication.metrics.map((metric) => metric.source));
    const early = firstDueEarlyMinutes(publication.publishedAt, now, recordedSources, platform);
    const milestone = early ?? firstDueMilestone(publication.publishedAt, now, recordedSources, platform);
    // Метка срока: `M30`/`M90` (минуты) для раннего замера, `D7`/`D14`/`D28` (сутки) для остальных.
    const label = early ? `M${early}` : `D${milestone}`;
    if (!milestone) {
      // Ранний замер мог пропасть (сбой API, простой воркера): пост ждёт D7, а не выпадает из контроля.
      const firstDay = new Date(publication.publishedAt.getTime() + 7 * DAY_MS);
      await db.externalPublication.update({
        where: { id: publication.id },
        data: { nextReviewAt: now.getTime() < firstDay.getTime() ? firstDay : null },
      });
      continue;
    }

    const claimed = await db.externalPublication.updateMany({
      where: {
        id: publication.id,
        status: "PUBLISHED",
        nextReviewAt: publication.nextReviewAt,
      },
      data: { nextReviewAt: new Date(now.getTime() + RETRY_MS) },
    });
    if (claimed.count === 0) continue;

    try {
      const adapter = input.adapters?.[platform] ?? metricAdapters[platform];
      const snapshot = adapter
        ? await adapter({
          externalPostId: publication.externalPostId,
          contentType: publication.contentType,
          engagementTargetId: publication.engagementTargetId,
        })
        : { reach: null, views: null, reactions: null, comments: null, shares: null };
      const outboundClicks = publication.utmSource && publication.utmCampaign
        ? await db.channelAttribution.count({
          where: {
            utmSource: publication.utmSource,
            utmCampaign: publication.utmCampaign,
            lastTouchAt: { gte: publication.publishedAt, lte: now },
          },
        })
        : null;
      const source = adapter
        ? `API_${platform.toUpperCase()}_${label}`
        : `AUTO_UNAVAILABLE_${platform.toUpperCase()}_${label}`;
      await db.$transaction([
        db.externalPublicationMetric.create({
          data: {
            publicationId: publication.id,
            ...snapshot,
            outboundClicks,
            source,
            recordedAt: now,
            createdBy: "service:marketing-agent",
          },
        }),
        db.externalPublication.update({
          where: { id: publication.id },
          data: {
            nextReviewAt: early
              ? earlyNextReview(publication.publishedAt, early)
              : nextReviewAt(publication.publishedAt, milestone as Milestone),
            lastError: null,
          },
        }),
      ]);
      if (!adapter) {
        await upsertMarketingSignal({
          key: `metrics:unsupported:${platform}`,
          kind: "MARKETING_METRICS",
          severity: "WARNING",
          title: `Метрики ${platform}: нужен ручной или новый API-адаптер`,
          summary: `${label} зафиксирован без платформенных метрик; UTM-переходы посчитаны на стороне ETerapy.`,
          evidence: { publicationId: publication.id, platform, milestone },
        });
      } else {
        await resolveMarketingSignal(`metrics:unsupported:${platform}`).catch(() => undefined);
      }
      await resolveMarketingSignal(`metrics:${publication.id}:${label.toLowerCase()}`).catch(() => undefined);
      recorded += 1;
    } catch (error) {
      failed += 1;
      await db.externalPublication.update({
        where: { id: publication.id },
        data: {
          nextReviewAt: new Date(now.getTime() + RETRY_MS),
          lastError: `METRICS_D${milestone}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 1_000),
        },
      });
      await upsertMarketingSignal({
        key: `metrics:${publication.id}:${label.toLowerCase()}`,
        kind: "MARKETING_METRICS",
        severity: "INCIDENT",
        title: `Не сняты метрики ${label}`,
        summary: error instanceof Error ? error.message : String(error),
        evidence: { publicationId: publication.id, platform, milestone },
      }).catch(() => undefined);
    }
  }

  return { due: due.length, recorded, failed };
}

export const marketingMetricTestables = {
  firstDueMilestone,
  firstDueEarlyMinutes,
  firstReviewAfterPublish,
  nextReviewAt,
  optionalInt,
};
