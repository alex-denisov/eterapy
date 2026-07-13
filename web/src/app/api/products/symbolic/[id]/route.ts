import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";

const SYMBOLIC_PRODUCT_KEYS = ["tarot", "natal-chart", "numerology", "family-scenarios", "human-design", "surname-story", "horary", "tarot-numerology"] as const;

const patchSchema = z.object({ action: z.enum(["save"]) });

function serialize(result: {
  id: string;
  productKey: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  savedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: result.id,
    productKey: result.productKey,
    status: result.status,
    title: result.title,
    previewText: result.previewText,
    resultText: result.resultText,
    saved: Boolean(result.savedAt),
    deletedAt: result.deletedAt?.toISOString() ?? null,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}

// #1: fetch ONE result by id (with metadata) — used to restore a tarot reading
// from the ?reading=<id> URL param so the session is scoped to that URL (back/
// forward restore it) instead of auto-loading the last DB result forever.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  const { id } = await params;
  const expectedProductKey = request.nextUrl.searchParams.get("productKey");
  if (expectedProductKey && !SYMBOLIC_PRODUCT_KEYS.includes(expectedProductKey as (typeof SYMBOLIC_PRODUCT_KEYS)[number])) {
    return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);
  }
  const productKey = expectedProductKey as (typeof SYMBOLIC_PRODUCT_KEYS)[number] | null;
  const result = await db.productResult.findFirst({
    where: {
      id,
      userId,
      productKey: productKey ?? { in: [...SYMBOLIC_PRODUCT_KEYS] },
      deletedAt: null,
    },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);
  return jsonWithRequestContext(
    {
      result: {
        id: result.id,
        productKey: result.productKey,
        status: result.status,
        title: result.title,
        previewText: result.previewText,
        resultText: result.resultText,
        saved: Boolean(result.savedAt),
        metadata: result.metadata,
      },
    },
    { status: 200 },
    context,
  );
}

// B308/B451/B500: PATCH /api/products/symbolic/[id] — "save to diary" affordance for
// tarot / natal-chart / numerology / HD / surname / family. Spec requires
// every symbolic result to be saveable into the user's personal diary.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid action", 400, context);

  const { id } = await params;
  const result = await db.productResult.findFirst({
    where: {
      id,
      userId,
      productKey: { in: [...SYMBOLIC_PRODUCT_KEYS] },
      deletedAt: null,
    },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);

  if (parsed.data.action === "save") {
    // Idempotent: setting savedAt twice is safe — keeps the first save time.
    const updated = await db.productResult.update({
      where: { id: result.id },
      data: { savedAt: result.savedAt ?? new Date() },
    });
    return jsonWithRequestContext({ result: serialize(updated) }, { status: 200 }, context);
  }

  return errorWithRequestContext("VALIDATION_ERROR", "Unsupported action", 400, context);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  const { id } = await params;
  const result = await db.productResult.findFirst({
    where: {
      id,
      userId,
      productKey: { in: [...SYMBOLIC_PRODUCT_KEYS] },
      deletedAt: null,
    },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);

  await db.productResult.update({
    where: { id: result.id },
    data: { deletedAt: new Date() },
  });
  return jsonWithRequestContext({ ok: true }, { status: 200 }, context);
}
