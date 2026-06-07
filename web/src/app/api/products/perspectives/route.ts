import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { userHasActiveEntitlement } from "@/lib/entitlements";
import { buildPerspectivesPreview, buildPerspectivesTeaser, buildPerspectivesTitle, generatePerspectives } from "@/lib/perspectives";
import { requestContextFromHeaders } from "@/lib/request-context";

const PRODUCT_KEY = "perspectives";

const actionSchema = z.object({
  dialogueId: z.string().min(1),
  action: z.enum(["preview", "generate"]),
});

function serializeResult(result: {
  id: string;
  dialogueId: string | null;
  productKey: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  savedAt: Date | null;
  exportedAt: Date | null;
  deletedAt: Date | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: result.id,
    dialogueId: result.dialogueId,
    productKey: result.productKey,
    status: result.status,
    title: result.title,
    previewText: result.previewText,
    resultText: result.resultText,
    saved: Boolean(result.savedAt),
    exportedAt: result.exportedAt?.toISOString() ?? null,
    deletedAt: result.deletedAt?.toISOString() ?? null,
    metadata: result.metadata,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const dialogueId = request.nextUrl.searchParams.get("dialogueId");
  const results = await db.productResult.findMany({
    where: {
      userId,
      productKey: PRODUCT_KEY,
      deletedAt: null,
      ...(dialogueId ? { dialogueId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: dialogueId ? 1 : 20,
  });

  return jsonWithRequestContext({
    hasEntitlement: await userHasActiveEntitlement(userId, PRODUCT_KEY),
    results: results.map(serializeResult),
  }, { status: 200 }, context);
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const ipLimit = checkRequestAuthRateLimit(request, "product:perspectives", 25, 5 * 60_000);
  if (!ipLimit.allowed) {
    return jsonWithRequestContext(
      { error: "Too many perspectives requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      context,
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid perspectives payload", 400, context);

  const dialogue = await db.dialogue.findFirst({
    where: { id: parsed.data.dialogueId, userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      topic: true,
      difficulty: true,
      safetyLevel: true,
      status: true,
      messages: { orderBy: { createdAt: "asc" }, select: { role: true, content: true } },
    },
  });

  if (!dialogue) return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);
  if (dialogue.status === "SAFETY_INTERRUPTED" || dialogue.safetyLevel === "crisis" || dialogue.safetyLevel === "blocked") {
    return errorWithRequestContext("SAFETY_BLOCKED", "Экстренная поддержка останавливает платные сценарии", 409, context);
  }
  // Allow generation once the intake is complete: ANSWERED (the /checkin flow
  // produced a primary answer) OR PROCESSING (the product-intake flow finished
  // clarifications — it never calls /answer, so it stops at PROCESSING). Block
  // only genuinely-incomplete dialogues (OPEN / AWAITING_USER mid-intake).
  if (dialogue.status !== "ANSWERED" && dialogue.status !== "PROCESSING") {
    return errorWithRequestContext("CONFLICT", "Сначала завершите короткий разбор вопроса", 409, context);
  }

  const title = buildPerspectivesTitle(dialogue);
  const previewText = buildPerspectivesPreview(dialogue);
  const existing = await db.productResult.findFirst({
    where: { userId, dialogueId: dialogue.id, productKey: PRODUCT_KEY, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });

  if (parsed.data.action === "preview") {
    const generated = await generatePerspectives({ dialogue, userId, requestId: context.requestId });
    const teaserText = buildPerspectivesTeaser(dialogue, generated.text);
    const result = existing
      ? await db.productResult.update({
        where: { id: existing.id },
        data: {
          title,
          previewText: teaserText,
          status: existing.status === "READY" ? "READY" : "PREVIEW",
          metadata: existing.status === "READY"
            ? existing.metadata as Prisma.InputJsonValue
            : { source: "preview", previewGenerationMetadata: generated.metadata },
        },
      })
      : await db.productResult.create({
        data: {
          userId,
          dialogueId: dialogue.id,
          productKey: PRODUCT_KEY,
          status: "PREVIEW",
          title,
          previewText: teaserText,
          metadata: { source: "preview", previewGenerationMetadata: generated.metadata },
        },
      });
    return jsonWithRequestContext({
      hasEntitlement: await userHasActiveEntitlement(userId, PRODUCT_KEY),
      result: serializeResult(result),
    }, { status: 200 }, context);
  }

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  if (!hasEntitlement) {
    return jsonWithRequestContext({
      error: "Для 4 ракурсов нужна оплата или активная подписка",
      code: "PAYMENT_REQUIRED",
      checkout: { productKey: PRODUCT_KEY, checkoutSource: "perspectives-generate" },
      preview: existing ? serializeResult(existing) : { title, previewText },
    }, { status: 402 }, context);
  }

  if (existing?.status === "READY" && existing.resultText) {
    return jsonWithRequestContext({ hasEntitlement, result: serializeResult(existing), generated: false }, { status: 200 }, context);
  }

  const generated = await generatePerspectives({ dialogue, userId, requestId: context.requestId });
  const result = existing
    ? await db.productResult.update({
      where: { id: existing.id },
      data: { status: "READY", title, previewText, resultText: generated.text, metadata: generated.metadata },
    })
    : await db.productResult.create({
      data: {
        userId,
        dialogueId: dialogue.id,
        productKey: PRODUCT_KEY,
        status: "READY",
        title,
        previewText,
        resultText: generated.text,
        metadata: generated.metadata,
      },
    });

  return jsonWithRequestContext({ hasEntitlement, result: serializeResult(result), generated: true }, { status: 200 }, context);
}
