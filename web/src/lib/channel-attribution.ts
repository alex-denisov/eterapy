import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { visitorHashFromRequest } from "@/lib/share-referral";

export const CHANNEL_ATTRIBUTION_COOKIE = "eterapy_channel";

const MAX_FIELD = 160;

export interface ChannelTouchInput {
  source?: string | null;
  channel?: string | null;
  entryPath: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  referralToken?: string | null;
  practitionerId?: string | null;
  practitionerSlug?: string | null;
  partnerId?: string | null;
  widgetId?: string | null;
  entryProduct?: string | null;
  metadata?: Prisma.InputJsonObject;
}

function clean(value?: string | null, fallback?: string) {
  const raw = value?.trim() || fallback || "";
  return raw.replace(/[^\p{L}\p{N}_:/?.=&%#.-]+/gu, "-").slice(0, MAX_FIELD) || null;
}

function touchSource(input: ChannelTouchInput) {
  return clean(input.source)
    ?? clean(input.utmSource)
    ?? (input.referralToken ? "referral" : null)
    ?? (input.practitionerId || input.practitionerSlug ? "practitioner" : null)
    ?? (input.widgetId ? "widget" : null)
    ?? "direct";
}

function touchChannel(input: ChannelTouchInput) {
  return clean(input.channel)
    ?? clean(input.utmMedium)
    ?? (input.referralToken ? "share" : null)
    ?? "web";
}

export function channelVisitorHash(request: NextRequest) {
  return request.cookies.get(CHANNEL_ATTRIBUTION_COOKIE)?.value ?? visitorHashFromRequest(request);
}

export async function recordChannelTouch(input: {
  request: NextRequest;
  userId?: string | null;
  touch: ChannelTouchInput;
}) {
  const visitorHash = channelVisitorHash(input.request);
  const now = new Date();
  const source = touchSource(input.touch);
  const channel = touchChannel(input.touch);
  const entryPath = clean(input.touch.entryPath, "/") ?? "/";

  return db.channelAttribution.upsert({
    where: { visitorHash },
    create: {
      visitorHash,
      userId: input.userId ?? null,
      source,
      channel,
      utmSource: clean(input.touch.utmSource),
      utmMedium: clean(input.touch.utmMedium),
      utmCampaign: clean(input.touch.utmCampaign),
      utmContent: clean(input.touch.utmContent),
      utmTerm: clean(input.touch.utmTerm),
      referralToken: clean(input.touch.referralToken),
      practitionerId: clean(input.touch.practitionerId),
      practitionerSlug: clean(input.touch.practitionerSlug),
      partnerId: clean(input.touch.partnerId),
      widgetId: clean(input.touch.widgetId),
      entryProduct: clean(input.touch.entryProduct),
      firstEntryPath: entryPath,
      lastEntryPath: entryPath,
      firstTouchAt: now,
      lastTouchAt: now,
      metadata: input.touch.metadata,
    },
    update: {
      userId: input.userId ?? undefined,
      source,
      channel,
      utmSource: clean(input.touch.utmSource),
      utmMedium: clean(input.touch.utmMedium),
      utmCampaign: clean(input.touch.utmCampaign),
      utmContent: clean(input.touch.utmContent),
      utmTerm: clean(input.touch.utmTerm),
      referralToken: clean(input.touch.referralToken),
      practitionerId: clean(input.touch.practitionerId),
      practitionerSlug: clean(input.touch.practitionerSlug),
      partnerId: clean(input.touch.partnerId),
      widgetId: clean(input.touch.widgetId),
      entryProduct: clean(input.touch.entryProduct),
      lastEntryPath: entryPath,
      lastTouchAt: now,
      metadata: input.touch.metadata,
    },
  });
}

export async function markChannelConversion(input: {
  request: NextRequest;
  userId?: string | null;
  conversionType: string;
  conversionId?: string | null;
}) {
  const visitorHash = channelVisitorHash(input.request);
  return db.channelAttribution.updateMany({
    where: { visitorHash },
    data: {
      userId: input.userId ?? undefined,
      conversionAt: new Date(),
      conversionType: clean(input.conversionType, "conversion"),
      conversionId: clean(input.conversionId),
    },
  });
}
