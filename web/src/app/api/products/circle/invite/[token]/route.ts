import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  const { token } = await params;

  const circle = await db.clarityCircle.findUnique({
    where: { inviteToken: token },
    include: { participants: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } } },
  });

  if (!circle || circle.status === "DELETED") return errorWithRequestContext("NOT_FOUND", "Invite not found", 404, context);
  if (circle.inviteExpiresAt <= new Date()) return errorWithRequestContext("GONE", "Invite expired", 410, context);

  const alreadySubmitted = userId
    ? circle.participants.some((participant) => participant.userId === userId)
    : false;

  return jsonWithRequestContext({ result: circle, alreadySubmitted }, { status: 200 }, context);
}
