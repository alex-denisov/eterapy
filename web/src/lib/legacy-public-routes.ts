const toolSlugMap: Record<string, string> = {
  checkin: "checkin",
  reflection: "checkin",
  reflexion: "checkin",
  tarot: "checkin?source=legacy-tarot",
  natal: "checkin?source=legacy-natal",
  numerology: "checkin?source=legacy-numerology",
  horoscope: "checkin?source=legacy-horoscope",
  guide: "checkin?source=legacy-guide",
};

const directLegacyRedirects: Record<string, string> = {
  "/modalities": "/all-modalities",
  "/tools": "/all-modalities",
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

  const match = normalized.match(/^\/(?:modalities|tools)\/([^/]+)$/);
  if (!match) return null;

  const mappedSlug = toolSlugMap[match[1]];
  return mappedSlug ? `/all-modalities/${mappedSlug}` : "/all-modalities";
}
