import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";

const patchSchema = z.object({
  action: z.enum(["pause", "resume"]),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { id } = await params;
  const route = await db.clarityRoute.findUnique({
    where: { id },
  });

  if (!route || route.userId !== userId) {
    return errorWithRequestContext("NOT_FOUND", "Route not found", 404, context);
  }

  if (route.status === "COMPLETED" || route.status === "CANCELLED") {
    return errorWithRequestContext("CONFLICT", "Route is no longer active", 409, context);
  }

  const newStatus = parsed.data.action === "pause" ? "PAUSED" : "ACTIVE";

  const updated = await db.clarityRoute.update({
    where: { id },
    data: { status: newStatus },
  });

  return jsonWithRequestContext({ result: updated }, { status: 200 }, context);
}
