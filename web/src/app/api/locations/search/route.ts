import type { NextRequest } from "next/server";
import { jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { requestContextFromHeaders } from "@/lib/request-context";
import { searchRussianLocalities } from "@/lib/russian-localities";

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const rateLimit = checkRequestAuthRateLimit(request, "locations:search", 90, 60_000);
  if (!rateLimit.allowed) {
    return jsonWithRequestContext(
      { results: [], error: "Слишком много запросов. Подождите немного." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      context,
    );
  }
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 120) ?? "";
  return jsonWithRequestContext({ results: searchRussianLocalities(query) }, { status: 200 }, context);
}
