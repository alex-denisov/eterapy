/**
 * Where the payer lands after leaving the payment page.
 *
 * Shared by checkout creation and the Robokassa Success/Fail redirects so the
 * user always returns to the surface the purchase started from.
 */
import { APP_URL } from "@/lib/env";

const FALLBACK_PATH = "/cabinet/billing";

/** Transaction metadata we persist at checkout and read back on return. */
export interface BillingReturnMetadata {
  returnPath?: string | null;
  productKey?: string | null;
  planKey?: string | null;
  creditPackKey?: string | null;
}

/**
 * Builds an absolute return URL.
 *
 * `returnPath` originates from client input, so only same-origin absolute paths
 * are honoured — a protocol-relative `//evil.tld` would otherwise turn the
 * payment redirect into an open redirect.
 */
export function buildBillingReturnUrl(
  metadata: BillingReturnMetadata,
  outcome: "success" | "fail",
  baseUrl: string = APP_URL,
): string {
  const rawPath = metadata.returnPath;
  const safePath =
    rawPath && rawPath.startsWith("/") && !rawPath.startsWith("//") ? rawPath : FALLBACK_PATH;

  const url = new URL(safePath, baseUrl);
  url.searchParams.set("payment", outcome);
  if (metadata.productKey) {
    url.searchParams.set("productKey", metadata.productKey);
  }
  if (metadata.planKey) {
    url.searchParams.set("planKey", metadata.planKey);
  }
  if (metadata.creditPackKey) {
    url.searchParams.set("creditPackKey", metadata.creditPackKey);
  }
  return url.toString();
}
