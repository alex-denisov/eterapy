import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";

const VALID_STATUSES = ["PUBLISHED", "REVIEW", "HIDDEN"] as const;
type ReviewStatus = (typeof VALID_STATUSES)[number];

function isModerator(role: string | undefined): boolean {
  return role === "ADMIN" || role === "SUPERADMIN" || role === "MODERATOR";
}

/**
 * Recompute a practitioner's public rating counters from PUBLISHED reviews only.
 * HIDDEN / REVIEW reviews must not influence the visible average or count.
 */
async function recomputePractitionerRating(practitionerId: string): Promise<void> {
  const agg = await db.review.aggregate({
    where: { practitionerId, status: "PUBLISHED" },
    _count: { _all: true },
    _sum: { rating: true },
  });
  await db.practitioner.update({
    where: { id: practitionerId },
    data: {
      reviewCount: agg._count._all,
      ratingSum: agg._sum.rating ?? 0,
    },
  });
}

/** PATCH — change moderation status of a review (PUBLISHED | REVIEW | HIDDEN). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !isModerator(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = (body as { status?: unknown }).status;
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as ReviewStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, practitionerId: true, status: true },
  });
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  await db.review.update({ where: { id }, data: { status } });
  await recomputePractitionerRating(review.practitionerId);
  await logAudit(
    session.user!.id,
    "REVIEW_MODERATE",
    id,
    `status ${review.status} → ${status}`,
  );

  return NextResponse.json({ ok: true, status });
}

/** DELETE — permanently remove a review (admins/superadmins only). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session || !(role === "ADMIN" || role === "SUPERADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, practitionerId: true },
  });
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  await db.review.delete({ where: { id } });
  await recomputePractitionerRating(review.practitionerId);
  await logAudit(session.user!.id, "REVIEW_DELETE", id);

  return NextResponse.json({ ok: true });
}
