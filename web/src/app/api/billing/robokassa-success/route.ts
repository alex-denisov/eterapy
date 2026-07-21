/**
 * Robokassa SuccessURL — where the payer's BROWSER lands after paying.
 *
 * This is a UX signal only. It is signed with password #1, which also travels
 * in the outgoing payment link, so it must never grant anything: money is
 * credited exclusively by the server-to-server ResultURL. Robokassa may even
 * deliver Success before Result, so the cabinet shows an optimistic state and
 * settles once the callback lands.
 *
 * Robokassa exposes ONE Success URL per shop, so the per-purchase destination
 * is recovered from the transaction record rather than the query string.
 */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { log } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { robokassaConfig } from "@/lib/payments/config";
import { parseCallback, verifySuccessSignature } from "@/lib/payments/robokassa";
import { buildBillingReturnUrl, type BillingReturnMetadata } from "@/lib/payments/return-url";
import { APP_URL } from "@/lib/env";

async function handle(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const params =
    req.method === "POST"
      ? new URLSearchParams(await req.text())
      : req.nextUrl.searchParams;

  const callback = parseCallback(params);
  if (!callback) {
    log.warn("robokassa-success-invalid-payload", { requestId: context.requestId });
    return NextResponse.redirect(buildBillingReturnUrl({}, "fail"), { status: 303 });
  }

  let signatureValid = false;
  try {
    signatureValid = verifySuccessSignature({
      config: robokassaConfig(),
      outSum: callback.outSum,
      invId: callback.invId,
      signatureValue: callback.signatureValue,
      shp: callback.shp,
    });
  } catch {
    // Missing credentials — treated exactly like a bad signature below.
    signatureValid = false;
  }

  if (!signatureValid) {
    log.warn("robokassa-success-bad-signature", {
      requestId: context.requestId,
      invId: callback.invId,
    });
    return NextResponse.redirect(buildBillingReturnUrl({}, "fail"), { status: 303 });
  }

  const transaction = await db.transaction.findUnique({ where: { invoiceId: callback.invId } });
  const metadata = (transaction?.metadata ?? {}) as BillingReturnMetadata;

  log.info("robokassa-success-redirect", {
    requestId: context.requestId,
    invId: callback.invId,
    // Whether Result has already settled it — useful when debugging ordering.
    settled: transaction?.status === "SUCCEEDED",
  });

  return NextResponse.redirect(buildBillingReturnUrl(metadata, "success", APP_URL), { status: 303 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
