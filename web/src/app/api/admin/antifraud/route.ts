import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canReviewAntifraud, fraudMetadataObject, getAdminAntifraudData } from "@/lib/admin-antifraud";
import { getUserPermissions } from "@/lib/moderator-permissions";

async function requireAntifraudReviewer() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  const userId = session?.user?.id;
  if (!session || !userId || !["ADMIN", "SUPERADMIN"].includes(role)) return null;

  const permissions = await getUserPermissions(userId, role);
  if (!canReviewAntifraud(role, permissions)) return null;
  return { userId, role };
}

export async function GET() {
  const reviewer = await requireAntifraudReviewer();
  if (!reviewer) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const data = await getAdminAntifraudData();
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const reviewer = await requireAntifraudReviewer();
  if (!reviewer) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const status = typeof body.status === "string" ? body.status : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const allowed = new Set(["logged", "review", "blocked", "clawback", "resolved"]);

  if (!eventId || !allowed.has(status)) {
    return NextResponse.json({ error: "Некорректное решение" }, { status: 400 });
  }

  const existing = await db.fraudEvent.findUnique({ where: { id: eventId } });
  if (!existing) return NextResponse.json({ error: "Событие не найдено" }, { status: 404 });

  const metadata = {
    ...fraudMetadataObject(existing.metadata),
    manualReview: {
      status,
      note,
      reviewerId: reviewer.userId,
      decidedAt: new Date().toISOString(),
    },
  };

  const updated = await db.fraudEvent.update({
    where: { id: eventId },
    data: {
      status,
      metadata,
    },
  });

  await logAudit(reviewer.userId, "MANUAL_REVIEW_RESOLVED", eventId, `status=${status}`);

  return NextResponse.json({
    ok: true,
    event: {
      id: updated.id,
      status: updated.status,
      metadata: updated.metadata,
    },
  });
}

export async function POST(req: NextRequest) {
  const reviewer = await requireAntifraudReviewer();
  if (!reviewer) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const subjectType = typeof body.subjectType === "string" ? body.subjectType.trim().slice(0, 80) : "";
  const subjectId = typeof body.subjectId === "string" ? body.subjectId.trim().slice(0, 160) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";

  if (!subjectType || !subjectId || !note) {
    return NextResponse.json({ error: "Нужны subjectType, subjectId и note" }, { status: 400 });
  }

  const event = await db.fraudEvent.create({
    data: {
      subjectType,
      subjectId,
      actorUserId: reviewer.userId,
      riskScore: 0,
      riskFlags: ["appeal_submitted"],
      action: "appeal_submitted",
      status: "review",
      metadata: {
        appeal: {
          note,
          submittedBy: reviewer.userId,
          submittedAt: new Date().toISOString(),
        },
      },
    },
  });

  await logAudit(reviewer.userId, "APPEAL_SUBMITTED", event.id, `${subjectType}:${subjectId}`);

  return NextResponse.json({ ok: true, event }, { status: 201 });
}
