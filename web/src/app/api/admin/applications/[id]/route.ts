import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  // @ts-expect-error custom
  const role = session?.user?.role;
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status } = await req.json();
  const valid = ["PENDING", "REVIEWING", "APPROVED", "REJECTED"];
  if (!valid.includes(status)) return NextResponse.json({ error: "Неверный статус" }, { status: 400 });

  await db.practitionerApplication.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json({ ok: true });
}
