/**
 * B698 — кнопка «Подключить Dzen» в «Площадки и возможности».
 *
 * У Дзена нет OAuth: вход идёт через Яндекс ID с капчей и кодом из СМС, пройти
 * его может только человек. Поэтому кнопка не обменивает токен, а поднимает
 * окно живого браузера на сервисе и уводит владельца к нему.
 *
 * Маршрут РАЗРУШАЮЩИЙ по побочному действию — он поднимает браузер, — поэтому
 * он POST-подобный по смыслу, но открывается ссылкой. Ссылка помечена
 * `external` на стороне таблицы: иначе Next префетчит её и запускает браузер
 * без нажатия (класс INC-070, разобранный в B624).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { log, serializeError } from "@/lib/logger";
import { openDzenBrowserSession } from "@/lib/marketing/browser-publisher";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    await openDzenBrowserSession();
    log.info("marketing.dzen_login_window_opened", { actorId: session.user.id });
  } catch (error) {
    log.error("marketing.dzen_login_window_failed", { error: serializeError(error) });
    return NextResponse.json({
      error: "Не удалось поднять окно браузера",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 502 });
  }

  // Окно показывает проксирующий маршрут админки — прямого адреса сервиса у
  // браузера владельца нет и быть не должно: сервис слушает WireGuard, а не
  // интернет.
  return NextResponse.redirect(new URL("/admin/marketing/agent/browser", process.env.NEXTAUTH_URL ?? "https://admin.eterapy.com"));
}
