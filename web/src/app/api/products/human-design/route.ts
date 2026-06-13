// B387 (M26) — бесплатный расчёт «вашего типа» в Дизайне человека.
// Тип и бодиграф считаются детерминированно по реальным эфемеридам и отдаются
// БЕСПЛАТНО (магнит + расшариваемая карточка). Платный — только глубокий разбор
// (он идёт через /api/products/symbolic с productKey=human-design). Без auth,
// но с IP-рейт-лимитом против абьюза.

import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { requestContextFromHeaders } from "@/lib/request-context";
import { computeHumanDesignFromText } from "@/lib/human-design";

const schema = z.object({ birth: z.string().min(1).max(400) });

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const limit = checkRequestAuthRateLimit(request, "product:human-design", 30, 5 * 60_000);
  if (!limit.allowed) {
    return jsonWithRequestContext(
      { error: "Слишком много запросов, попробуйте чуть позже", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      context,
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("VALIDATION_ERROR", "Неверные данные запроса", 400, context);
  }

  const { chart, parsed: birth } = computeHumanDesignFromText(parsed.data.birth);
  if (!chart) {
    return jsonWithRequestContext(
      {
        ok: false,
        needsBirthData: true,
        message: "Чтобы определить тип, укажите дату рождения с годом, а лучше — точное время и город.",
      },
      { status: 200 },
      context,
    );
  }

  return jsonWithRequestContext(
    { ok: true, chart, display: birth.display, hasExactTime: birth.hasExactTime },
    { status: 200 },
    context,
  );
}
