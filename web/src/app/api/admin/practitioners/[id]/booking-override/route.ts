import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";

/**
 * B459 (walkthrough item 15): superadmin-only manual booking-enable override.
 * Lets a superadmin make a vetted/demo practitioner bookable without the full
 * commercial requisites (agent offer + tax status + payout details). Bypasses the
 * COMMERCIAL gate only — never the active-status check (see practitioner-compliance).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  // Deliberately SUPERADMIN-only: this overrides legal/financial readiness checks,
  // so it is not delegated to moderators or plain admins.
  if (!session || role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Только суперадмин может управлять записью" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const enabled = body?.enabled === true;

  const now = new Date();
  const practitioner = await db.practitioner.update({
    where: { id },
    data: {
      bookingOverrideEnabled: enabled,
      bookingOverrideAt: enabled ? now : null,
    },
    select: { userId: true },
  });

  await logAudit(
    session.user!.id!,
    "PRACTITIONER_BOOKING_OVERRIDE",
    practitioner.userId,
    enabled ? "Запись включена вручную (обход реквизитов)" : "Ручное включение записи снято",
  );

  return NextResponse.json({
    ok: true,
    bookingOverrideEnabled: enabled,
    bookingOverrideAt: enabled ? now.toISOString() : null,
  });
}
