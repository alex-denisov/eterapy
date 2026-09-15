import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import db from "@/lib/db";
import {
  BACKLINK_STATUS_KEY,
  BACKLINK_TARGETS,
  parseBacklinkStatus,
  type BacklinkStepStatus,
} from "@/lib/seo/backlink-targets";

/**
 * B746 — отметка шага человека по внешней площадке.
 *
 * Оркестратор просит регистрации по понедельникам; без этой отметки он не
 * знал бы, что уже сделано, и просил бы вечно. Состояние — один JSON в
 * `platform_settings`, ключ `marketing.backlinks.status`.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { id?: unknown; status?: unknown; note?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const status = body?.status;
  if (!BACKLINK_TARGETS.some((target) => target.id === id)) {
    return NextResponse.json({ error: "unknown target" }, { status: 400 });
  }
  if (status !== "pending" && status !== "done" && status !== "skipped") {
    return NextResponse.json({ error: "status must be pending|done|skipped" }, { status: 400 });
  }
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : "";

  const row = await db.platformSetting.findUnique({ where: { key: BACKLINK_STATUS_KEY }, select: { value: true } });
  const current = parseBacklinkStatus(row?.value ?? null);
  const next = {
    ...current,
    [id]: {
      status: status as BacklinkStepStatus,
      ...(note ? { note } : {}),
      updatedAt: new Date().toISOString(),
    },
  };
  const value = JSON.stringify(next);
  await db.platformSetting.upsert({
    where: { key: BACKLINK_STATUS_KEY },
    create: { key: BACKLINK_STATUS_KEY, value, updatedBy: session.user.id },
    update: { value, updatedBy: session.user.id },
  });
  await logAudit(session.user.id, AUDIT_ACTIONS.MARKETING_AGENT_STATE, BACKLINK_STATUS_KEY, `${id}=${status}`);
  return NextResponse.json({ ok: true, status: next });
}
