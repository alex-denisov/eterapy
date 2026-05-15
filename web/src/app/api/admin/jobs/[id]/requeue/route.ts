import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const job = await db.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (!["FAILED", "DEAD"].includes(job.status)) {
    return NextResponse.json({ error: "Only FAILED or DEAD jobs can be requeued" }, { status: 400 });
  }

  await db.job.update({
    where: { id },
    data: {
      status: "PENDING",
      attempts: 0,
      error: null,
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      finishedAt: null,
      runAfter: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
