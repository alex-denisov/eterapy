import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  const { id } = await params;
  
  const result = await db.compatibility.findFirst({
    where: { id, creatorId: userId, deletedAt: null },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Compatibility not found", 404, context);
  
  await db.compatibility.update({ where: { id }, data: { status: "DELETED" } });
  return jsonWithRequestContext({ ok: true }, { status: 200 }, context);
}
