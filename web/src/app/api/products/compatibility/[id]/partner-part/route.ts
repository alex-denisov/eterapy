import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { logFraudEvent, requestFingerprint } from "@/lib/antifraud";
import { dialogueToPrivateText } from "@/lib/social-clarity";
import { assessPairPartnerRisk, socialRiskMetadata } from "@/lib/social-antiabuse";

const postSchema = z.object({
  partnerConsent: z.literal(true),
  dialogueId: z.string(),
  viaReading: z.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { id } = await params;
  const compatibility = await db.compatibility.findUnique({
    where: { id },
  });

  if (!compatibility) return errorWithRequestContext("NOT_FOUND", "Not found", 404, context);
  if (compatibility.inviteExpiresAt && compatibility.inviteExpiresAt <= new Date() && !parsed.data.viaReading) {
    return errorWithRequestContext("GONE", "Invite expired", 410, context);
  }
  if (compatibility.creatorId === userId) {
    return errorWithRequestContext("FORBIDDEN", "Creator cannot submit partner part", 403, context);
  }
  
  // Can't submit again
  if (compatibility.status !== "INVITED" && compatibility.status !== "CREATED") {
    return errorWithRequestContext("CONFLICT", "Already completed", 409, context);
  }

  const dialogue = await db.dialogue.findFirst({
    where: { id: parsed.data.dialogueId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!dialogue) return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);

  const partnerText = dialogueToPrivateText(dialogue);
  const fingerprint = requestFingerprint(request);
  const risk = assessPairPartnerRisk({
    inviteCreatedAt: compatibility.createdAt,
    creatorIpHash: compatibility.creatorIpHash,
    creatorDeviceHash: compatibility.creatorDeviceHash,
    partnerText,
    fingerprint,
  });

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.compatibility.update({
      where: { id },
      data: {
        partnerId: userId,
        partnerDialogueId: parsed.data.dialogueId,
        partnerConsent: parsed.data.partnerConsent,
        status: "PARTNER_COMPLETED",
        riskFlags: risk.riskFlags,
        riskScore: risk.riskScore,
        partnerIpHash: fingerprint.ipHash,
        partnerUserAgentHash: fingerprint.userAgentHash,
        partnerDeviceHash: fingerprint.deviceHash,
        partnerSubmittedAfterMs: risk.submittedAfterMs,
        metadata: socialRiskMetadata({
          rewardEligible: risk.rewardEligible,
          submittedAfterMs: risk.submittedAfterMs,
          moderation: risk.shouldReview ? "review" : "accepted",
        }),
      },
    });

    if (risk.shouldReview) {
      await logFraudEvent(tx, {
        subjectType: "compatibility",
        subjectId: id,
        actorUserId: userId,
        riskScore: risk.riskScore,
        riskFlags: risk.riskFlags,
        action: "pair_partner_review",
        status: "review",
        ipHash: fingerprint.ipHash,
        userAgentHash: fingerprint.userAgentHash,
        deviceHash: fingerprint.deviceHash,
        metadata: { rewardEligible: risk.rewardEligible },
      });
    }

    return row;
  });

  return jsonWithRequestContext({ result: { ...updated, viewerRole: "partner" } }, { status: 200 }, context);
}
