import db from "@/lib/db";
import { redditAccessToken } from "@/lib/marketing/reddit-oauth";
import { resolveMarketingSignal, upsertMarketingSignal } from "@/lib/marketing/agent";
import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";
import {
  marketingPlatformValue,
  requiredMarketingPlatformValue,
} from "@/lib/marketing/platform-settings";

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
  reddit: async (publication) => {
    const token = await redditAccessToken();
    const fullname = publication.externalPostId.startsWith("t")
      ? publication.externalPostId
      : `${publication.contentType === "COMMENT" ? "t1" : "t3"}_${publication.externalPostId}`;
    const payload = await json(
      `https://oauth.reddit.com/api/info?id=${encodeURIComponent(fullname)}&raw_json=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": await marketingPlatformValue("REDDIT_USER_AGENT") || "ETerapySMM/1.0",
        },
      },
    );
    const child = ((payload.data as { children?: Array<{ data?: Record<string, unknown> }> } | undefined)
      ?.children?.[0]?.data);
    if (!child) throw new Error("Reddit metrics returned no item");
    return {
      reach: null,
      views: optionalInt(child.view_count),
      reactions: optionalInt(child.score),
      comments: optionalInt(child.num_comments ?? child.num_replies),
      shares: optionalInt(child.num_crossposts),
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
    const milestone = firstDueMilestone(
      publication.publishedAt,
      now,
      new Set(publication.metrics.map((metric) => metric.source)),
      platform,
    );
    if (!milestone) {
      await db.externalPublication.update({
        where: { id: publication.id },
        data: { nextReviewAt: null },
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
        ? `API_${platform.toUpperCase()}_D${milestone}`
        : `AUTO_UNAVAILABLE_${platform.toUpperCase()}_D${milestone}`;
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
            nextReviewAt: nextReviewAt(publication.publishedAt, milestone),
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
          summary: `D+${milestone} зафиксирован без платформенных метрик; UTM-переходы посчитаны на стороне ETerapy.`,
          evidence: { publicationId: publication.id, platform, milestone },
        });
      } else {
        await resolveMarketingSignal(`metrics:unsupported:${platform}`).catch(() => undefined);
      }
      await resolveMarketingSignal(`metrics:${publication.id}:d${milestone}`).catch(() => undefined);
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
        key: `metrics:${publication.id}:d${milestone}`,
        kind: "MARKETING_METRICS",
        severity: "INCIDENT",
        title: `Не сняты метрики D+${milestone}`,
        summary: error instanceof Error ? error.message : String(error),
        evidence: { publicationId: publication.id, platform, milestone },
      }).catch(() => undefined);
    }
  }

  return { due: due.length, recorded, failed };
}

export const marketingMetricTestables = {
  firstDueMilestone,
  nextReviewAt,
  optionalInt,
};
