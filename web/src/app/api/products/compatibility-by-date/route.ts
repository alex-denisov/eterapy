import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { consumeProductEntitlementForUse, userHasActiveEntitlement } from "@/lib/entitlements";
import { requestContextFromHeaders } from "@/lib/request-context";
import { buildSynastryTeaser, generateSynastryResult } from "@/lib/synastry";
import { classifyProductSafety } from "@/lib/product-safety";

const PRODUCT_KEY = "compatibility-by-date";

const postSchema = z.object({
  userBirthData: z.string().min(4).max(1200),
  partnerBirthData: z.string().min(4).max(1200),
  topic: z.string().max(80).optional(),
  relationshipLayer: z.enum(["personal", "business-partners", "colleagues", "manager-report", "founder-specialist"]).default("personal"),
});

function serializeResult(result: {
  id: string;
  productKey: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  savedAt: Date | null;
  metadata: Prisma.JsonValue;
}) {
  return {
    id: result.id,
    productKey: result.productKey,
    status: result.status,
    title: result.title,
    previewText: result.previewText,
    resultText: result.resultText,
    saved: Boolean(result.savedAt),
    metadata: result.metadata,
  };
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const [hasEntitlement, results] = await Promise.all([
    userHasActiveEntitlement(userId, PRODUCT_KEY),
    db.productResult.findMany({
      where: { userId, productKey: PRODUCT_KEY, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
  ]);

  return jsonWithRequestContext(
    { productKey: PRODUCT_KEY, hasEntitlement, results: results.map(serializeResult) },
    { status: 200 },
    context,
  );
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const ipLimit = checkRequestAuthRateLimit(request, "product:synastry", 15, 5 * 60_000);
  if (!ipLimit.allowed) {
    return jsonWithRequestContext(
      { error: "Too many synastry product requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      context,
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Данные рождения неполны", 400, context);

  const safety = await classifyProductSafety({
    text: [
      parsed.data.userBirthData,
      parsed.data.partnerBirthData,
      parsed.data.topic ?? "",
      parsed.data.relationshipLayer,
    ].join("\n"),
    productKey: PRODUCT_KEY,
    userId,
    requestId: context.requestId,
  });
  if (safety.interrupted) {
    return jsonWithRequestContext(
      {
        error: safety.message,
        code: "SAFETY_INTERRUPTED",
        safetyLevel: safety.level,
      },
      { status: 422 },
      context,
    );
  }

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  // B451: платный-только — без доступа сразу 402, без генерации бесплатного фрагмента.
  if (!hasEntitlement) {
    return errorWithRequestContext(
      "PAYMENT_REQUIRED",
      "Откройте разбор баллами или картой — результат появится здесь же.",
      402,
      context,
    );
  }
  const generated = await generateSynastryResult({
    userBirthData: parsed.data.userBirthData,
    partnerBirthData: parsed.data.partnerBirthData,
    focus: parsed.data.topic,
    relationshipLayer: parsed.data.relationshipLayer,
    userId,
    requestId: context.requestId,
  });
  const previewText = buildSynastryTeaser({
    userBirthData: parsed.data.userBirthData,
    partnerBirthData: parsed.data.partnerBirthData,
    generatedText: generated.text,
  });

  // B451: mandatory-LLM — эвристику не сохраняем и не списываем, просим повторить.
  if ((generated.metadata as { source?: string }).source !== "ai") {
    return errorWithRequestContext(
      "AI_UNAVAILABLE",
      "Не получилось собрать разбор — попробуйте ещё раз. Доступ сохранён, повторно платить не нужно.",
      503,
      context,
    );
  }

  // INC-025/B408: списываем баллы за КАЖДЫЙ платный разбор — гасим entitlement в
  // той же транзакции, что и сохранение READY (атомарно). Подписка — не
  // ProductEntitlement, поэтому для подписчиков consume — no-op, доступ безлимитный.
  const result = await db.$transaction(async (tx) => {
    const saved = await tx.productResult.create({
      data: {
        userId,
        productKey: PRODUCT_KEY,
        title: "Совместимость по дате как карта пары",
        status: "READY",
        previewText,
        resultText: generated.text,
        savedAt: new Date(),
        metadata: {
          userBirthData: parsed.data.userBirthData,
          partnerBirthData: parsed.data.partnerBirthData,
          topic: parsed.data.topic ?? null,
          relationshipLayer: parsed.data.relationshipLayer,
          generationMetadata: generated.metadata,
        } as Prisma.InputJsonObject,
      },
    });
    await consumeProductEntitlementForUse(tx, userId, PRODUCT_KEY);
    return saved;
  });

  // Reflect the post-consume state so the client paywalls the NEXT разбор.
  const entitledAfter = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  return jsonWithRequestContext(
    { hasEntitlement: entitledAfter, result: serializeResult(result), generated: true },
    { status: 200 },
    context,
  );
}
