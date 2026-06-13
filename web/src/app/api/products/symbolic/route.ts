import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { userHasActiveEntitlement } from "@/lib/entitlements";
import {
  MIN_EXTENDED_MAP_ITEMS,
  buildExtendedMapTeaser,
  generateExtendedMapResult,
  getExtendedMapHistorySnapshot,
} from "@/lib/extended-map";
import { requestContextFromHeaders } from "@/lib/request-context";
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
  { productKey: "my-map" },
  { productKey: "family-scenarios" },
  { productKey: "human-design" },
] as const;

// B387/B389: family-scenarios и human-design тоже идут через этот эндпоинт.
// Раньше их не было в enum — генерация платного разбора падала на валидации.
const postSchema = z.object({
  productKey: z.enum(["tarot", "natal-chart", "numerology", "my-map", "family-scenarios", "human-design"]),
  userInput: z.string().max(4000).optional(),
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

function parseProductKey(value: string | null): SymbolicProductKey | null {
  if (!value || !isSymbolicProductKey(value)) return null;
  return value;
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const productKey = parseProductKey(request.nextUrl.searchParams.get("productKey"));
  if (!productKey) return errorWithRequestContext("INVALID_PRODUCT", "Неизвестный продукт", 400, context);

  const [hasEntitlement, results, mapHistory] = await Promise.all([
    userHasActiveEntitlement(userId, productKey),
    db.productResult.findMany({
      where: { userId, productKey, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    productKey === "my-map" ? getExtendedMapHistorySnapshot(userId) : Promise.resolve(null),
  ]);

  return jsonWithRequestContext(
    {
      productKeys: PRODUCT_KEYS,
      definitions: SYMBOLIC_PRODUCT_DEFINITIONS,
      hasEntitlement,
      results: results.map(serializeResult),
      mapItemCount: mapHistory?.itemCount,
      minMapItems: mapHistory?.minItems,
      canGenerateMap: mapHistory?.canGenerate,
      mapEmptyState: mapHistory && !mapHistory.canGenerate
        ? `Нужно ${MIN_EXTENDED_MAP_ITEMS} сохранённых элемента, сейчас ${mapHistory.itemCount}.`
        : undefined,
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
  const definition = getSymbolicProductDefinition(productKey);
  const hasEntitlement = await userHasActiveEntitlement(userId, productKey);

  if (productKey === "my-map") {
    const generated = await generateExtendedMapResult({
      userId,
      requestId: context.requestId,
    });

    if (generated.status === "insufficient_history") {
      return jsonWithRequestContext(
        {
          hasEntitlement,
          generated: false,
          insufficientHistory: true,
          itemCount: generated.itemCount,
          minItems: generated.minItems,
          missingCount: generated.missingCount,
          emptyState: generated.emptyState,
          result: null,
        },
        { status: 200 },
        context,
      );
    }

    const previewText = buildExtendedMapTeaser({
      items: generated.items,
      generatedText: generated.text,
    });
    const historyMetadata = {
      source: "history",
      sourceItemCount: generated.itemCount,
      sourceItemIds: generated.items.map((item) => item.id),
    } as Prisma.InputJsonObject;

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
              ...historyMetadata,
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
              ...historyMetadata,
              previewGenerationMetadata: generated.metadata,
            } as Prisma.InputJsonObject,
          },
        });

      return jsonWithRequestContext(
        {
          hasEntitlement,
          result: serializeResult(result),
          generated: false,
          paywalled: true,
          itemCount: generated.itemCount,
          minItems: MIN_EXTENDED_MAP_ITEMS,
        },
        { status: 200 },
        context,
      );
    }

    const result = await db.productResult.create({
      data: {
        userId,
        productKey,
        title: definition?.resultTitle ?? productKey,
        status: "READY",
        previewText,
        resultText: generated.text,
        metadata: {
          ...historyMetadata,
          generationMetadata: generated.metadata,
        } as Prisma.InputJsonObject,
      },
    });

    return jsonWithRequestContext(
      {
        hasEntitlement,
        result: serializeResult(result),
        generated: true,
        itemCount: generated.itemCount,
        minItems: MIN_EXTENDED_MAP_ITEMS,
      },
      { status: 200 },
      context,
    );
  }

  const userInput = parsed.data.userInput?.trim() || definition?.promptLabel || productKey;
  const generated = await generateSymbolicProductResult({
    productKey,
    userInput,
    userId,
    requestId: context.requestId,
  });
  const previewText = buildSymbolicProductTeaser({ productKey, userInput, generatedText: generated.text });

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

  const result = await db.productResult.create({
    data: {
      userId,
      productKey,
      title: definition?.resultTitle ?? productKey,
      status: "READY",
      previewText,
      resultText: generated.text,
      metadata: {
        userInput,
        generationMetadata: generated.metadata,
      } as Prisma.InputJsonObject,
    },
  });

  return jsonWithRequestContext(
    { hasEntitlement, result: serializeResult(result), generated: true },
    { status: 200 },
    context,
  );
}
