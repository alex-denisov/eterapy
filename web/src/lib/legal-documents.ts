import { legalDocVersionId } from "@/lib/legal/registry";

// Snapshot of the legal-document versions bound to each payment event (B424).
// Sourced from the canonical legal registry (B431) so the offer / terms / PDn
// versions a user accepted always match the currently published documents.
export const LEGAL_DOCUMENT_VERSIONS = {
  offerVersion: legalDocVersionId("offer"),
  termsVersion: legalDocVersionId("terms"),
  consentVersion: legalDocVersionId("consent"),
} as const;

export type LegalDocumentVersionSnapshot = typeof LEGAL_DOCUMENT_VERSIONS;

export function currentLegalDocumentVersionSnapshot(): LegalDocumentVersionSnapshot {
  return { ...LEGAL_DOCUMENT_VERSIONS };
}
