/** PATCH /api/complaints/[id] — обновить статус жалобы (admin) */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveComplaint, type PayoutDecision } from "@/lib/complaint-resolution";

const VALID_STATUSES = ["OPEN", "REVIEWING", "RESOLVED", "CLOSED"] as const;
type ComplaintStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as {
    status?: string;
    resolution?: string;
    payoutDecision?: PayoutDecision;
  };
  if (!body.status || !VALID_STATUSES.includes(body.status as ComplaintStatus)) {
    return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
  }

  const outcome = await resolveComplaint(
    {
      complaintId: id,
      status: body.status as ComplaintStatus,
      resolution: body.resolution ?? null,
      payoutDecision: body.payoutDecision,
    },
    { userId: session.user!.id! },
  );

  if (outcome.status === "not_found") {
    return NextResponse.json({ error: "Жалоба не найдена" }, { status: 404 });
  }
  if (outcome.status === "invalid_status") {
    return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
  }
  if (outcome.status === "decision_required") {
    return NextResponse.json(
      {
        error: "Требуется решение по выплате",
        heldKopecks: outcome.heldKopecks,
        heldPayoutId: outcome.heldPayoutId,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    complaintStatus: outcome.complaintStatus,
    payoutAction: outcome.payoutAction,
  });
}
