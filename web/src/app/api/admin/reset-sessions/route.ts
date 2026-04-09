import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !["ADMIN","SUPERADMIN"].includes(session.user?.role ?? "")) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { userId } = await req.json();

  if (userId) {
    // Reset for a specific user
    const month = new Date().toISOString().slice(0, 7); // "2026-04"
    const deleted = await db.toolSession.deleteMany({ where: { userId, month } });
    return NextResponse.json({ ok: true, deleted: deleted.count });
  }

  // Reset ALL test user sessions (for dev redeploy)
  const testEmails = ["client@test.eterapy.com", "practitioner@test.eterapy.com", "admin@test.eterapy.com"];
  const testUsers = await db.user.findMany({ where: { email: { in: testEmails } }, select: { id: true } });
  const testIds = testUsers.map(u => u.id);

  const month = new Date().toISOString().slice(0, 7);
  const deleted = await db.toolSession.deleteMany({ where: { userId: { in: testIds }, month } });
  return NextResponse.json({ ok: true, deleted: deleted.count, users: testIds.length });
}
