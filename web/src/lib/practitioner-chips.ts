/**
 * B457: a single source of truth for the "с чем помогаю" chips shown on the
 * practitioner card (/practitioners) and the practitioner profile.
 *
 * Owner walkthrough items 9 + 10: the chips used to restate the title/role
 * (Елена «Астролог, нумеролог» → chips «Астрология», «Нумерология») and mixed
 * casing + colour on the profile. We instead surface the concrete TASKS a
 * specialist helps with (their `tags`), falling back to direction/specialty
 * labels only when no tasks are set. Everything is deduped case-insensitively
 * and normalized to a consistent sentence case.
 */
import { directionLabel } from "./practitioner-taxonomy";
import { SPECIALTY_LABELS } from "./types";

export interface PractitionerChipInput {
  directions?: string[] | null;
  specialties?: string[] | null;
  tags?: string[] | null;
}

/** Capitalize the first letter, leaving acronyms (КПТ, EMDR) and the rest intact. */
function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toLocaleUpperCase("ru-RU") + trimmed.slice(1);
}

/** Normalize casing + drop blanks and case-insensitive duplicates, keep order. */
function dedupeNormalize(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = capitalizeFirst(raw);
    if (!label) continue;
    const key = label.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * Tasks-first chips for a practitioner. Prefer `tags` (what they help WITH);
 * fall back to direction labels, then legacy specialty labels.
 */
export function practitionerHelpChips(input: PractitionerChipInput): string[] {
  const tags = (input.tags ?? []).filter((t): t is string => Boolean(t && t.trim()));
  if (tags.length > 0) return dedupeNormalize(tags);

  const directions = (input.directions ?? []).filter(Boolean);
  if (directions.length > 0) return dedupeNormalize(directions.map(directionLabel));

  const specialties = (input.specialties ?? []).filter(Boolean);
  return dedupeNormalize(specialties.map((s) => SPECIALTY_LABELS[s] ?? s));
}
