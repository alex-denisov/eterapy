/**
 * INC-064 — registration risk scoring.
 *
 * Production sign-ups showed an automated-abuse pattern: random 18-char
 * mixed-case Latin "names" (`mNXYgzyDaOTXpdpMVn`) with Gmail dot-abuse addresses
 * (`al.e.xzh.ou.3.9.9.9@gmail.com`), never email-verified. `validateName` only
 * checks the character class, so gibberish passed. This computes an explicit
 * per-registration risk score from cheap, deterministic signals so the platform
 * can flag (and optionally block) the obvious bots and surface a score in admin.
 *
 * Pure and unit-tested. Network/IP-velocity signals stay in the existing
 * antifraud pipeline; this focuses on the name/email quality that was missing.
 */

export interface RegistrationRiskSignal {
  flag: string;
  score: number;
  detail?: string;
}

export interface RegistrationRiskResult {
  score: number;
  flags: string[];
  signals: RegistrationRiskSignal[];
  /** >= BLOCK_THRESHOLD — refuse the sign-up outright. */
  block: boolean;
}

export const REGISTRATION_BLOCK_THRESHOLD = 70;
export const REGISTRATION_REVIEW_THRESHOLD = 40;

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "getnada.com",
  "trashmail.com", "sharklasers.com", "maildrop.cc", "dispostable.com",
  "mohmal.com", "fakeinbox.com", "emailondeck.com", "mailnesia.com",
]);

function letters(value: string): string {
  return value.replace(/[^\p{L}]/gu, "");
}

function hasCyrillic(value: string): boolean {
  return /[Ѐ-ӿ]/.test(value);
}

/** Count adjacent lower→UPPER / UPPER→lower transitions (bot names zig-zag). */
export function caseTransitions(value: string): number {
  let transitions = 0;
  for (let i = 1; i < value.length; i++) {
    const prev = value[i - 1];
    const curr = value[i];
    if (!/[a-zA-Z]/.test(prev) || !/[a-zA-Z]/.test(curr)) continue;
    const prevUpper = prev === prev.toUpperCase() && prev !== prev.toLowerCase();
    const currUpper = curr === curr.toUpperCase() && curr !== curr.toLowerCase();
    if (prevUpper !== currUpper) transitions += 1;
  }
  return transitions;
}

/**
 * A single Latin token of ≥12 letters with ≥4 internal case flips has no
 * human-name structure — it is a random-string generator's output. Real names
 * are Cyrillic, or Title-case, or contain a separating space.
 */
export function looksMachineGeneratedName(name: string): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed || hasCyrillic(trimmed)) return false;
  if (/[\s-]/.test(trimmed)) return false; // multi-token names are human-shaped
  const letterOnly = letters(trimmed);
  if (letterOnly.length < 12) return false;
  return caseTransitions(trimmed) >= 4;
}

/**
 * ≥16 letters with ≥6 case flips is beyond any human name shape — the prod
 * bot wave switched from Gmail dot-abuse to plain yahoo.com mailboxes
 * (`mNXYgzyDaOTXpdpMVnKyzUk` / klm5_1@yahoo.com), leaving the name as the
 * only signal, so this tier must block on its own.
 */
export function looksMachineGeneratedNameStrong(name: string): boolean {
  const trimmed = (name ?? "").trim();
  if (!looksMachineGeneratedName(trimmed)) return false;
  return letters(trimmed).length >= 16 && caseTransitions(trimmed) >= 6;
}

/** Gmail local-part dots are ignored by Gmail; heavy dotting multiplies one
 *  mailbox into many "unique" addresses — a classic multi-account signal. */
export function gmailDotAbuseCount(email: string): number {
  const lowered = (email ?? "").trim().toLowerCase();
  const at = lowered.lastIndexOf("@");
  if (at <= 0) return 0;
  const domain = lowered.slice(at + 1);
  if (domain !== "gmail.com" && domain !== "googlemail.com") return 0;
  const local = lowered.slice(0, at).split("+")[0];
  return (local.match(/\./g) ?? []).length;
}

export function isDisposableEmail(email: string): boolean {
  const at = (email ?? "").lastIndexOf("@");
  if (at <= 0) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(email.slice(at + 1).trim().toLowerCase());
}

export interface RegistrationRiskInput {
  name: string;
  email: string;
  /** True when the normalized email already matches another account (gmail twin). */
  aliasDuplicate?: boolean;
}

export function scoreRegistration(input: RegistrationRiskInput): RegistrationRiskResult {
  const signals: RegistrationRiskSignal[] = [];

  if (looksMachineGeneratedNameStrong(input.name)) {
    signals.push({ flag: "machine_generated_name_strong", score: 75, detail: "long random mixed-case token" });
  } else if (looksMachineGeneratedName(input.name)) {
    signals.push({ flag: "machine_generated_name", score: 55, detail: "random mixed-case token" });
  }

  const dots = gmailDotAbuseCount(input.email);
  if (dots >= 5) {
    signals.push({ flag: "gmail_dot_abuse_heavy", score: 40, detail: `${dots} dots` });
  } else if (dots >= 3) {
    signals.push({ flag: "gmail_dot_abuse", score: 20, detail: `${dots} dots` });
  }

  if (isDisposableEmail(input.email)) {
    signals.push({ flag: "disposable_email", score: 60 });
  }

  if (input.aliasDuplicate) {
    signals.push({ flag: "gmail_alias_duplicate", score: 45 });
  }

  const score = Math.min(100, signals.reduce((sum, s) => sum + s.score, 0));
  return {
    score,
    flags: signals.map((s) => s.flag),
    signals,
    block: score >= REGISTRATION_BLOCK_THRESHOLD,
  };
}
