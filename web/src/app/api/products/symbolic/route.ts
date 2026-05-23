import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { userHasActiveEntitlement } from "@/lib/entitlements";
import { requestContextFromHeaders } from "@/lib/request-context";
import {
  SYMBOLIC_PRODUCT_DEFINITIONS,
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
] as const;

const postSchema = z.object({
  productKey: z.enum(["tarot", "natal-chart", "numerology", "my-map"]),
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

  const [hasEntitlement, results] = await Promise.all([
    userHasActiveEntitlement(userId, productKey),
    db.productResult.findMany({
      where: { userId, productKey, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
  ]);

  return jsonWithRequestContext(
    { productKeys: PRODUCT_KEYS, definitions: SYMBOLIC_PRODUCT_DEFINITIONS, hasEntitlement, results: results.map(serializeResult) },
    { status: 200 },
    context,
  );
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { productKey } = parsed.data;
  const definition = getSymbolicProductDefinition(productKey);
  const hasEntitlement = await userHasActiveEntitlement(userId, productKey);
  if (!hasEntitlement) return errorWithRequestContext("PAYMENT_REQUIRED", "Нужна оплата", 402, context);

  const userInput = parsed.data.userInput?.trim() || definition?.promptLabel || productKey;
  const generated = await generateSymbolicProductResult({
    productKey,
    userInput,
    userId,
    requestId: context.requestId,
  });

  const result = await db.productResult.create({
    data: {
      userId,
      productKey,
      title: definition?.resultTitle ?? productKey,
      status: "READY",
      previewText: userInput.slice(0, 600),
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
