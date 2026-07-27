// B391 (M26) — бесплатная короткая «история фамилии» (магнит + расшариваемая
// карточка). История считается ДЕТЕРМИНИРОВАННО по форме фамилии (surname-story.ts),
// без AI-вызова — поэтому эндпоинт безопасен без auth (нет стоимости даже при
// абьюзе), но всё равно с IP-рейт-лимитом. Платный «родовой разбор» идёт через
// /api/products/symbolic с productKey=surname-story.

import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { requestContextFromHeaders } from "@/lib/request-context";
import { analyzeSurname } from "@/lib/surname-story";

const schema = z.object({ surname: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const limit = checkRequestAuthRateLimit(request, "product:surname-story", 30, 5 * 60_000);
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

  const story = analyzeSurname(parsed.data.surname);
  if (!story) {
    return jsonWithRequestContext(
      {
        ok: false,
        needsSurname: true,
        message: "Напишите свою фамилию — например «Кузнецов» или «Ковальчук».",
      },
      { status: 200 },
      context,
    );
  }

  return jsonWithRequestContext({ ok: true, story }, { status: 200 }, context);
}
