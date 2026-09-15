/**
 * B746 — подпись нагрузки графика тренда. Чистый TS без JSX: этот файл
 * импортирует и воркер (`tsx`), и маршрут сайта; компонент картинки живёт в
 * `orchestrator-chart.tsx` и нужен только маршруту.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { TrendDay, WeekDelta } from "@/lib/marketing/orchestrator-trend";

export const TREND_CHART_WIDTH = 1200;
export const TREND_CHART_HEIGHT = 720;

export interface TrendChartPayload {
  /** Момент сборки, ISO — в подпись и в подпись картинки. */
  at: string;
  days: Array<Pick<TrendDay, "day" | "posts" | "distinctTitles" | "views" | "seoPages" | "impressions" | "clicks">>;
  weeks: Array<Pick<WeekDelta, "label" | "current" | "previous" | "better" | "unit">>;
}

function secret(): string | null {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? null;
}

function encode(payload: TrendChartPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function signTrendPayload(payload: TrendChartPayload): { d: string; s: string } | null {
  const key = secret();
  if (!key) return null;
  const d = encode(payload);
  const s = createHmac("sha256", key).update(`orchestrator-trend:${d}`).digest("hex");
  return { d, s };
}

export function verifyTrendPayload(d: string | null, s: string | null): TrendChartPayload | null {
  const key = secret();
  if (!key || !d || !s) return null;
  const expected = createHmac("sha256", key).update(`orchestrator-trend:${d}`).digest("hex");
  const given = Buffer.from(s, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(d, "base64url").toString("utf8")) as TrendChartPayload;
    if (!Array.isArray(parsed.days) || !Array.isArray(parsed.weeks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Адрес картинки для подписанной нагрузки. */
export function trendChartUrl(origin: string, signed: { d: string; s: string }): string {
  const url = new URL("/api/marketing/orchestrator/trend", origin);
  url.searchParams.set("d", signed.d);
  url.searchParams.set("s", signed.s);
  return url.toString();
}
