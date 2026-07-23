"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestMeta } from "@/lib/request-meta";
import {
  externalPublicationInputSchema,
  externalPublicationUpdateSchema,
} from "@/lib/external-publications";

export type PublicationActionResult = { ok: boolean; message: string };

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function safeIssue(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    return issues?.[0]?.message ?? "Проверьте заполненные поля";
  }
  return "Не удалось сохранить публикацию";
}

async function superadmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPERADMIN") return null;
  return session.user.id;
}

export async function createExternalPublicationAction(formData: FormData): Promise<PublicationActionResult> {
  const userId = await superadmin();
  if (!userId) return { ok: false, message: "Раздел доступен только суперадмину" };

  try {
    const input = externalPublicationInputSchema.parse({
      key: formValue(formData, "key"),
      platform: formValue(formData, "platform"),
      channelName: formValue(formData, "channelName"),
      title: formValue(formData, "title"),
      contentType: formValue(formData, "contentType"),
      status: formValue(formData, "status"),
      publicUrl: formValue(formData, "publicUrl"),
      destinationUrl: formValue(formData, "destinationUrl"),
      utmSource: formValue(formData, "utmSource"),
      utmMedium: formValue(formData, "utmMedium"),
      utmCampaign: formValue(formData, "utmCampaign"),
      utmContent: formValue(formData, "utmContent"),
      targetQuery: formValue(formData, "targetQuery"),
      cluster: formValue(formData, "cluster"),
      indexStatus: formValue(formData, "indexStatus") || "UNKNOWN",
      publishedAt: formValue(formData, "publishedAt"),
      lastIndexCheckAt: formValue(formData, "lastIndexCheckAt"),
      nextReviewAt: formValue(formData, "nextReviewAt"),
      notes: formValue(formData, "notes"),
    });
    const { ip } = await getRequestMeta();
    await db.$transaction(async (tx) => {
      const publication = await tx.externalPublication.create({
        data: { ...input, source: "ADMIN_UI", createdBy: userId, updatedBy: userId },
      });
      await tx.auditLog.create({
        data: {
          userId,
          targetId: publication.id,
          action: AUDIT_ACTIONS.EXTERNAL_PUBLICATION_CREATE,
          details: JSON.stringify({ key: publication.key, platform: publication.platform, status: publication.status }),
          ip,
        },
      });
    });
    revalidatePath("/admin/marketing/publications");
    return { ok: true, message: "Публикация добавлена в реестр" };
  } catch (error) {
    return { ok: false, message: safeIssue(error) };
  }
}

export async function updateExternalPublicationAction(formData: FormData): Promise<PublicationActionResult> {
  const userId = await superadmin();
  if (!userId) return { ok: false, message: "Раздел доступен только суперадмину" };

  try {
    const input = externalPublicationUpdateSchema.parse({
      publicationId: formValue(formData, "publicationId"),
      status: formValue(formData, "status"),
      indexStatus: formValue(formData, "indexStatus"),
      publicUrl: formValue(formData, "publicUrl"),
      lastIndexCheckAt: formValue(formData, "lastIndexCheckAt"),
      nextReviewAt: formValue(formData, "nextReviewAt"),
      notes: formValue(formData, "notes"),
      reach: formValue(formData, "reach"),
      views: formValue(formData, "views"),
      reactions: formValue(formData, "reactions"),
      comments: formValue(formData, "comments"),
      shares: formValue(formData, "shares"),
      outboundClicks: formValue(formData, "outboundClicks"),
      metricRecordedAt: formValue(formData, "metricRecordedAt"),
    });
    const hasMetric = [input.reach, input.views, input.reactions, input.comments, input.shares, input.outboundClicks]
      .some((value) => value !== undefined);
    const { ip } = await getRequestMeta();

    await db.$transaction(async (tx) => {
      const before = await tx.externalPublication.findUniqueOrThrow({ where: { id: input.publicationId } });
      const publication = await tx.externalPublication.update({
        where: { id: input.publicationId },
        data: {
          status: input.status,
          indexStatus: input.indexStatus,
          publicUrl: input.publicUrl,
          lastIndexCheckAt: input.lastIndexCheckAt,
          nextReviewAt: input.nextReviewAt,
          notes: input.notes,
          updatedBy: userId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          targetId: publication.id,
          action: AUDIT_ACTIONS.EXTERNAL_PUBLICATION_UPDATE,
          details: JSON.stringify({
            key: publication.key,
            before: { status: before.status, indexStatus: before.indexStatus },
            after: { status: publication.status, indexStatus: publication.indexStatus },
          }),
          ip,
        },
      });
      if (hasMetric) {
        const metric = await tx.externalPublicationMetric.create({
          data: {
            publicationId: publication.id,
            reach: input.reach,
            views: input.views,
            reactions: input.reactions,
            comments: input.comments,
            shares: input.shares,
            outboundClicks: input.outboundClicks,
            recordedAt: input.metricRecordedAt ?? new Date(),
            source: "MANUAL",
            createdBy: userId,
          },
        });
        await tx.auditLog.create({
          data: {
            userId,
            targetId: publication.id,
            action: AUDIT_ACTIONS.EXTERNAL_PUBLICATION_METRIC,
            details: JSON.stringify({ metricId: metric.id, recordedAt: metric.recordedAt.toISOString() }),
            ip,
          },
        });
      }
    });
    revalidatePath("/admin/marketing/publications");
    return { ok: true, message: hasMetric ? "Карточка и срез метрик сохранены" : "Карточка обновлена" };
  } catch (error) {
    return { ok: false, message: safeIssue(error) };
  }
}
