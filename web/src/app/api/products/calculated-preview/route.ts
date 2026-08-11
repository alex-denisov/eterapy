import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { buildNatalEphemerisWheel, buildSynastryEphemerisWheel } from "@/lib/natal-ephemeris";
import { requestContextFromHeaders } from "@/lib/request-context";
import { drawTarotSpread, resolveTarotSpread } from "@/lib/symbolic-products";

const previewSchema = z.discriminatedUnion("productKey", [
  z.object({
    productKey: z.literal("natal-chart"),
    birthData: z.string().min(4).max(1200),
  }),
  z.object({
    productKey: z.literal("tarot"),
    userInput: z.string().max(4000).default(""),
    tarotSpread: z.enum(["one", "three", "celtic"]),
    tarotTheme: z.string().max(80),
    tarotDrawId: z.string().uuid(),
  }),
  z.object({
    productKey: z.literal("compatibility-by-date"),
    userBirthData: z.string().min(4).max(1200),
    partnerBirthData: z.string().min(4).max(1200),
  }),
]);

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const ipLimit = checkRequestAuthRateLimit(request, "product:calculated-preview", 30, 5 * 60_000);
  if (!ipLimit.allowed) {
    return jsonWithRequestContext(
      { error: "Слишком много расчётов. Попробуйте через несколько минут.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      context,
    );
  }

  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("VALIDATION_ERROR", "Проверьте данные для расчёта", 400, context);
  }

  try {
    if (parsed.data.productKey === "natal-chart") {
      return jsonWithRequestContext(
        { productKey: parsed.data.productKey, wheel: buildNatalEphemerisWheel(parsed.data.birthData) },
        { status: 200 },
        context,
      );
    }

    if (parsed.data.productKey === "compatibility-by-date") {
      return jsonWithRequestContext(
        {
          productKey: parsed.data.productKey,
          wheel: buildSynastryEphemerisWheel(parsed.data.userBirthData, parsed.data.partnerBirthData),
        },
        { status: 200 },
        context,
      );
    }

    const spread = resolveTarotSpread(parsed.data.tarotSpread);
    const seed = `${parsed.data.tarotDrawId}:${spread.key}:${parsed.data.tarotTheme}:${parsed.data.userInput.trim()}`;
    return jsonWithRequestContext(
      {
        productKey: parsed.data.productKey,
        cards: drawTarotSpread(seed, spread.positions),
        tarotSpread: { key: spread.key, label: spread.label, positions: [...spread.positions] },
        tarotTheme: parsed.data.tarotTheme,
        tarotDrawId: parsed.data.tarotDrawId,
      },
      { status: 200 },
      context,
    );
  } catch {
    return errorWithRequestContext(
      "CALCULATION_FAILED",
      parsed.data.productKey === "compatibility-by-date"
        ? "Не удалось рассчитать карту пары. Проверьте обе даты, время и город."
        : "Не удалось построить карту. Проверьте дату, время и город.",
      400,
      context,
    );
  }
}
