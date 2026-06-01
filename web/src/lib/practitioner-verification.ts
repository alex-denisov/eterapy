export const PRACTITIONER_VERIFICATION_PREFIX = "VERIFICATION_REQUEST:";

export function makePractitionerVerificationMarker(practitionerId: string) {
  return `${PRACTITIONER_VERIFICATION_PREFIX}${practitionerId}`;
}

export function parsePractitionerVerificationMarker(value: string | null | undefined) {
  if (!value?.startsWith(PRACTITIONER_VERIFICATION_PREFIX)) return null;
  const practitionerId = value.slice(PRACTITIONER_VERIFICATION_PREFIX.length).trim();
  return practitionerId || null;
}
