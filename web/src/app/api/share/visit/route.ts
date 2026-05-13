import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { recordChannelTouch } from "@/lib/channel-attribution";
import { recordShareVisit, setReferralCookie } from "@/lib/share-referral";
import { requestContextFromHeaders } from "@/lib/request-context";

const visitSchema = z.object({
  token: z.string().trim().min(8).max(80),
});

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const parsed = visitSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return errorWithRequestContext("VALIDATION_ERROR", "Invalid share visit payload", 400, context);
  }

  const session = await auth();
  const visit = await recordShareVisit({
    request,
    token: parsed.data.token,
    currentUserId: session?.user?.id ?? null,
  });

  if (visit.status === "missing") {
    return errorWithRequestContext("SHARE_NOT_FOUND", "Share link not found", 404, context);
  }

  await recordChannelTouch({
    request,
    userId: session?.user?.id ?? null,
    touch: {
      source: visit.shareLink.sourceType,
      channel: "share",
      entryPath: "/share",
      referralToken: visit.shareLink.token,
      entryProduct: visit.shareLink.sourceType,
      metadata: {
        topic: visit.shareLink.topic,
        sourceLabel: visit.shareLink.sourceLabel,
      },
    },
  }).catch(() => {
    // Share attribution remains best-effort and must not block public entry.
  });

  const response = jsonWithRequestContext({
    status: visit.status,
    share: {
      token: visit.shareLink.token,
      sourceType: visit.shareLink.sourceType,
      topic: visit.shareLink.topic,
      previewText: visit.shareLink.previewText,
      openedCount: visit.shareLink.openedCount + 1,
    },
  }, { status: visit.status === "blocked" ? 202 : 200 }, context);

  if (visit.status === "recorded") {
    setReferralCookie(response, visit.shareLink.token);
  }

  return response;
}
