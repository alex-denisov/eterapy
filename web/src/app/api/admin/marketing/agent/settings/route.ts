import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import db from "@/lib/db";

export async function PATCH(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { enabled?: unknown; notificationsEnabled?: unknown } | null;
  const isAgent = typeof body?.enabled === "boolean";
  const isNotifications = typeof body?.notificationsEnabled === "boolean";
  if (!isAgent && !isNotifications) {
    return NextResponse.json({ error: "enabled or notificationsEnabled must be boolean" }, { status: 400 });
  }
  const key = isAgent ? "marketing.agent.enabled" : "marketing.notifications.enabled";
  const value = isAgent ? body!.enabled as boolean : body!.notificationsEnabled as boolean;
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: String(value), updatedBy: session.user.id },
    update: { value: String(value), updatedBy: session.user.id },
  });
  await logAudit(
    session.user.id,
    AUDIT_ACTIONS.MARKETING_AGENT_STATE,
    key,
    `enabled=${value}`,
  );
  return NextResponse.json({ ok: true, enabled: value });
}
