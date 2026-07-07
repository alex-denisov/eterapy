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
  
  // Anyone with token can fetch its basic status (to know if it's still open)
  const result = await db.compatibility.findUnique({
    where: { inviteToken: token },
  });

  if (!result) return errorWithRequestContext("NOT_FOUND", "Invite not found", 404, context);
  if (result.inviteExpiresAt && result.inviteExpiresAt <= new Date()) {
    return errorWithRequestContext("GONE", "Invite expired", 410, context);
  }

  // If partner is already set and it's not this user, forbid
  if (result.partnerId && result.partnerId !== userId) {
    return errorWithRequestContext("FORBIDDEN", "Invite already claimed", 403, context);
  }
  const viewerRole =
    result.creatorId === userId ? "creator" : result.partnerId === userId ? "partner" : "invitee";

  return jsonWithRequestContext({ result: { ...result, viewerRole } }, { status: 200 }, context);
}
