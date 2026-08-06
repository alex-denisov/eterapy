/**
 * B678 — карта дня Таро для кабинета.
 *
 * Отдельный маршрут рядом с `/api/cabinet/daily-card`, а не ветка внутри него:
 * тот отвечает за «Ежедневную практику» (вопрос дня, взгляд, шаг, серия) и
 * пишет в `daily_cards`. Карта Таро ничего в базе пользователя не заводит —
 * она детерминированно вычисляется, а её трактовка кэшируется по КАРТЕ на всех
 * (`tarot-day-content.ts`). Свести их в один маршрут значило бы, что открытие
 * первого экрана кабинета заводит запись практики — ровно то, от чего ушёл
 * B602.
 *
 * Здесь генерация РАЗРЕШЕНА: страница уже отрисовала карту детерминированным
 * текстом, поэтому ожидание модели никого не держит, а результат ложится в кэш
 * и достаётся всем остальным.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { requestContextFromHeaders } from "@/lib/request-context";
import { getTarotDayInterpretation } from "@/lib/tarot-day-content";
import { tarotDayPick } from "@/lib/tarot-day";

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const pick = tarotDayPick(userId);
  const { interpretation, source } = await getTarotDayInterpretation(pick);

  return jsonWithRequestContext(
    {
      card: {
        key: pick.key,
        name: pick.card.name,
        reversed: pick.reversed,
        arcana: pick.card.arcana,
        dayKey: pick.dayKey,
        imageUrl: `/api/cards/day/${pick.key}`,
      },
      interpretation,
      source,
    },
    { status: 200 },
    context,
  );
}

const visibilitySchema = z.object({ visible: z.boolean() });

/**
 * B681 — «показывать: вкл/выкл».
 *
 * Крестик на блоке шлёт сюда `{"visible": false}`. Обратно включает только
 * экран «Настройки → Уведомления» (через `/api/notifications/preferences`), но
 * маршрут принимает и `true`: держать одностороннюю запись значило бы, что
 * состояние можно загнать в угол одним запросом и не вынуть.
 */
export async function PATCH(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = visibilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("INVALID_PAYLOAD", "Ожидается { visible: boolean }", 400, context);
  }

  await db.user.update({
    where: { id: userId },
    data: { tarotDayHidden: !parsed.data.visible },
  });

  return jsonWithRequestContext({ ok: true, visible: parsed.data.visible }, { status: 200 }, context);
}
