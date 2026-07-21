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
  stepByStep = false,
  shp = {},
}: {
  config: RobokassaConfig;
  outSum: string;
  invId: number;
  receiptEncoded?: string;
  /** B425: холдирование. Добавляет сегмент `true` ПЕРЕД паролем #1. */
  stepByStep?: boolean;
  shp?: ShpParams;
}): string {
  const segments = [config.merchantLogin, outSum, String(invId)];
  if (receiptEncoded) {
    segments.push(receiptEncoded);
  }
  // Документация: `MerchantLogin:OutSum:InvoiceId:Receipt:true:Пароль#1`.
  // Сегмент — литерал `true`, а не значение флага: при `StepByStep=false`
  // параметр вообще не отправляется и в подписи его нет.
  if (stepByStep) {
    segments.push("true");
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
  /**
   * B425 — двухстадийная оплата: деньги замораживаются на карте, списываются
   * отдельным запросом `confirmHold` (или освобождаются `cancelHold`).
   *
   * ⚠ Три ограничения провайдера, из-за которых это НЕ универсальная замена
   * обычной оплате:
   * 1. только банковские карты — СБП и кошельки холд не поддерживают;
   * 2. включается по отдельному согласованию с Robokassa (владелец подтвердил
   *    активацию 2026-07-22);
   * 3. **максимум 7 календарных дней**, дальше холд снимается автоматически.
   *    Для брони сессии дальше чем на неделю холд не годится в принципе.
   */
  stepByStep?: boolean;
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
  stepByStep = false,
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
  const signature = buildPaymentSignature({ config, outSum, invId, receiptEncoded, stepByStep, shp });

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
  if (stepByStep) {
    params.set("StepByStep", "true");
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

// ─── B425: холдирование (двухстадийная оплата) ────────────────────────────────

/** Списание ранее захолдированной суммы. Провайдер принимает его ОДИН раз. */
export const ROBOKASSA_CONFIRM_URL = "https://auth.robokassa.ru/Merchant/Payment/Confirm";
/** Снятие холда без списания. */
export const ROBOKASSA_CANCEL_URL = "https://auth.robokassa.ru/Merchant/Payment/Cancel";

/**
 * Подпись подтверждения списания: `MerchantLogin:OutSum:InvoiceId:Пароль#1`.
 * При частичном списании в запрос добавляется УРЕЗАННЫЙ `Receipt`, и тогда он
 * входит в подпись: `MerchantLogin:OutSum:InvoiceId:Receipt:Пароль#1`.
 */
export function buildConfirmSignature({
  config,
  outSum,
  invId,
  receiptEncoded,
}: {
  config: RobokassaConfig;
  outSum: string;
  invId: number;
  receiptEncoded?: string;
}): string {
  const segments = [config.merchantLogin, outSum, String(invId)];
  if (receiptEncoded) segments.push(receiptEncoded);
  segments.push(config.password1);
  return hash(segments.join(":"), config.hashAlgorithm);
}

/**
 * Подпись отмены холда: `MerchantLogin::InvoiceId:Пароль#1`.
 *
 * ⚠ Сегмент суммы ПУСТОЙ, а не отсутствует — двоеточия идут подряд. Отмена
 * всегда снимает холд целиком, поэтому суммы в подписи нет.
 */
export function buildCancelSignature({
  config,
  invId,
}: {
  config: RobokassaConfig;
  invId: number;
}): string {
  return hash([config.merchantLogin, "", String(invId), config.password1].join(":"), config.hashAlgorithm);
}

export type HoldOperationResult =
  | { ok: true }
  | { ok: false; error: string };

async function postToRobokassa(url: string, body: URLSearchParams): Promise<HoldOperationResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    // Сеть отвалилась — состояние холда у провайдера НЕИЗВЕСТНО. Возвращаем
    // ошибку, чтобы вызывающий не записал деньги списанными.
    return { ok: false, error: error instanceof Error ? error.message : "network error" };
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
  // Robokassa отвечает по-разному в зависимости от эндпоинта; признаком отказа
  // считаем явное упоминание ошибки в теле.
  if (/"?(error|errorCode)"?\s*[:=]/i.test(text) && !/"errorCode"\s*:\s*"?0"?/i.test(text)) {
    return { ok: false, error: text.slice(0, 200) };
  }
  return { ok: true };
}

/**
 * Списывает захолдированные средства — полностью или частично.
 *
 * Частичное списание: передать `amountKopecks` МЕНЬШЕ захолдированного и
 * `receipt` с урезанным составом. Без урезанного чека частичное списание
 * оставит фискальный документ, не совпадающий с суммой.
 */
export async function confirmHold({
  config,
  invId,
  amountKopecks,
  receipt,
}: {
  config: RobokassaConfig;
  invId: number;
  amountKopecks: number;
  receipt?: { items: readonly RobokassaReceiptItem[]; taxSystem: RobokassaTaxSystem };
}): Promise<HoldOperationResult> {
  const outSum = formatOutSum(amountKopecks);
  const receiptEncoded = receipt ? encodeReceipt(buildReceipt(receipt)) : undefined;
  const body = new URLSearchParams({
    MerchantLogin: config.merchantLogin,
    InvoiceID: String(invId),
    OutSum: outSum,
    SignatureValue: buildConfirmSignature({ config, outSum, invId, receiptEncoded }),
  });
  if (receiptEncoded) body.set("Receipt", receiptEncoded);
  return postToRobokassa(ROBOKASSA_CONFIRM_URL, body);
}

/** Снимает холд целиком: деньги возвращаются клиенту, списания не было. */
export async function cancelHold({
  config,
  invId,
  amountKopecks,
}: {
  config: RobokassaConfig;
  invId: number;
  amountKopecks: number;
}): Promise<HoldOperationResult> {
  const body = new URLSearchParams({
    MerchantLogin: config.merchantLogin,
    InvoiceID: String(invId),
    OutSum: formatOutSum(amountKopecks),
    SignatureValue: buildCancelSignature({ config, invId }),
  });
  return postToRobokassa(ROBOKASSA_CANCEL_URL, body);
}
