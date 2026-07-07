import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { userHasActiveEntitlement } from "@/lib/entitlements";

const PRODUCT_KEYS = ["compatibility", "pair"] as const;

// B465: restore a specific compatibility session by id (`?reading=<id>`). Either the
// creator or the partner may read it (each only ever sees the shared status, never the
// other side's text). Mirrors the entitlement derivation in the generate route.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  const { id } = await params;
  const productKey = request.nextUrl.searchParams.get("productKey");
  const asInvite = request.nextUrl.searchParams.get("asInvite") === "1" && productKey === "pair";

  const result = await db.compatibility.findFirst({
    where: {
      id,
      status: { not: "DELETED" },
      OR: [
        { creatorId: userId },
        { partnerId: userId },
        ...(asInvite ? [{ partnerId: null, status: { in: ["CREATED", "INVITED"] } }] : []),
      ],
    },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Compatibility not found", 404, context);

  const entitlementChecks = await Promise.all(
    PRODUCT_KEYS.map((key) => userHasActiveEntitlement(userId, key)),
  );
  const hasEntitlement = entitlementChecks.some(Boolean);
  const viewerRole =
    result.creatorId === userId ? "creator" : result.partnerId === userId ? "partner" : "invitee";

  return jsonWithRequestContext({ hasEntitlement, result: { ...result, viewerRole } }, { status: 200 }, context);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  const { id } = await params;
  
  const result = await db.compatibility.findFirst({
    where: { id, creatorId: userId, status: { not: "DELETED" } },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Compatibility not found", 404, context);
  
  await db.compatibility.update({ where: { id }, data: { status: "DELETED" } });
  return jsonWithRequestContext({ ok: true }, { status: 200 }, context);
}
