import { ImageResponse } from "next/og";
import { TrendChart } from "@/lib/marketing/orchestrator-chart";
import {
  TREND_CHART_HEIGHT,
  TREND_CHART_WIDTH,
  verifyTrendPayload,
} from "@/lib/marketing/orchestrator-chart-sign";

export const runtime = "nodejs";

/**
 * B746 — картинка тренда для отчёта оркестратора.
 *
 * Рисует ТОЛЬКО подписанную нагрузку (HMAC на `AUTH_SECRET`): без подписи
 * маршрут был бы публичным рендер-сервисом. Базу не читает — ряд собирает
 * оркестратор, здесь он только превращается в PNG.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = verifyTrendPayload(url.searchParams.get("d"), url.searchParams.get("s"));
  if (!payload) return new Response("Forbidden", { status: 403 });
  return new ImageResponse(<TrendChart payload={payload} />, {
    width: TREND_CHART_WIDTH,
    height: TREND_CHART_HEIGHT,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
