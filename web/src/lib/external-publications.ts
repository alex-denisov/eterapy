import { z } from "zod";
import db from "@/lib/db";
import { AUDIT_ACTIONS } from "@/lib/audit";
import type { AdminPeriod } from "@/app/admin/admin-analytics-data";
import {
  PUBLICATION_CONTENT_TYPES,
  PUBLICATION_INDEX_STATUSES,
  PUBLICATION_PLATFORMS,
  PUBLICATION_STATUSES,
} from "@/lib/external-publication-shared";

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(max).optional(),
).optional();

const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().url().max(2_048).refine((value) => /^https?:\/\//i.test(value), "Нужна ссылка http(s)").optional(),
).optional();

const optionalDate = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.date().optional(),
).optional();

const optionalNonNegativeInt = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? undefined : value,
  z.coerce.number().int().min(0).max(2_000_000_000).optional(),
).optional();

export const externalPublicationInputSchema = z.object({
  key: z.string().trim().min(3).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Ключ — строчные латинские буквы, цифры и дефисы"),
  platform: z.enum(PUBLICATION_PLATFORMS),
  channelName: optionalText(160),
  title: z.string().trim().min(8).max(240),
  contentType: z.enum(PUBLICATION_CONTENT_TYPES),
  status: z.enum(PUBLICATION_STATUSES),
  publicUrl: optionalUrl,
  destinationUrl: optionalUrl,
  utmSource: optionalText(100),
  utmMedium: optionalText(100),
  utmCampaign: optionalText(160),
  utmContent: optionalText(160),
  targetQuery: optionalText(240),
  cluster: optionalText(160),
  indexStatus: z.enum(PUBLICATION_INDEX_STATUSES).default("UNKNOWN"),
  publishedAt: optionalDate,
  lastIndexCheckAt: optionalDate,
  nextReviewAt: optionalDate,
  notes: optionalText(4_000),
}).superRefine((value, context) => {
  if (value.status === "PUBLISHED" && !value.publicUrl) {
    context.addIssue({ code: "custom", path: ["publicUrl"], message: "Для опубликованного материала нужна публичная ссылка" });
  }
});

export const externalPublicationUpdateSchema = z.object({
  publicationId: z.string().trim().min(1).max(100),
  status: z.enum(PUBLICATION_STATUSES),
  indexStatus: z.enum(PUBLICATION_INDEX_STATUSES),
  publicUrl: optionalUrl,
  lastIndexCheckAt: optionalDate,
  nextReviewAt: optionalDate,
  notes: optionalText(4_000),
  reach: optionalNonNegativeInt,
  views: optionalNonNegativeInt,
  reactions: optionalNonNegativeInt,
  comments: optionalNonNegativeInt,
  shares: optionalNonNegativeInt,
  outboundClicks: optionalNonNegativeInt,
  metricRecordedAt: optionalDate,
}).superRefine((value, context) => {
  if (value.status === "PUBLISHED" && !value.publicUrl) {
    context.addIssue({ code: "custom", path: ["publicUrl"], message: "Для опубликованного материала нужна публичная ссылка" });
  }
});

export type ExternalPublicationInput = z.infer<typeof externalPublicationInputSchema>;

function auditDetails(value: Record<string, unknown>) {
  return JSON.stringify(value).slice(0, 8_000);
}

export async function upsertExternalPublicationFromCode(raw: unknown, agentName: string) {
  const parsed = externalPublicationInputSchema.parse(raw);
  const actor = `agent:${agentName.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 80) || "unknown"}`;
  return db.$transaction(async (tx) => {
    const publication = await tx.externalPublication.upsert({
      where: { key: parsed.key },
      create: { ...parsed, source: "CODE", createdBy: actor, updatedBy: actor },
      update: { ...parsed, source: "CODE", updatedBy: actor },
    });
    await tx.auditLog.create({
      data: {
        userId: actor,
        targetId: publication.id,
        action: AUDIT_ACTIONS.EXTERNAL_PUBLICATION_UPDATE,
        details: auditDetails({ key: publication.key, platform: publication.platform, status: publication.status, source: "CODE" }),
      },
    });
    return publication;
  });
}

export async function getExternalPublicationRegistry(period: AdminPeriod) {
  const publications = await db.externalPublication.findMany({
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: { metrics: { orderBy: { recordedAt: "desc" }, take: 1 } },
  });

  const trackedCampaigns = publications
    .filter((publication) => publication.utmSource && publication.utmCampaign)
    .map((publication) => ({ utmSource: publication.utmSource!, utmCampaign: publication.utmCampaign! }));
  const attributionRows = trackedCampaigns.length > 0
    ? await db.channelAttribution.findMany({
      where: {
        lastTouchAt: { gte: period.start, lte: period.end },
        OR: trackedCampaigns,
      },
      select: { utmSource: true, utmCampaign: true, conversionAt: true },
    })
    : [];

  const attribution = new Map<string, { touches: number; conversions: number }>();
  for (const row of attributionRows) {
    const key = `${row.utmSource ?? ""}\u0000${row.utmCampaign ?? ""}`;
    const current = attribution.get(key) ?? { touches: 0, conversions: 0 };
    current.touches += 1;
    if (row.conversionAt && row.conversionAt >= period.start && row.conversionAt <= period.end) current.conversions += 1;
    attribution.set(key, current);
  }

  const now = new Date();
  const rows = publications.map((publication) => {
    const key = `${publication.utmSource ?? ""}\u0000${publication.utmCampaign ?? ""}`;
    const campaign = attribution.get(key) ?? { touches: 0, conversions: 0 };
    const metric = publication.metrics[0] ?? null;
    const reviewDue = Boolean(publication.nextReviewAt && publication.nextReviewAt <= now);
    const indexCheckDue = publication.status === "PUBLISHED" && (
      publication.indexStatus === "UNKNOWN"
      || publication.indexStatus === "NOT_INDEXED"
      || !publication.lastIndexCheckAt
      || now.getTime() - publication.lastIndexCheckAt.getTime() > 14 * 86_400_000
    );
    return {
      id: publication.id,
      key: publication.key,
      platform: publication.platform,
      channelName: publication.channelName,
      title: publication.title,
      contentType: publication.contentType,
      status: publication.status,
      publicUrl: publication.publicUrl,
      destinationUrl: publication.destinationUrl,
      utmSource: publication.utmSource,
      utmMedium: publication.utmMedium,
      utmCampaign: publication.utmCampaign,
      targetQuery: publication.targetQuery,
      cluster: publication.cluster,
      indexStatus: publication.indexStatus,
      publishedAt: publication.publishedAt?.toISOString() ?? null,
      lastIndexCheckAt: publication.lastIndexCheckAt?.toISOString() ?? null,
      nextReviewAt: publication.nextReviewAt?.toISOString() ?? null,
      notes: publication.notes,
      source: publication.source,
      latestMetric: metric ? {
        reach: metric.reach,
        views: metric.views,
        reactions: metric.reactions,
        comments: metric.comments,
        shares: metric.shares,
        outboundClicks: metric.outboundClicks,
        recordedAt: metric.recordedAt.toISOString(),
      } : null,
      touches: campaign.touches,
      conversions: campaign.conversions,
      reviewDue,
      indexCheckDue,
    };
  });

  const published = rows.filter((row) => row.status === "PUBLISHED");
  const views = rows.reduce((sum, row) => sum + (row.latestMetric?.views ?? 0), 0);
  const touches = rows.reduce((sum, row) => sum + row.touches, 0);
  const conversions = rows.reduce((sum, row) => sum + row.conversions, 0);

  return {
    rows,
    totals: {
      all: rows.length,
      published: published.length,
      indexed: published.filter((row) => row.indexStatus === "INDEXED").length,
      actionRequired: rows.filter((row) => row.reviewDue || row.indexCheckDue).length,
      views,
      touches,
      conversions,
      conversionRate: touches > 0 ? conversions / touches * 100 : 0,
    },
  };
}

export type ExternalPublicationRegistry = Awaited<ReturnType<typeof getExternalPublicationRegistry>>;
