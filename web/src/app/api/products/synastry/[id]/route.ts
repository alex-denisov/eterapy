import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";

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
      productKey: "synastry",
      deletedAt: null,
    },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);

  const updated = await db.productResult.update({
    where: { id: result.id },
    data: { savedAt: result.savedAt ?? new Date() },
  });
  return jsonWithRequestContext({ result: serialize(updated) }, { status: 200 }, context);
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
      productKey: "synastry",
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
