import { legalDocVersionId, type LegalDocSlug } from "@/lib/legal/registry";

// B427 (M28 / scope 4.1): exactly two registration checkboxes.
// Checkbox 1 (contract package) covers these documents; checkbox 2 is the
// separate personal-data (ПДн) consent. Each is logged as its own record.
//
// B525: «uploads» и «transcription» добавлены в договорный пакет — их условия
// теперь принимаются ПРИ РЕГИСТРАЦИИ, а не отдельными галочками внутри услуг.
// Количество чекбоксов не меняется (их по-прежнему ровно два) — расширяется
// только состав пакета, который покрывает checkbox 1.
const CONTRACT_DOCS: LegalDocSlug[] = [
  "terms",
  "offer",
  "subscriptions",
  "points",
  "sessions",
  "uploads",
  "transcription",
  "disclaimer",
];
const PDN_DOCS: LegalDocSlug[] = ["consent", "privacy"];

export type ConsentCheckbox = "CONTRACT" | "PDN";

export interface ConsentContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ConsentRecordInput {
  userId: string;
  checkboxType: ConsentCheckbox;
  documentVersions: Record<string, string>;
  consentVersion: string;
  ipAddress: string | null;
  userAgent: string | null;
}

function versionsFor(slugs: LegalDocSlug[]): Record<string, string> {
  return Object.fromEntries(slugs.map((slug) => [slug, legalDocVersionId(slug)]));
}

/** Builds the two consent records (contract + ПДн) bound to the current versions. */
export function buildConsentRecords(userId: string, ctx: ConsentContext): ConsentRecordInput[] {
  const ipAddress = ctx.ipAddress ?? null;
  const userAgent = ctx.userAgent ?? null;
  return [
    {
      userId,
      checkboxType: "CONTRACT",
      documentVersions: versionsFor(CONTRACT_DOCS),
      consentVersion: legalDocVersionId("offer"),
      ipAddress,
      userAgent,
    },
    {
      userId,
      checkboxType: "PDN",
      documentVersions: versionsFor(PDN_DOCS),
      consentVersion: legalDocVersionId("consent"),
      ipAddress,
      userAgent,
    },
  ];
}

interface ConsentLogDelegate {
  createMany(args: { data: ConsentRecordInput[] }): Promise<unknown>;
}

/** Persists both consent records (one per checkbox) for a newly registered user. */
export async function recordRegistrationConsent(
  consentLog: ConsentLogDelegate,
  userId: string,
  ctx: ConsentContext,
): Promise<void> {
  await consentLog.createMany({ data: buildConsentRecords(userId, ctx) });
}
