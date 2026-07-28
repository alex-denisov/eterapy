import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  MARKETING_PLATFORM_FIELDS,
  saveMarketingPlatformConfig,
  type MarketingPlatform,
  type MarketingPlatformFieldKey,
} from "@/lib/marketing/platform-settings";

const PLATFORMS = new Set(MARKETING_PLATFORM_FIELDS.map((field) => field.platform));
const FIELD_KEYS = new Set(MARKETING_PLATFORM_FIELDS.map((field) => field.key));

export async function PATCH(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as {
    platform?: unknown;
    enabled?: unknown;
    values?: unknown;
  } | null;
  if (typeof body?.platform !== "string" || !PLATFORMS.has(body.platform as MarketingPlatform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean" || !body.values || typeof body.values !== "object" || Array.isArray(body.values)) {
    return NextResponse.json({ error: "Invalid platform settings" }, { status: 400 });
  }
  const values: Partial<Record<MarketingPlatformFieldKey, string | null>> = {};
  for (const [key, value] of Object.entries(body.values as Record<string, unknown>)) {
    if (!FIELD_KEYS.has(key as MarketingPlatformFieldKey)) continue;
    if (typeof value !== "string" && value !== null) {
      return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 });
    }
    values[key as MarketingPlatformFieldKey] = value;
  }
  await saveMarketingPlatformConfig({
    actorId: session.user.id,
    platform: body.platform as MarketingPlatform,
    enabled: body.enabled,
    values,
  });
  await logAudit(
    session.user.id,
    "MARKETING_CONNECTOR_UPDATE",
    body.platform,
    JSON.stringify({ enabled: body.enabled, changedKeys: Object.keys(values) }),
  );
  return NextResponse.json({ ok: true });
}
