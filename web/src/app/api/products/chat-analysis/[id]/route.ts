import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";

const PRODUCT_KEY = "chat-analysis";

const patchSchema = z.object({ action: z.enum(["save", "delete_source"]) });

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
  metadata: Prisma.JsonValue;
}) {
  const metadata = result.metadata as { sourceText?: string | null; sourceDeletedAt?: string | null } | null;
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
    metadata: {
      sourceText: metadata?.sourceDeletedAt ? null : metadata?.sourceText, // Hide source if deleted
      sourceDeletedAt: metadata?.sourceDeletedAt ?? null,
    },
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  const { id } = await params;
  const result = await db.productResult.findFirst({ where: { id, userId, productKey: PRODUCT_KEY, deletedAt: null } });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);
  return jsonWithRequestContext({ result: serialize(result) }, { status: 200 }, context);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid action", 400, context);
  const { id } = await params;
  
  const result = await db.productResult.findFirst({
    where: { id, userId, productKey: PRODUCT_KEY, deletedAt: null },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);
  
  if (parsed.data.action === "delete_source") {
    const metadata = result.metadata as { sourceText?: string | null; sourceDeletedAt?: string | null } | null;
    if (metadata?.sourceDeletedAt) return jsonWithRequestContext({ result: serialize(result) }, { status: 200 }, context); // Already deleted
    
    // We update metadata to include sourceDeletedAt and remove sourceText to save space/privacy.
    const updatedMetadata = {
      ...(metadata ?? {}),
      sourceText: null, // Nullify raw text
      sourceDeletedAt: new Date().toISOString(),
    };
    
    const updated = await db.productResult.update({
      where: { id },
      data: { metadata: updatedMetadata },
    });
    return jsonWithRequestContext({ result: serialize(updated) }, { status: 200 }, context);
  }

  // default: action === "save"
  if (result.status !== "READY") return errorWithRequestContext("CONFLICT", "Можно сохранить только готовый результат", 409, context);
  const updated = await db.productResult.update({ where: { id }, data: { savedAt: new Date() } });
  return jsonWithRequestContext({ result: serialize(updated) }, { status: 200 }, context);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  const { id } = await params;
  const result = await db.productResult.findFirst({
    where: { id, userId, productKey: PRODUCT_KEY, deletedAt: null },
    select: { id: true },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);
  await db.productResult.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date() } });
  return jsonWithRequestContext({ ok: true }, { status: 200 }, context);
}
