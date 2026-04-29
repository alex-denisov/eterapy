import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

const detailQuerySchema = z.object({
  reason: z.string().trim().min(8).max(500),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = detailQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return errorWithRequestContext("BAD_REQUEST", "Support access reason is required", 400, context);
  }

  const { id } = await params;
  const dialogue = await db.dialogue.findFirst({
    where: {
      id,
      deletedAt: null,
    },
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
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      },
    },
  });

  if (!dialogue) {
    return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);
  }

  await logAudit(
    session.user.id,
    AUDIT_ACTIONS.DIALOGUE_SUPPORT_VIEW,
    dialogue.userId ?? dialogue.id,
    JSON.stringify({
      dialogueId: dialogue.id,
      ownerType: dialogue.userId ? "user" : "guest",
      reason: parsed.data.reason,
      requestId: context.requestId,
    }),
  );

  return jsonWithRequestContext({
    dialogue: {
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
      messages: dialogue.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    },
  }, { status: 200 }, context);
}
