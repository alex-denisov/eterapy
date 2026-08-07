/**
 * B698 — проверка прав для nginx (`auth_request`).
 *
 * Окно браузера отдаёт nginx, а не Next: WebSocket приложение проксировать не
 * умеет. Права при этом обязан проверять тот, кто их знает, поэтому nginx перед
 * каждым запросом к `/ops/browser/` спрашивает здесь и пускает только на 204.
 *
 * Ответ намеренно пустой: nginx смотрит на код, а тело подсказывало бы
 * постороннему, существует ли маршрут вообще.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204 });
}
