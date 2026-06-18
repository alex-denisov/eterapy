import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { evaluatePractitionerCommercialGate, practitionerComplianceSelect } from "@/lib/practitioner-compliance";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status } = await req.json();
  const valid = ["PENDING", "ACTIVE", "SUSPENDED", "BLOCKED"];
  if (!valid.includes(status)) return NextResponse.json({ error: "Неверный статус" }, { status: 400 });

  if (status === "ACTIVE") {
    const existing = await db.practitioner.findUnique({
      where: { id },
      select: { verified: true, ...practitionerComplianceSelect },
    });
    if (!existing?.verified) {
      return NextResponse.json({ error: "Перед публикацией профиль должен пройти проверку" }, { status: 409 });
    }
    const commercialGate = evaluatePractitionerCommercialGate(existing);
    if (!commercialGate.allowed) {
      return NextResponse.json(
        { error: "Перед публикацией примите агентскую оферту и подтвердите налоговый статус/реквизиты", reasons: commercialGate.reasons },
        { status: 409 },
      );
    }
  }

  const p = await db.practitioner.update({
    where: { id },
    data: { status },
    select: { userId: true },
  });

  await logAudit(session.user.id, "PRACTITIONER_STATUS", p.userId, `Статус изменён на ${status}`);

  return NextResponse.json({ ok: true });
}
