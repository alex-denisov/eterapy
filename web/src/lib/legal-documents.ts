export const LEGAL_DOCUMENT_VERSIONS = {
  offerVersion: "offer-2026-05-16",
  termsVersion: "offer-2026-05-16",
  consentVersion: "payment-consent-2026-06-18",
} as const;

export type LegalDocumentVersionSnapshot = typeof LEGAL_DOCUMENT_VERSIONS;

export function currentLegalDocumentVersionSnapshot(): LegalDocumentVersionSnapshot {
  return { ...LEGAL_DOCUMENT_VERSIONS };
}
