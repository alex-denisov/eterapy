import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context);
  }

  const perms = await getUserPermissions(session.user.id, role);
  if (!perms.includes("practitioners.payout")) {
    return errorWithRequestContext("FORBIDDEN", "Нет полномочия practitioners.payout", 403, context);
  }

  const { id } = await params;
  const practitioner = await db.practitioner.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      payoutDetails: { select: { id: true, type: true, kycStatus: true } },
    },
  });
  if (!practitioner?.payoutDetails) {
    return errorWithRequestContext("NOT_FOUND", "Реквизиты не найдены", 404, context);
  }
  if (practitioner.payoutDetails.type !== "ENTITY") {
    return errorWithRequestContext("INVALID_REQUEST", "KYC требуется только для юр.лица/ИП", 400, context);
  }

  const [updated, released] = await db.$transaction([
    db.payoutDetails.update({
      where: { practitionerId: practitioner.id },
      data: {
        kycStatus: "VERIFIED",
        kycVerifiedAt: new Date(),
      },
      select: { practitionerId: true, kycStatus: true, kycVerifiedAt: true },
    }),
    db.payout.updateMany({
      where: {
        practitionerId: practitioner.id,
        status: "HELD",
        holdReason: "kyc_required",
      },
      data: {
        status: "PENDING",
        holdReason: "payout_delay",
        payoutRunId: null,
        riskFlags: [],
      },
    }),
  ]);

  await logAudit(
    session.user.id,
    "PAYOUT_DETAILS_KYC_VERIFY",
    practitioner.userId,
    `practitioner=${practitioner.id}`,
  );

  return jsonWithRequestContext({ ok: true, payoutDetails: updated, releasedPayouts: released.count }, { status: 200 }, context);
}
