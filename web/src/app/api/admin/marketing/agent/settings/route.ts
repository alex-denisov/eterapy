import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import db from "@/lib/db";

export async function PATCH(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
  }
  await db.platformSetting.upsert({
    where: { key: "marketing.agent.enabled" },
    create: { key: "marketing.agent.enabled", value: String(body.enabled), updatedBy: session.user.id },
    update: { value: String(body.enabled), updatedBy: session.user.id },
  });
  await logAudit(
    session.user.id,
    AUDIT_ACTIONS.MARKETING_AGENT_STATE,
    "marketing.agent.enabled",
    `enabled=${body.enabled}`,
  );
  return NextResponse.json({ ok: true, enabled: body.enabled });
}
