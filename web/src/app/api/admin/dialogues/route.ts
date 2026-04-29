import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

const querySchema = z.object({
  ownerId: z.string().trim().min(1).optional(),
  guestSessionId: z.string().trim().min(1).optional(),
  status: z.enum(["OPEN", "AWAITING_USER", "PROCESSING", "ANSWERED", "ARCHIVED", "DELETED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";

  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("dialogues.view")) {
    return errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context);
  }

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return errorWithRequestContext("BAD_REQUEST", "Invalid dialogue filters", 400, context);
  }

  const limit = parsed.data.limit ?? 50;
  const dialogues = await db.dialogue.findMany({
    where: {
      deletedAt: null,
      ...(parsed.data.ownerId ? { userId: parsed.data.ownerId } : {}),
      ...(parsed.data.guestSessionId ? { guestSessionId: parsed.data.guestSessionId } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      guestSessionId: true,
      title: true,
      status: true,
      topic: true,
      difficulty: true,
      safetyLevel: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return jsonWithRequestContext({
    dialogues: dialogues.map((dialogue) => ({
      id: dialogue.id,
      ownerType: dialogue.userId ? "user" : "guest",
      ownerId: dialogue.userId ?? dialogue.guestSessionId,
      title: dialogue.title,
      status: dialogue.status,
      topic: dialogue.topic,
      difficulty: dialogue.difficulty,
      safetyLevel: dialogue.safetyLevel,
      createdAt: dialogue.createdAt.toISOString(),
      updatedAt: dialogue.updatedAt.toISOString(),
      messageCount: dialogue._count.messages,
    })),
  }, { status: 200 }, context);
}
