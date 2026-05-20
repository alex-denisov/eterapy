import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import {
  CHANNEL_ATTRIBUTION_COOKIE,
  channelVisitorHash,
  recordChannelTouch,
} from "@/lib/channel-attribution";
import { requestContextFromHeaders } from "@/lib/request-context";

const touchSchema = z.object({
  source: z.string().max(160).optional().nullable(),
  channel: z.string().max(160).optional().nullable(),
  entryPath: z.string().min(1).max(500),
  utmSource: z.string().max(160).optional().nullable(),
  utmMedium: z.string().max(160).optional().nullable(),
  utmCampaign: z.string().max(160).optional().nullable(),
  utmContent: z.string().max(160).optional().nullable(),
  utmTerm: z.string().max(160).optional().nullable(),
  referralToken: z.string().max(160).optional().nullable(),
  practitionerId: z.string().max(160).optional().nullable(),
  practitionerSlug: z.string().max(160).optional().nullable(),
  partnerId: z.string().max(160).optional().nullable(),
  widgetId: z.string().max(160).optional().nullable(),
  entryProduct: z.string().max(160).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const parsed = touchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("VALIDATION_ERROR", "Invalid attribution payload", 400, context);
  }

  const session = await auth();
  const visitorHash = channelVisitorHash(request);
  let recorded = true;

  try {
    await recordChannelTouch({
      request,
      userId: session?.user?.id ?? null,
      touch: parsed.data,
    });
  } catch (error) {
    recorded = false;
    console.warn("[attribution] channel touch skipped", {
      requestId: context.requestId,
      error: error instanceof Error ? error.message : "Unknown attribution error",
    });
  }

  const response = jsonWithRequestContext({ ok: true, recorded }, { status: recorded ? 200 : 202 }, context);
  response.cookies.set(CHANNEL_ATTRIBUTION_COOKIE, visitorHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return response;
}
