// B372 (M26): нормализация e-mail для антифрода gmail-дублей.
// Gmail игнорирует точки и всё после «+» в local part, а googlemail.com —
// псевдоним gmail.com: a.b.c+x@googlemail.com доставляется в abc@gmail.com.

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function normalizeEmailForFraud(email: string): string {
  const lowered = (email ?? "").trim().toLowerCase();
  const atIndex = lowered.lastIndexOf("@");
  if (atIndex <= 0) return lowered;

  const local = lowered.slice(0, atIndex);
  const domain = lowered.slice(atIndex + 1);
  if (!GMAIL_DOMAINS.has(domain)) return lowered;

  const withoutSuffix = local.split("+")[0];
  return `${withoutSuffix.replace(/\./g, "")}@gmail.com`;
}

export function isGmailAlias(candidateEmail: string, existingEmail: string): boolean {
  const a = normalizeEmailForFraud(candidateEmail);
  const b = normalizeEmailForFraud(existingEmail);
  if (a !== b) return false;
  // Алиасом считаем только gmail-схлопывание, не простое расхождение регистра.
  return a.endsWith("@gmail.com");
}
