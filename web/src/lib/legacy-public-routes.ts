const toolSlugMap: Record<string, string> = {
  checkin: "/checkin",
  reflection: "/checkin",
  reflexion: "/checkin",
  tarot: "/products/tarot",
  natal: "/products/natal-chart",
  numerology: "/products/numerology",
  horoscope: "/checkin?source=legacy-horoscope",
  guide: "/checkin?source=legacy-guide",
};

const directToolRedirects = new Set(["tarot", "natal", "numerology", "horoscope", "guide"]);

const directLegacyRedirects: Record<string, string> = {
  "/modalities": "/checkin",
  "/tools": "/checkin",
  "/all-modalities": "/checkin",
  "/specialists": "/practitioners",
  "/experts": "/practitioners",
  "/catalog": "/practitioners",
  "/practitioner": "/practitioners",
  "/practitioners/catalog": "/practitioners",
};

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split("?")[0] || "/";
  const withoutTrailingSlash = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
  return withoutTrailingSlash.toLowerCase();
}

export function legacyPublicRedirect(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  const direct = directLegacyRedirects[normalized];
  if (direct) return direct;

  const directToolMatch = normalized.match(/^\/all-modalities\/([^/]+)$/);
  if (directToolMatch && directToolRedirects.has(directToolMatch[1])) {
    return toolSlugMap[directToolMatch[1]] ?? `/checkin?source=legacy-${directToolMatch[1]}`;
  }

  const match = normalized.match(/^\/(?:modalities|tools)\/([^/]+)$/);
  if (!match) return null;

  const mappedSlug = toolSlugMap[match[1]];
  return mappedSlug ?? "/checkin";
}
