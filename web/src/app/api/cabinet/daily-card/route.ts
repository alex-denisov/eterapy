import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { getOrCreateDailyCard } from "@/lib/daily-card";
import { notify } from "@/lib/notifications";
import { requestContextFromHeaders } from "@/lib/request-context";
import { mainUrl } from "@/lib/subdomain";

function serialize(card: Awaited<ReturnType<typeof getOrCreateDailyCard>>["card"]) {
  return {
    id: card.id,
    title: card.title,
    body: card.body,
    prompt: card.prompt,
    cardDate: card.cardDate.toISOString(),
    sharedAt: card.sharedAt?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const { card, created } = await getOrCreateDailyCard(userId);
  return jsonWithRequestContext({ card: serialize(card), created }, { status: 200 }, context);
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const payload = await request.json().catch(() => ({}));
  const { card } = await getOrCreateDailyCard(userId);

  if (payload?.action === "notify") {
    await notify({
      userId,
      event: "DAILY_CARD",
      data: {
        title: card.title,
        body: card.body,
        prompt: card.prompt,
        shareUrl: mainUrl(`/share?from=daily-card&topic=${encodeURIComponent(card.title)}`),
      },
      requestId: context.requestId,
    });
    return jsonWithRequestContext({ card: serialize(card), notified: true }, { status: 200 }, context);
  }

  if (payload?.action === "share") {
    const updated = await db.dailyCard.update({ where: { id: card.id }, data: { sharedAt: new Date() } });
    return jsonWithRequestContext({ card: serialize(updated), shared: true }, { status: 200 }, context);
  }

  return errorWithRequestContext("VALIDATION_ERROR", "Unsupported daily card action", 400, context);
}
