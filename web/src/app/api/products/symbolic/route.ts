import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { consumeProductEntitlementForUse, userHasActiveEntitlement } from "@/lib/entitlements";
import { requestContextFromHeaders } from "@/lib/request-context";
import { dialogueTopicLabelRu } from "@/lib/dialogue-router";
import { getProductLabel } from "@/lib/billing-labels";
import { parseStrictBirthDate } from "@/lib/destiny-matrix";
import { canResolveAstrologicalLocation } from "@/lib/natal-ephemeris";
import { classifyProductSafety } from "@/lib/product-safety";
import {
  SYMBOLIC_PRODUCT_DEFINITIONS,
  buildSymbolicProductTeaser,
  generateSymbolicProductResult,
  getSymbolicProductDefinition,
  isSymbolicProductKey,
  type SymbolicProductKey,
} from "@/lib/symbolic-products";

const PRODUCT_KEYS = [
  { productKey: "tarot" },
  { productKey: "natal-chart" },
  { productKey: "numerology" },
  { productKey: "family-questions" },
  { productKey: "human-design" },
  { productKey: "surname-origin" },
  { productKey: "horoscope" },
  { productKey: "arcana" },
] as const;

// B387/B389: family-scenarios и human-design тоже идут через этот эндпоинт.
// Раньше их не было в enum — генерация платного разбора падала на валидации.
const postSchema = z.object({
  productKey: z.enum(["tarot", "natal-chart", "numerology", "family-questions", "human-design", "surname-origin", "horoscope", "arcana"]),
  userInput: z.string().max(4000).optional(),
  tarotSpread: z.enum(["one", "three", "celtic"]).optional(),
  tarotTheme: z.string().max(80).optional(),
  tarotDrawId: z.string().uuid().optional(),
});

// B450: натальная карта переведена на платный-только флоу (нет бесплатного
// фрагмента), с автосейвом результата в Дневник и обязательным LLM-результатом.
// Наборы расширяются по мере миграции остальных символических услуг на паттерн Таро.
const PAYWALL_ONLY_PRODUCTS = new Set<SymbolicProductKey>(["natal-chart", "numerology", "human-design", "surname-origin", "family-questions", "horoscope", "arcana", "tarot"]);
const AUTOSAVE_PRODUCTS = new Set<SymbolicProductKey>(["tarot", "natal-chart", "numerology", "human-design", "surname-origin", "family-questions", "horoscope", "arcana"]);
const MANDATORY_LLM_PRODUCTS = new Set<SymbolicProductKey>(["tarot", "natal-chart", "numerology", "human-design", "surname-origin", "family-questions", "horoscope", "arcana"]);

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

function parseProductKey(value: string | null): SymbolicProductKey | null {
  if (!value || !isSymbolicProductKey(value)) return null;
  return value;
}

// B512 R1-11 — компактная история тем клиента для «Семейных вопросов»:
// доминирующие темы его вопросов + заголовки последних готовых разборов.
// Только первопартийные данные самого клиента; ошибки БД не валят генерацию.
async function buildFamilyClientContext(userId: string): Promise<string | undefined> {
  try {
    const [topicGroups, recentResults] = await Promise.all([
      db.dialogue.groupBy({
        by: ["topic"],
        where: { userId, deletedAt: null, topic: { not: null } },
        _count: { _all: true },
      }),
      db.productResult.findMany({
        where: { userId, deletedAt: null, status: "READY", productKey: { not: "family-questions" } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { title: true, productKey: true },
      }),
    ]);
    const topics = topicGroups
      .filter((group) => group.topic)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 5)
      .map((group) => `${dialogueTopicLabelRu(group.topic)} × ${group._count._all}`);
    const results = recentResults.map((result) => `«${result.title}» (${getProductLabel(result.productKey) || result.productKey})`);
    if (topics.length === 0 && results.length === 0) return undefined;
    return [
      "ИСТОРИЯ ТЕМ КЛИЕНТА НА ПЛАТФОРМЕ (его собственные вопросы и разборы; используй как контекст повторов и явно связывай карту рода с этими темами, но не цитируй дословно и не выдавай за семейные факты):",
      topics.length > 0 ? `Темы вопросов: ${topics.join("; ")}.` : "",
      results.length > 0 ? `Недавние разборы: ${results.join("; ")}.` : "",
    ].filter(Boolean).join("\n");
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const productKey = parseProductKey(request.nextUrl.searchParams.get("productKey"));
  if (!productKey) return errorWithRequestContext("INVALID_PRODUCT", "Неизвестный продукт", 400, context);

  const [hasEntitlement, results] = await Promise.all([
    userHasActiveEntitlement(userId, productKey),
    db.productResult.findMany({
      where: { userId, productKey, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
  ]);

  return jsonWithRequestContext(
    {
      productKeys: PRODUCT_KEYS,
      definitions: SYMBOLIC_PRODUCT_DEFINITIONS,
      hasEntitlement,
      results: results.map(serializeResult),
    },
    { status: 200 },
    context,
  );
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const ipLimit = checkRequestAuthRateLimit(request, "product:symbolic", 20, 5 * 60_000);
  if (!ipLimit.allowed) {
    return jsonWithRequestContext(
      { error: "Too many symbolic product requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      context,
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { productKey } = parsed.data;
  const rawInput = parsed.data.userInput?.trim() ?? "";
  if ((productKey === "numerology" || productKey === "arcana") && !parseStrictBirthDate(rawInput)) {
    return errorWithRequestContext("VALIDATION_ERROR", "Укажите полную корректную дату рождения в формате ДД.ММ.ГГГГ", 400, context);
  }
  if (productKey === "horoscope" && (!/Вопрос:\s*\S/iu.test(rawInput) || !/Место:\s*\S/iu.test(rawInput))) {
    return errorWithRequestContext("VALIDATION_ERROR", "Для гороскопа нужны один точный вопрос и текущее место", 400, context);
  }
  if (productKey === "horoscope" && !canResolveAstrologicalLocation(rawInput)) {
    return errorWithRequestContext(
      "LOCATION_NOT_RESOLVED",
      "Не удалось однозначно определить место. Выберите населённый пункт из подсказок «город, регион» или укажите координаты в формате 55.7558, 37.6173.",
      400,
      context,
    );
  }
  const safety = await classifyProductSafety({
    text: rawInput,
    productKey,
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
  const definition = getSymbolicProductDefinition(productKey);
  const hasEntitlement = await userHasActiveEntitlement(userId, productKey);

  // B450: платный-только продукт без доступа — сразу 402, без генерации бесплатного
  // фрагмента. Один платный шаг даёт полный результат (как у Таро/reframe).
  if (PAYWALL_ONLY_PRODUCTS.has(productKey) && !hasEntitlement) {
    return errorWithRequestContext(
      "PAYMENT_REQUIRED",
      "Откройте разбор баллами или картой — результат появится здесь же.",
      402,
      context,
    );
  }

  const fixedAt = productKey === "horoscope" ? new Date() : null;
  const userInput = productKey === "horoscope"
    ? `${rawInput}\nМомент фиксации UTC: ${fixedAt!.toISOString()}`
    : rawInput || definition?.promptLabel || productKey;
  const tarotRequestMeta: Prisma.InputJsonObject = {
    ...(productKey === "tarot" && parsed.data.tarotSpread ? { tarotSpread: parsed.data.tarotSpread } : {}),
    ...(productKey === "tarot" && parsed.data.tarotTheme ? { tarotTheme: parsed.data.tarotTheme } : {}),
    ...(fixedAt ? { fixedAt: fixedAt.toISOString() } : {}),
  };
  // B512 R1-11 — «Семейные вопросы» активируются платформой по истории тем
  // клиента, поэтому карта рода ОБЯЗАНА опираться на его прошлые вопросы и
  // разборы. Передаём компактную первопартийную сводку в системный промт.
  const clientContextNote = productKey === "family-questions"
    ? await buildFamilyClientContext(userId)
    : undefined;

  const generated = await generateSymbolicProductResult({
    productKey,
    userInput,
    userId,
    requestId: context.requestId,
    tarotSpread: parsed.data.tarotSpread,
    tarotTheme: parsed.data.tarotTheme,
    tarotDrawId: parsed.data.tarotDrawId,
    clientContextNote,
  });
  const previewText = buildSymbolicProductTeaser({ productKey, userInput, generatedText: generated.text });

  // B450/B554: для услуг с обязательным LLM-результатом (нет осмысленного
  // детерминированного фолбэка) не сохраняем эвристику. К этому моменту доступ
  // уже открыт отдельной покупкой, поэтому он остаётся активным для повтора.
  if (MANDATORY_LLM_PRODUCTS.has(productKey) && (generated.metadata as { source?: string }).source !== "ai") {
    return errorWithRequestContext(
      "AI_UNAVAILABLE",
      "Не получилось собрать разбор — попробуйте ещё раз. Доступ сохранён, повторно платить не нужно.",
      503,
      context,
    );
  }

  if (!hasEntitlement) {
    const existingPreview = await db.productResult.findFirst({
      where: { userId, productKey, status: "PREVIEW", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const result = existingPreview
      ? await db.productResult.update({
        where: { id: existingPreview.id },
        data: {
          title: definition?.resultTitle ?? productKey,
          previewText,
          metadata: {
            userInput,
            ...tarotRequestMeta,
            previewGenerationMetadata: generated.metadata,
          } as Prisma.InputJsonObject,
        },
      })
      : await db.productResult.create({
        data: {
          userId,
          productKey,
          title: definition?.resultTitle ?? productKey,
          status: "PREVIEW",
          previewText,
          metadata: {
            userInput,
            ...tarotRequestMeta,
            previewGenerationMetadata: generated.metadata,
          } as Prisma.InputJsonObject,
        },
      });

    return jsonWithRequestContext(
      { hasEntitlement, result: serializeResult(result), generated: false, paywalled: true },
      { status: 200 },
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
        productKey,
        title: definition?.resultTitle ?? productKey,
        status: "READY",
        previewText,
        resultText: generated.text,
        // #6/B450: автосейв в Дневник (savedAt → попадает в фид diary.ts) для услуг
        // из AUTOSAVE_PRODUCTS (tarot, natal-chart, …). Остальные пока — вручную.
        ...(AUTOSAVE_PRODUCTS.has(productKey) ? { savedAt: new Date() } : {}),
        metadata: {
          userInput,
          ...tarotRequestMeta,
          generationMetadata: generated.metadata,
        } as Prisma.InputJsonObject,
      },
    });
    await consumeProductEntitlementForUse(tx, userId, productKey);
    return saved;
  });

  // Reflect the post-consume state so the client paywalls the NEXT разбор.
  const entitledAfter = await userHasActiveEntitlement(userId, productKey);
  return jsonWithRequestContext(
    { hasEntitlement: entitledAfter, result: serializeResult(result), generated: true },
    { status: 200 },
    context,
  );
}
