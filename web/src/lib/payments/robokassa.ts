/**
 * Robokassa payment provider — pure protocol layer (no DB, no Next.js).
 *
 * Everything here is deterministic and unit-testable: signature building and
 * verification, the payment-URL builder, and the 54-ФЗ receipt (`Receipt`).
 * Orchestration (transactions, entitlements) lives in `api/billing/*`.
 *
 * Protocol notes that are easy to get wrong — all verified against the docs:
 *
 * 1. Request signature:  `MerchantLogin:OutSum:InvId[:Receipt]:Password#1[:Shp_*]`
 *    The `Receipt` slot carries the **URL-encoded** JSON, i.e. the exact string
 *    that goes on the wire — not the raw JSON.
 * 2. ResultURL signature: `OutSum:InvId:Password#2[:Shp_*]`  (no Receipt).
 * 3. SuccessURL signature: `OutSum:InvId:Password#1[:Shp_*]` (no Receipt).
 *    Password #1 is also known to the browser flow, so SuccessURL is a UX
 *    signal only — money is credited exclusively from ResultURL.
 * 4. `Shp_*` params join the signature sorted alphabetically as `key=value`.
 * 5. `InvId` is a positive integer unique per shop; it is our idempotency key.
 * 6. In test mode Robokassa signs with the SEPARATE test passwords; using the
 *    production ones yields error 29.
 */
import { createHash, timingSafeEqual } from "crypto";

export const ROBOKASSA_PAYMENT_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";

/** Hash algorithms Robokassa offers. We configure the shop with SHA256. */
export type RobokassaHashAlgorithm = "MD5" | "SHA1" | "SHA256" | "SHA384" | "SHA512";

const NODE_HASH_BY_ALGORITHM: Record<RobokassaHashAlgorithm, string> = {
  MD5: "md5",
  SHA1: "sha1",
  SHA256: "sha256",
  SHA384: "sha384",
  SHA512: "sha512",
};

export interface RobokassaConfig {
  merchantLogin: string;
  password1: string;
  password2: string;
  hashAlgorithm: RobokassaHashAlgorithm;
  /** Test mode sends `IsTest=1` and signs with the test passwords. */
  isTest: boolean;
}

/** Extra `Shp_*` values echoed back to us by Robokassa on every callback. */
export type ShpParams = Readonly<Record<string, string>>;

// ─── Amounts ──────────────────────────────────────────────────────────────────

/**
 * Robokassa compares `OutSum` as a decimal number, and the same textual form
 * must be reproduced when verifying callbacks. We always normalise to two
 * decimals ("790.00") on the way out; on the way back we re-normalise whatever
 * Robokassa sent ("790", "790.0", "790.00" are all the same amount).
 */
export function formatOutSum(amountKopecks: number): string {
  if (!Number.isInteger(amountKopecks) || amountKopecks <= 0) {
    throw new Error(`Invalid payment amount in kopecks: ${amountKopecks}`);
  }
  return (amountKopecks / 100).toFixed(2);
}

/** Parses an `OutSum` from a callback into kopecks, or null when malformed. */
export function parseOutSumToKopecks(outSum: string): number | null {
  if (!/^\d+([.,]\d{1,2})?$/.test(outSum.trim())) {
    return null;
  }
  const normalized = Number(outSum.trim().replace(",", "."));
  if (!Number.isFinite(normalized)) {
    return null;
  }
  return Math.round(normalized * 100);
}

// ─── Signatures ───────────────────────────────────────────────────────────────

function hash(value: string, algorithm: RobokassaHashAlgorithm): string {
  return createHash(NODE_HASH_BY_ALGORITHM[algorithm]).update(value, "utf8").digest("hex").toUpperCase();
}

/** `Shp_*` params contribute `key=value` segments in alphabetical key order. */
function shpSegments(shp: ShpParams): string[] {
  return Object.keys(shp)
    .sort()
    .map((key) => `${key}=${shp[key]}`);
}

/**
 * Signature for the outgoing payment request.
 * `receiptEncoded` must be the URL-encoded receipt exactly as sent on the wire.
 */
export function buildPaymentSignature({
  config,
  outSum,
  invId,
  receiptEncoded,
  shp = {},
}: {
  config: RobokassaConfig;
  outSum: string;
  invId: number;
  receiptEncoded?: string;
  shp?: ShpParams;
}): string {
  const segments = [config.merchantLogin, outSum, String(invId)];
  if (receiptEncoded) {
    segments.push(receiptEncoded);
  }
  segments.push(config.password1, ...shpSegments(shp));
  return hash(segments.join(":"), config.hashAlgorithm);
}

function verifySignature(expected: string, received: string): boolean {
  // Robokassa varies the digest casing between endpoints, so normalise before
  // comparing — then compare in constant time, as the rest of the codebase does
  // for provider callbacks.
  const left = Buffer.from(expected.toUpperCase(), "utf8");
  const right = Buffer.from(received.trim().toUpperCase(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Verifies a ResultURL callback (signed with password #2). This is the ONLY
 * signature that may authorise crediting a user.
 */
export function verifyResultSignature({
  config,
  outSum,
  invId,
  signatureValue,
  shp = {},
}: {
  config: RobokassaConfig;
  outSum: string;
  invId: number;
  signatureValue: string;
  shp?: ShpParams;
}): boolean {
  const segments = [outSum, String(invId), config.password2, ...shpSegments(shp)];
  return verifySignature(hash(segments.join(":"), config.hashAlgorithm), signatureValue);
}

/**
 * Verifies a SuccessURL redirect (signed with password #1). Used only to decide
 * whether to show a success screen — never to grant entitlements.
 */
export function verifySuccessSignature({
  config,
  outSum,
  invId,
  signatureValue,
  shp = {},
}: {
  config: RobokassaConfig;
  outSum: string;
  invId: number;
  signatureValue: string;
  shp?: ShpParams;
}): boolean {
  const segments = [outSum, String(invId), config.password1, ...shpSegments(shp)];
  return verifySignature(hash(segments.join(":"), config.hashAlgorithm), signatureValue);
}

/** The reply ResultURL must return so Robokassa stops retrying the callback. */
export function resultAcknowledgement(invId: number): string {
  return `OK${invId}`;
}

// ─── Receipt (54-ФЗ fiscalization) ────────────────────────────────────────────

/** Taxation system of the merchant. ИП на УСН «доходы» → `usn_income`. */
export type RobokassaTaxSystem =
  | "osn"
  | "usn_income"
  | "usn_income_outcome"
  | "envd"
  | "esn"
  | "patent";

/** VAT rate per line. Non-ОСН merchants bill without VAT → `none`. */
export type RobokassaVat = "none" | "vat0" | "vat10" | "vat20" | "vat110" | "vat120";

export interface RobokassaReceiptItem {
  name: string;
  quantity: number;
  /** Line total in kopecks. */
  sumKopecks: number;
  tax: RobokassaVat;
  /** `service` for our digital products; `payment` for balance top-ups. */
  paymentObject: "service" | "commodity" | "payment";
  paymentMethod: "full_payment" | "full_prepayment" | "advance";
}

/**
 * Builds the receipt JSON. Item names are truncated to 128 chars — the fiscal
 * drive rejects longer ones and Robokassa returns a generic error.
 */
export function buildReceipt({
  items,
  taxSystem,
}: {
  items: readonly RobokassaReceiptItem[];
  taxSystem: RobokassaTaxSystem;
}): string {
  if (items.length === 0) {
    throw new Error("Receipt must contain at least one item");
  }
  return JSON.stringify({
    sno: taxSystem,
    items: items.map((item) => ({
      name: item.name.slice(0, 128),
      quantity: item.quantity,
      sum: Number((item.sumKopecks / 100).toFixed(2)),
      payment_method: item.paymentMethod,
      payment_object: item.paymentObject,
      tax: item.tax,
    })),
  });
}

/**
 * Robokassa expects the receipt URL-encoded, and the SAME encoded string must
 * go into the signature. `encodeURIComponent` leaves `!'()*` unescaped, which
 * Robokassa's parser accepts, but escaping them keeps the wire form stable
 * across environments.
 */
export function encodeReceipt(receiptJson: string): string {
  return encodeURIComponent(receiptJson).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// ─── Payment URL ──────────────────────────────────────────────────────────────

export interface BuildPaymentUrlOptions {
  config: RobokassaConfig;
  amountKopecks: number;
  /** Positive integer, unique per shop — our `Transaction.invoiceId`. */
  invId: number;
  description: string;
  receipt?: { items: readonly RobokassaReceiptItem[]; taxSystem: RobokassaTaxSystem };
  /** Prefills the payer's email on the Robokassa page. */
  email?: string;
  /** Payment link expiry. Always serialised with an explicit UTC offset. */
  expiresAt?: Date;
  shp?: ShpParams;
  culture?: "ru" | "en";
}

/**
 * Builds the hosted-checkout URL the user is redirected to.
 *
 * `Description` is shown to the payer, so callers must keep it free of internal
 * identifiers. It is capped at 100 chars per the protocol.
 */
export function buildPaymentUrl({
  config,
  amountKopecks,
  invId,
  description,
  receipt,
  email,
  expiresAt,
  shp = {},
  culture = "ru",
}: BuildPaymentUrlOptions): string {
  if (!Number.isInteger(invId) || invId <= 0) {
    throw new Error(`InvId must be a positive integer, got: ${invId}`);
  }
  for (const key of Object.keys(shp)) {
    if (!/^Shp_[A-Za-z0-9_]+$/.test(key)) {
      throw new Error(`Invalid Shp_ parameter name: ${key}`);
    }
  }

  const outSum = formatOutSum(amountKopecks);
  const receiptEncoded = receipt ? encodeReceipt(buildReceipt(receipt)) : undefined;
  const signature = buildPaymentSignature({ config, outSum, invId, receiptEncoded, shp });

  const params = new URLSearchParams({
    MerchantLogin: config.merchantLogin,
    OutSum: outSum,
    InvId: String(invId),
    Description: description.slice(0, 100),
    SignatureValue: signature,
    Culture: culture,
    Encoding: "utf-8",
  });
  if (email) {
    params.set("Email", email);
  }
  if (expiresAt) {
    // The offset is NOT optional: an ExpirationDate without one is read as
    // Moscow time, which would place a UTC-derived timestamp 3 hours in the
    // past and kill the link before the payer ever opens it.
    params.set("ExpirationDate", expiresAt.toISOString().replace(/\.\d{3}Z$/, "+00:00"));
  }
  if (config.isTest) {
    params.set("IsTest", "1");
  }
  for (const [key, value] of Object.entries(shp)) {
    params.set(key, value);
  }

  // Receipt is appended raw (already percent-encoded) because URLSearchParams
  // would double-encode the `%` signs and break the signature match.
  const query = receiptEncoded
    ? `${params.toString()}&Receipt=${receiptEncoded}`
    : params.toString();

  return `${ROBOKASSA_PAYMENT_URL}?${query}`;
}

// ─── Callback parsing ─────────────────────────────────────────────────────────

export interface RobokassaCallback {
  outSum: string;
  invId: number;
  signatureValue: string;
  shp: ShpParams;
  /** Robokassa's own fee, when it reports one. */
  fee: string | null;
  email: string | null;
  paymentMethod: string | null;
}

/**
 * Normalises a Result/Success/Fail callback. Robokassa is inconsistent about
 * parameter casing between GET and POST, so lookups are case-insensitive.
 * Returns null when a required field is missing or malformed.
 */
export function parseCallback(params: URLSearchParams): RobokassaCallback | null {
  const byLowerKey = new Map<string, string>();
  for (const [key, value] of params.entries()) {
    byLowerKey.set(key.toLowerCase(), value);
  }
  const get = (name: string) => byLowerKey.get(name.toLowerCase()) ?? null;

  const outSum = get("OutSum");
  const rawInvId = get("InvId");
  const signatureValue = get("SignatureValue");
  if (!outSum || !rawInvId || !signatureValue) {
    return null;
  }
  if (!/^\d+$/.test(rawInvId)) {
    return null;
  }
  const invId = Number(rawInvId);
  if (!Number.isSafeInteger(invId) || invId <= 0) {
    return null;
  }
  if (parseOutSumToKopecks(outSum) === null) {
    return null;
  }

  // Shp_ params must be echoed into the signature with their ORIGINAL casing.
  const shp: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase().startsWith("shp_")) {
      shp[key] = value;
    }
  }

  return {
    outSum,
    invId,
    signatureValue,
    shp,
    fee: get("Fee"),
    email: get("EMail"),
    paymentMethod: get("PaymentMethod"),
  };
}
