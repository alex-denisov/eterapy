// B359 / Баг 17 — recipient display for admin diagnostics. Admins need to know
// «кому» a notification went without the page dumping full PII. We mask the
// local part of the email, keeping just enough to recognise the recipient.

/**
 * Mask an email's local part: `elena.petrova@mail.ru` → `e****a@mail.ru`,
 * short locals → `e*@mail.ru`. The domain is kept (low-sensitivity, helps
 * diagnose provider-side delivery). Returns "—" for empty/invalid input.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const at = email.lastIndexOf("@");
  if (at <= 0) return "—";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return "—";

  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local[0]}${"*".repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

const ROLE_LABELS_RU: Record<string, string> = {
  CLIENT: "Клиент",
  PRACTITIONER: "Практик",
  ADMIN: "Админ",
  SUPERADMIN: "Суперадмин",
  MODERATOR: "Модератор",
};

export function roleLabelRu(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS_RU[role] ?? role;
}
