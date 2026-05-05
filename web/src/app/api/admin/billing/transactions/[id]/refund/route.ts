import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { refundSucceededTransaction } from "@/lib/billing-credit";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

const refundSchema = z.object({
  reason: z.string().trim().min(8).max(500),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";

  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("payments.refund")) {
    return errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context);
  }

  const parsed = refundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("BAD_REQUEST", "Refund reason is required", 400, context);
  }

  const { id } = await params;
  try {
    const result = await refundSucceededTransaction({
      transactionId: id,
      reason: parsed.data.reason,
    });

    await logAudit(
      session.user.id,
      "PAYMENT_REFUND",
      id,
      JSON.stringify({
        reason: parsed.data.reason,
        providerRefundId: result.providerRefundId,
        requestId: context.requestId,
      }),
    );

    return jsonWithRequestContext({ ok: true, ...result }, { status: 200 }, context);
  } catch (err) {
    return errorWithRequestContext(
      "REFUND_FAILED",
      err instanceof Error ? err.message : "Refund failed",
      400,
      context
    );
  }
}
