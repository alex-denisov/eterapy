import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { consumeProductEntitlementForUse, userHasActiveEntitlement } from "@/lib/entitlements";
import { buildReframePreview, buildReframeTitle, generateReframe, reframeResultForDisplay } from "@/lib/reframe";
import { requestContextFromHeaders } from "@/lib/request-context";

const PRODUCT_KEY = "reframe";

// B444 (M28): «Переосмысление» self-contained — контекст собирается ВНУТРИ услуги
// (sourceText + опц. заметка из чипов), без первичного диалога/checkin. Бесплатного
// предпросмотра БОЛЬШЕ НЕТ — один платный шаг: проверяем доступ → ОДНА полноценная
// генерация (все четыре угла обязательно через LLM) → READY + списание + автосейв в
// Дневник в одной транзакции. Сессионность: GET по ?resultId=.
const postSchema = z.object({
  action: z.literal("generate"),
  sourceText: z.string().min(10).max(6000),
  contextNote: z.string().max(600).optional(),
});

function serializeResult(result: {
  id: string;
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
  const metadata = result.metadata as { sourceText?: string | null; contextNote?: string | null } | null;
  const resultText = reframeResultForDisplay(
    result.resultText,
    metadata?.sourceText ?? null,
    metadata?.contextNote ?? null,
  );
  return {
    id: result.id,
    productKey: result.productKey,
    status: result.status,
    title: result.title,
    previewText: result.previewText,
    resultText,
    saved: Boolean(result.savedAt),
    exportedAt: result.exportedAt?.toISOString() ?? null,
    deletedAt: result.deletedAt?.toISOString() ?? null,
    metadata: {
      sourceText: metadata?.sourceText ?? null,
      contextNote: metadata?.contextNote ?? null,
    },
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const resultId = request.nextUrl.searchParams.get("resultId");
  const results = await db.productResult.findMany({
    where: {
      userId,
      productKey: PRODUCT_KEY,
      deletedAt: null,
      ...(resultId ? { id: resultId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: resultId ? 1 : 20,
  });

  return jsonWithRequestContext(
    {
      hasEntitlement: await userHasActiveEntitlement(userId, PRODUCT_KEY),
      results: results.map(serializeResult),
    },
    { status: 200 },
    context,
  );
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const ipLimit = checkRequestAuthRateLimit(request, "product:reframe", 25, 5 * 60_000);
  if (!ipLimit.allowed) {
    return jsonWithRequestContext(
      { error: "Too many reframe requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      context,
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid reframe payload", 400, context);

  const { sourceText, contextNote } = parsed.data;

  // Платный шаг: без активного доступа сразу 402 (AI не вызываем) — оплата/подписка
  // открывается на странице услуги, потом клиент повторяет generate.
  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  if (!hasEntitlement) {
    return jsonWithRequestContext(
      {
        error: "Чтобы получить переосмысление, нужна оплата или активная подписка",
        code: "PAYMENT_REQUIRED",
        checkout: { productKey: PRODUCT_KEY, checkoutSource: "reframe-generate" },
      },
      { status: 402 },
      context,
    );
  }

  // Одна полноценная генерация: все четыре угла обязательно через LLM, на полном
  // тексте ситуации и заметке темы/категории (видно в суперадминке как один вызов).
  const full = await generateReframe({ sourceText, contextNote, userId, requestId: context.requestId });
  const title = buildReframeTitle(sourceText);
  const baseMetadata: Prisma.InputJsonObject = {
    source: "generate",
    sourceText,
    contextNote: contextNote ?? null,
  };

  // INC-025/B408 pattern: запись создаём, наполняем и списываем баллы + автосейв в
  // Дневник в одной транзакции (атомарно), чтобы не было «полусохранённых» разборов.
  const result = await db.$transaction(async (tx) => {
    const created = await tx.productResult.create({
      data: {
        userId,
        productKey: PRODUCT_KEY,
        status: "READY",
        title,
        previewText: buildReframePreview(sourceText),
        resultText: full.text,
        savedAt: new Date(),
        metadata: {
          ...baseMetadata,
          generationMetadata: full.metadata,
          autoSavedAt: new Date().toISOString(),
        },
      },
    });
    await consumeProductEntitlementForUse(tx, userId, PRODUCT_KEY);
    return created;
  });

  const entitledAfter = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  return jsonWithRequestContext({ hasEntitlement: entitledAfter, result: serializeResult(result), generated: true }, { status: 200 }, context);
}
