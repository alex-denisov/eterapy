/**
 * B457: pure tab logic for the /practitioners catalog, extracted from the grid
 * client component so the smart-default ("never show an empty catalog on load")
 * is unit-testable.
 *
 * B379 (M26): the catalog opens on «Психология и коучинг» by default; esoteric
 * is a separate tab; universals (psychology + esoteric) land in both relevant
 * tabs. B457 adds: if the default tab is empty, fall back to the first tab that
 * actually has specialists so the grid never renders empty on first load.
 */
import { effectiveCategories } from "./practitioner-taxonomy";

export type PractitionerTabId = "psy-coach" | "esoteric" | "all";

export interface PractitionerTab {
  id: PractitionerTabId;
  label: string;
  match: (cats: string[]) => boolean;
}

export const PRACTITIONER_TABS: PractitionerTab[] = [
  { id: "psy-coach", label: "Психология и коучинг", match: (c) => c.includes("psychology") || c.includes("coaching") },
  { id: "esoteric", label: "Эзотерика", match: (c) => c.includes("esoteric") },
  { id: "all", label: "Все специалисты", match: () => true },
];

export const DEFAULT_PRACTITIONER_TAB: PractitionerTabId = "psy-coach";

/** Type guard for a catalog tab id coming from an untrusted source (URL query). */
export function isPractitionerTabId(value: string | null | undefined): value is PractitionerTabId {
  return value === "psy-coach" || value === "esoteric" || value === "all";
}

/**
 * Deep-link `?format=` query value → catalog tab. Keeps the practitioner CTA on
 * product pages connected to the filtered grid view. Esoteric sub-types
 * (tarot/astro/numerology …) all route to «Эзотерика».
 */
export const FORMAT_TO_TAB: Record<string, PractitionerTabId> = {
  psychology: "psy-coach",
  psy: "psy-coach",
  coaching: "psy-coach",
  coach: "psy-coach",
  legal: "all",
  finance: "all",
  tarot: "esoteric",
  astrology: "esoteric",
  astro: "esoteric",
  numerology: "esoteric",
  numero: "esoteric",
  esoteric: "esoteric",
};

/**
 * Effective categories for tab matching, with the legacy "joint" category
 * expanded to psychology + esoteric (the closed joint-session service was
 * replaced by a universal badge — M26/B367).
 */
export function tabCategories(input: {
  categories?: string[];
  specialties?: string[];
  title?: string | null;
}): string[] {
  const raw = effectiveCategories(input) as string[];
  return raw.includes("joint")
    ? [...new Set([...raw.filter((c) => c !== "joint"), "psychology", "esoteric"])]
    : raw;
}

/** First tab (in priority order) that has ≥1 matching specialist; else the default. */
export function firstNonEmptyTab(allCats: string[][]): PractitionerTabId {
  for (const tab of PRACTITIONER_TABS) {
    if (allCats.some((cats) => tab.match(cats))) return tab.id;
  }
  return DEFAULT_PRACTITIONER_TAB;
}

/**
 * Initial tab. Precedence (B460):
 *   1. an explicit `?tab=` — the user's last catalog choice, pinned into the URL
 *      so it survives a profile open + browser back / shareable reload;
 *   2. an inbound `?format=` deep-link from a product-page CTA;
 *   3. the smart-default (first non-empty tab).
 */
export function resolveInitialTab(
  allCats: string[][],
  formatParam: string | null,
  tabParam?: string | null,
): PractitionerTabId {
  if (isPractitionerTabId(tabParam)) return tabParam;
  if (formatParam && FORMAT_TO_TAB[formatParam]) return FORMAT_TO_TAB[formatParam];
  return firstNonEmptyTab(allCats);
}

/**
 * B460: the query string the grid pins (via `history.replaceState`) when a tab
 * is picked — sets `?tab=`, preserves unrelated params (e.g. `sort`), and drops
 * the inbound-only `?format=` hint so the explicit tab token governs the
 * round-trip back from a profile.
 */
export function tabQueryString(currentSearch: string, id: PractitionerTabId): string {
  const params = new URLSearchParams(currentSearch);
  params.set("tab", id);
  params.delete("format");
  return params.toString();
}

/**
 * B460: relative `/practitioners` URL (with its filter query) derived from a
 * profile's `document.referrer`, so the back-arrow returns to the filtered list.
 * Returns null when the referrer is missing, cross-origin, or not the catalog —
 * the caller then falls back to the bare path.
 */
export function listHrefFromReferrer(referrer: string, origin: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.origin !== origin) return null;
    if (url.pathname !== "/practitioners") return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}
