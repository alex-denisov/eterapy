export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { getCreditWalletSnapshot } from "@/lib/credit-wallet";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();

  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }
  guardClientCabinet(session.user.role);

  const wallet = await getCreditWalletSnapshot(session.user.id);

  return jsonWithRequestContext({
    ok: true,
    balance: wallet.balance,
    breakdown: wallet.breakdown,
    packs: wallet.packs,
    history: wallet.history,
  }, undefined, context);
}
