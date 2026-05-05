import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { listUserEntitlements, userHasActiveEntitlement } from "@/lib/entitlements";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const productKey = req.nextUrl.searchParams.get("productKey");
  if (productKey) {
    const active = await userHasActiveEntitlement(session.user.id, productKey);
    return jsonWithRequestContext({ productKey, active }, undefined, context);
  }

  return jsonWithRequestContext(await listUserEntitlements(session.user.id), undefined, context);
}
