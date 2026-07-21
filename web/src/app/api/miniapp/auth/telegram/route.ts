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
import {
  createLaunchSessionCookieValue,
  MINIAPP_LAUNCH_COOKIE,
  MINIAPP_LAUNCH_TTL_SECONDS,
} from "@/lib/miniapp/telegram/launch-session";
import { isSameOriginMiniAppRequest, readMiniAppInitData } from "@/lib/miniapp/telegram/request";
import { stagingTelegramAccessDenied } from "@/lib/miniapp/staging-allowlist";
import type { VerifiedTelegramLaunch } from "@/lib/miniapp/telegram/auth";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

/**
 * B554 п.6: подпись `initData` проверена — закрепляем личность запуска в
 * короткоживущей куке, чтобы поздние действия (связать аккаунт) не
 * переотправляли просроченный `initData`.
 */
function attachLaunchSession(response: NextResponse, launch: VerifiedTelegramLaunch) {
  response.cookies.set(MINIAPP_LAUNCH_COOKIE, createLaunchSessionCookieValue({
    provider: "telegram",
    subjectId: launch.subjectId,
    username: launch.username,
    firstName: launch.firstName,
    lastName: launch.lastName,
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MINIAPP_LAUNCH_TTL_SECONDS,
  });
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

    // B554 (owner: «скрой stage-бота из поиска»). Из поиска Telegram бота убрать
    // нельзя — такой настройки не существует. Закрываем вход: на стенде, где
    // задан список, посторонний не попадает в базу, почасово скопированную с
    // прода. На проде переменная не задана и проверка не действует.
    if (stagingTelegramAccessDenied(launch.subjectId, launch.username)) {
      log.warn("miniapp.telegram_auth_not_allowlisted", { subjectId: launch.subjectId });
      return noStore(NextResponse.json({
        error: "Это тестовый стенд ETerapy, вход только для команды. Рабочий бот — @eterapy_bot",
        code: "NOT_ALLOWLISTED",
      }, { status: 403 }));
    }

    const linked = await findLinkedTelegramUser(launch);
    if (linked && (linked.user.blockedAt || linked.user.deletedAt || linked.user.role !== "CLIENT")) {
      return noStore(NextResponse.json({ error: "Аккаунт недоступен", code: "ACCOUNT_UNAVAILABLE" }, { status: 403 }));
    }

    // B554: раньше «linked»-ветка строила ВТОРОЙ ответ и переносила куки через
    // headers.get("set-cookie"), который отдаёт только первую из них. С двумя
    // куками (гостевая + launch) это молча теряло одну. Ответ теперь один.
    const grant = linked ? await issueTelegramAuthGrant(launch, linked.userId) : null;
    const response = grant
      ? NextResponse.json({ status: "linked", grant, firstName: launch.firstName })
      : NextResponse.json({ status: "guest", firstName: launch.firstName });
    ensureGuestSession(request, response);
    attachLaunchSession(response, launch);
    return noStore(response);
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
