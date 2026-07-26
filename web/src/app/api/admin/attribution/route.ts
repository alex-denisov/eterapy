/**
 * GET /api/admin/attribution?userId=…
 *
 * B597 (владелец 2026-07-27): «в информации о регистрации нужна ссылка, по
 * которой он перешёл на регистрацию — чтобы понимать источник».
 *
 * Данные уже собирались (`ChannelAttribution`: первое касание, UTM-метки,
 * реферальный токен, практик, партнёр), но нигде не показывались — на проде
 * лежат 187 записей, из них 36 связаны с пользователями, и увидеть их можно
 * было только запросом в базу. Здесь они отдаются карточке пользователя.
 *
 * Отдаётся ПЕРВОЕ касание, а не последнее: вопрос «откуда он взялся» — про
 * то, что привело человека на платформу, а не про то, откуда он зашёл вчера.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!["ADMIN", "SUPERADMIN"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
  }

  const attribution = await db.channelAttribution.findFirst({
    where: { userId },
    orderBy: { firstTouchAt: "asc" },
    select: {
      source: true,
      channel: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmContent: true,
      utmTerm: true,
      referralToken: true,
      practitionerSlug: true,
      partnerId: true,
      widgetId: true,
      entryProduct: true,
      firstEntryPath: true,
      lastEntryPath: true,
      firstTouchAt: true,
      lastTouchAt: true,
      conversionType: true,
      conversionAt: true,
    },
  });

  return NextResponse.json({ attribution });
}
