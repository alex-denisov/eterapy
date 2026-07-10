/**
 * B466/B480 — «форматы сессий»: a real, bookable attribute describing how many
 * people join a session. Owner (2026-07-10): «ничего в механиках не происходит
 * нового — это всего лишь сессия для нескольких человек одновременно». So a
 * format is a LABEL on the session; it does NOT change pricing (price stays per
 * duration) or the booking mechanic.
 *
 * PURE + client-safe (no db / next / server imports) so every surface can share
 * one source of truth:
 *   • the public /practitioners catalog + profile (which formats are offered),
 *   • the cabinet «Услуги» editor + the superadmin user modal (declare offered),
 *   • «Записать» (practitioner picks the format for a proposed session),
 *   • the session card chip (shows the booked format).
 *
 * NB: distinct from the `joint` taxonomy directions (couple/family-session),
 * which describe a SPECIALIZATION, not the head-count of a given session.
 */

export interface SessionFormatOption {
  id: string;
  label: string;
  hint: string;
}

export const SESSION_FORMATS: SessionFormatOption[] = [
  { id: "individual", label: "Индивидуальная", hint: "Один клиент" },
  { id: "couple", label: "Парная", hint: "Двое участников" },
  { id: "family", label: "Семейная", hint: "Семья или несколько участников" },
];

/** Every practitioner offers this at minimum; the default for any session. */
export const DEFAULT_SESSION_FORMAT = "individual";

export const SESSION_FORMAT_IDS = SESSION_FORMATS.map((f) => f.id);

const FORMAT_BY_ID = new Map(SESSION_FORMATS.map((f) => [f.id, f]));

export function isSessionFormat(id: unknown): id is string {
  return typeof id === "string" && FORMAT_BY_ID.has(id);
}

/** id → label; unknown / null / undefined degrade to «Индивидуальная». */
export function sessionFormatLabel(id: string | null | undefined): string {
  return (isSessionFormat(id) ? FORMAT_BY_ID.get(id)!.label : FORMAT_BY_ID.get(DEFAULT_SESSION_FORMAT)!.label);
}

/**
 * Normalise the set of formats a practitioner offers: keep only valid ids,
 * dedupe, force canonical order, and always guarantee «individual» is present
 * (you cannot opt out of individual sessions). Non-array input → [individual].
 */
export function normalizeOfferedFormats(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const set = new Set<string>([DEFAULT_SESSION_FORMAT]);
  for (const v of raw) {
    if (isSessionFormat(v)) set.add(v);
  }
  return SESSION_FORMAT_IDS.filter((id) => set.has(id));
}

/** Resolve offered ids to full options (canonical order, individual guaranteed). */
export function offeredFormatOptions(input: unknown): SessionFormatOption[] {
  return normalizeOfferedFormats(input).map((id) => FORMAT_BY_ID.get(id)!);
}

/**
 * Normalise a single chosen session format for a booking/proposal. Falls back
 * to «individual» when the value is invalid or (when an `offered` allow-list is
 * given) not actually offered by the practitioner.
 */
export function normalizeBookingFormat(input: unknown, offered?: string[]): string {
  if (!isSessionFormat(input)) return DEFAULT_SESSION_FORMAT;
  if (offered && !normalizeOfferedFormats(offered).includes(input)) return DEFAULT_SESSION_FORMAT;
  return input;
}
