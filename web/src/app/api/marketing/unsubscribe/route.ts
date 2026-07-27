/**
 * B599 · Исполнение отписки.
 *
 * Только POST: по ссылке из письма ходят почтовые клиенты и сканеры сами, и
 * отписка на GET сработала бы без человека (INC-070 — ровно так предзагрузка
 * <Link> разлогинивала людей).
 *
 * Ответ одинаков и для валидного, и для чужого токена: страница отписки
 * публичная, и разный ответ превратил бы её в проверку «существует ли такой
 * пользователь».
 */

import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { parseUnsubscribeToken } from "@/lib/marketing/unsubscribe";

export async function POST(request: Request) {
  let token: unknown = null;
  try {
    const payload = (await request.json()) as { token?: unknown };
    token = payload?.token ?? null;
  } catch {
    token = null;
  }

  const userId = typeof token === "string" ? parseUnsubscribeToken(token) : null;
  if (!userId) {
    log.warn("marketing.unsubscribe_bad_token", {});
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Отписка идемпотентна: повторный заход по той же ссылке не должен падать и
  // не должен сдвигать дату — она отвечает на вопрос «когда человек отказался».
  await db.user.updateMany({
    where: { id: userId, marketingOptOutAt: null },
    data: { marketingOptOutAt: new Date() },
  });

  log.info("marketing.unsubscribed", { userId });
  return NextResponse.json({ ok: true });
}
