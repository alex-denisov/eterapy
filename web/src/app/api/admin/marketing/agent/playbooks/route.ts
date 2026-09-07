import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  parsePlaybookOverride,
  playbookSettingKey,
  resolvePlatformContracts,
} from "@/lib/marketing/playbook-settings";
import { PLATFORM_PLAYBOOKS } from "@/lib/marketing/platform-playbook";
import { setSetting } from "@/lib/platform-settings";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const playbooks = await resolvePlatformContracts();
  return NextResponse.json({ ok: true, playbooks });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    platform?: unknown;
    override?: unknown;
  } | null;

  if (typeof body?.platform !== "string") {
    return NextResponse.json({ error: "Platform required" }, { status: 400 });
  }

  const platform = body.platform.trim().toLowerCase();
  if (!PLATFORM_PLAYBOOKS[platform]) {
    return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 });
  }

  const settingKey = playbookSettingKey(platform);

  if (body.override === null || body.override === undefined || body.override === "") {
    // Reset to code default
    await setSetting(settingKey, "", session.user.id);
    await logAudit(
      session.user.id,
      "MARKETING_PLAYBOOK_RESET",
      platform,
      JSON.stringify({ platform, resetToDefault: true }),
    );
    const parsed = parsePlaybookOverride(platform, null);
    return NextResponse.json({ ok: true, platform, result: parsed });
  }

  if (typeof body.override !== "object" || Array.isArray(body.override)) {
    return NextResponse.json({ error: "Override must be an object" }, { status: 400 });
  }

  const jsonString = JSON.stringify(body.override, null, 2);
  const parsed = parsePlaybookOverride(platform, jsonString);

  await setSetting(settingKey, jsonString, session.user.id);
  await logAudit(
    session.user.id,
    "MARKETING_PLAYBOOK_OVERRIDE",
    platform,
    JSON.stringify({
      platform,
      overridden: parsed.overridden,
      rejected: parsed.rejected,
    }),
  );

  return NextResponse.json({ ok: true, platform, result: parsed });
}
