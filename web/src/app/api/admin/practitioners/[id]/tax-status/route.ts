import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { notify } from "@/lib/notifications";
import { normalizeTaxReviewStatus, normalizeTaxStatus } from "@/lib/practitioner-compliance";

function str(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const permissions = await getUserPermissions(session.user!.id!, role);
  if (!permissions.includes("practitioners.verify")) {
    return NextResponse.json({ error: "Нет полномочия practitioners.verify" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const taxStatus = normalizeTaxStatus(body.taxStatus);
  const taxReviewStatus = normalizeTaxReviewStatus(body.taxReviewStatus);
  const rejectedReason = str(body.rejectedReason, 1000);

  if (!taxStatus) return NextResponse.json({ error: "Укажите статус: самозанятый, ИП или ООО" }, { status: 400 });
  if (!taxReviewStatus) return NextResponse.json({ error: "Укажите результат проверки" }, { status: 400 });
  if (taxReviewStatus === "REJECTED" && rejectedReason.length < 3) {
    return NextResponse.json({ error: "Для отказа укажите причину" }, { status: 400 });
  }

  const now = new Date();
  const practitioner = await db.practitioner.update({
    where: { id },
    data: {
      taxStatus,
      taxReviewStatus,
      taxStatusVerifiedAt: taxReviewStatus === "VERIFIED" ? now : null,
      taxStatusRejectedReason: taxReviewStatus === "REJECTED" ? rejectedReason : null,
    },
    select: { userId: true },
  });

  await logAudit(
    session.user!.id!,
    "PRACTITIONER_TAX_STATUS",
    practitioner.userId,
    `Налоговый статус ${taxStatus}: ${taxReviewStatus}${rejectedReason ? ` (${rejectedReason})` : ""}`,
  );

  if (taxReviewStatus === "REJECTED") {
    notify({
      userId: practitioner.userId,
      event: "COMPLIANCE_ALERT",
      data: { reason: rejectedReason || "Налоговый статус не подтверждён" },
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    taxStatus,
    taxReviewStatus,
    taxStatusVerifiedAt: taxReviewStatus === "VERIFIED" ? now.toISOString() : null,
    taxStatusRejectedReason: taxReviewStatus === "REJECTED" ? rejectedReason : null,
  });
}
