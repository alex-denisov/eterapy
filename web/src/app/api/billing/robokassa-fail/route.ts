/**
 * Robokassa FailURL — the payer abandoned or failed the payment.
 *
 * Robokassa does not sign this redirect, so nothing here may change state: the
 * transaction stays PENDING and is closed either by a later ResultURL callback
 * or by the reconciliation job. All we do is send the user back to where the
 * purchase started with an honest "payment did not go through" flag.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { log } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { buildBillingReturnUrl, type BillingReturnMetadata } from "@/lib/payments/return-url";
import { APP_URL } from "@/lib/env";

async function handle(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const params =
    req.method === "POST" ? new URLSearchParams(await req.text()) : req.nextUrl.searchParams;

  const rawInvId = params.get("InvId") ?? params.get("invId") ?? params.get("invid");
  const invId = rawInvId && /^\d+$/.test(rawInvId) ? Number(rawInvId) : null;

  // Unsigned input: used ONLY to pick the page to return to, never to mutate.
  // The invoice is additionally scoped to the signed-in user, so a stranger
  // cannot probe which invoice numbers exist by watching where they land.
  const session = await auth();
  const transaction =
    session?.user?.id && invId && Number.isSafeInteger(invId)
      ? await db.transaction.findFirst({ where: { invoiceId: invId, userId: session.user.id } })
      : null;
  const metadata = (transaction?.metadata ?? {}) as BillingReturnMetadata;

  log.info("robokassa-fail-redirect", { requestId: context.requestId, invId });

  return NextResponse.redirect(buildBillingReturnUrl(metadata, "fail", APP_URL), { status: 303 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
