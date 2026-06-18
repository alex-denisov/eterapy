import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { buildChargebackEvidencePackage, recordChargebackClawback } from "@/lib/chargeback-evidence";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const permissions = await getUserPermissions(session.user!.id!, role);
  if (!permissions.includes("payments.refund") && !permissions.includes("antifraud.review")) {
    return NextResponse.json({ error: "Нет доступа к доказательствам платежного спора" }, { status: 403 });
  }

  const evidence = await buildChargebackEvidencePackage({
    bookingId: req.nextUrl.searchParams.get("bookingId") ?? undefined,
    productResultId: req.nextUrl.searchParams.get("productResultId") ?? undefined,
    paymentId: req.nextUrl.searchParams.get("paymentId") ?? undefined,
  });
  return NextResponse.json({ ok: true, evidence });
}
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const permissions = await getUserPermissions(session.user!.id!, role);
  if (!permissions.includes("payments.refund") && !permissions.includes("antifraud.review")) {
    return NextResponse.json({ error: "Нет доступа к chargeback clawback" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";
  const amountKopecks = Number(body.amountKopecks);
  if (!bookingId || !Number.isInteger(amountKopecks) || amountKopecks <= 0) {
    return NextResponse.json({ error: "bookingId и amountKopecks обязательны" }, { status: 400 });
  }

  const result = await recordChargebackClawback({
    bookingId,
    amountKopecks,
    actorUserId: session.user!.id!,
  });
  return NextResponse.json({ ok: true, result });
}
