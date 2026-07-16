import type { NextRequest } from "next/server";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { log } from "@/lib/logger";

const MAX_REPORT_BYTES = 16 * 1024;
const REPORT_TYPES = new Set(["application/csp-report", "application/reports+json", "application/json"]);

function safeOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  if (["inline", "eval", "data", "blob"].includes(value)) return value;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return undefined;
  }
}

function reportFields(payload: unknown) {
  const root = Array.isArray(payload) ? payload[0] : payload;
  if (!root || typeof root !== "object") return {};
  const record = root as Record<string, unknown>;
  const nested = (record["csp-report"] ?? record.body ?? record) as Record<string, unknown>;
  if (!nested || typeof nested !== "object") return {};
  return {
    directive: String(nested["effective-directive"] ?? nested.effectiveDirective ?? nested["violated-directive"] ?? "unknown").slice(0, 120),
    blockedOrigin: safeOrigin(nested["blocked-uri"] ?? nested.blockedURL),
    documentOrigin: safeOrigin(nested["document-uri"] ?? nested.documentURL),
    disposition: String(nested.disposition ?? "report").slice(0, 24),
  };
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() ?? "";
  if (!REPORT_TYPES.has(contentType)) return new Response(null, { status: 415 });

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }

  const limit = checkRequestAuthRateLimit(request, "csp-report", 30, 60_000);
  if (!limit.allowed) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_REPORT_BYTES) return new Response(null, { status: 413 });

  try {
    log.info("security.csp_violation", reportFields(JSON.parse(text)));
  } catch {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
