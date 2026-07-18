import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { authRateLimitKey, authRateLimitResponse, checkAuthRateLimit, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { ensureGuestSession } from "@/lib/guest-session";
import {
  findLinkedTelegramUser,
  issueTelegramAuthGrant,
  TelegramLaunchError,
  telegramMiniAppSsoEnabled,
  verifyTelegramInitData,
} from "@/lib/miniapp/telegram/auth";
import { log } from "@/lib/logger";
import { isSameOriginMiniAppRequest, readMiniAppInitData } from "@/lib/miniapp/telegram/request";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function POST(request: NextRequest) {
  if (!telegramMiniAppSsoEnabled()) return noStore(NextResponse.json({ error: "Telegram SSO отключён" }, { status: 404 }));
  if (!isSameOriginMiniAppRequest(request)) return noStore(NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 }));

  const ipLimit = checkRequestAuthRateLimit(request, "miniapp:telegram", 20, 5 * 60_000);
  if (!ipLimit.allowed) return noStore(authRateLimitResponse(ipLimit));

  const body = await readMiniAppInitData(request);
  if (!body.ok) return noStore(NextResponse.json({ error: body.error }, { status: body.status }));

  try {
    const launch = verifyTelegramInitData(body.initData);
    const subjectLimit = checkAuthRateLimit(authRateLimitKey("miniapp:telegram:subject", launch.subjectId), 8, 5 * 60_000);
    if (!subjectLimit.allowed) return noStore(authRateLimitResponse(subjectLimit));

    const response = NextResponse.json({ status: "guest", firstName: launch.firstName });
    ensureGuestSession(request, response);
    const linked = await findLinkedTelegramUser(launch);
    if (!linked) return noStore(response);
    if (linked.user.blockedAt || linked.user.deletedAt || linked.user.role !== "CLIENT") {
      return noStore(NextResponse.json({ error: "Аккаунт недоступен", code: "ACCOUNT_UNAVAILABLE" }, { status: 403 }));
    }

    const grant = await issueTelegramAuthGrant(launch, linked.userId);
    const linkedResponse = NextResponse.json({ status: "linked", grant, firstName: launch.firstName });
    const guestCookie = response.headers.get("set-cookie");
    if (guestCookie) linkedResponse.headers.set("set-cookie", guestCookie);
    return noStore(linkedResponse);
  } catch (error) {
    if (error instanceof TelegramLaunchError) {
      return noStore(NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "CONFIG_MISSING" ? 503 : 401 }));
    }
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code === "P2002") {
      return noStore(NextResponse.json({ error: "Этот запуск уже использован. Откройте Mini App ещё раз", code: "REPLAYED_LAUNCH" }, { status: 409 }));
    }
    log.error("miniapp.telegram_auth_failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return noStore(NextResponse.json({ error: "Не удалось проверить Telegram" }, { status: 500 }));
  }
}
