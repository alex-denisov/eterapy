import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { logFraudEvent, requestFingerprint } from "@/lib/antifraud";
import { requestContextFromHeaders } from "@/lib/request-context";

const postSchema = z.object({
  reason: z.string().trim().max(400).optional(),
  report: z.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { id } = await params;
  const compatibility = await db.compatibility.findUnique({ where: { id } });
  if (!compatibility) return errorWithRequestContext("NOT_FOUND", "Not found", 404, context);
  if (compatibility.creatorId === userId) {
    return errorWithRequestContext("FORBIDDEN", "Creator cannot decline own invite", 403, context);
  }
  if (compatibility.status !== "INVITED" && compatibility.status !== "CREATED") {
    return errorWithRequestContext("CONFLICT", "Invite is no longer open", 409, context);
  }

  const fingerprint = requestFingerprint(request);
  const flags = parsed.data.report ? ["partner_declined", "partner_reported"] : ["partner_declined"];
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.compatibility.update({
      where: { id },
      data: {
        partnerId: userId,
        status: parsed.data.report ? "REVIEW" : "DECLINED",
        partnerIpHash: fingerprint.ipHash,
        partnerUserAgentHash: fingerprint.userAgentHash,
        partnerDeviceHash: fingerprint.deviceHash,
        declinedAt: new Date(),
        reportedAt: parsed.data.report ? new Date() : null,
        reportedReason: parsed.data.reason ?? null,
        riskFlags: flags,
        riskScore: parsed.data.report ? 80 : 20,
      },
    });

    await logFraudEvent(tx, {
      subjectType: "compatibility",
      subjectId: id,
      actorUserId: userId,
      riskScore: row.riskScore,
      riskFlags: row.riskFlags,
      action: parsed.data.report ? "pair_invite_reported" : "pair_invite_declined",
      status: parsed.data.report ? "review" : "logged",
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      deviceHash: fingerprint.deviceHash,
      metadata: { reason: parsed.data.reason ?? null },
    });

    return row;
  });

  return jsonWithRequestContext({ ok: true, result: updated }, { status: 200 }, context);
}
