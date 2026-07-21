const FIRST_PARTY_HOSTS = new Set([
  "eterapy.com",
  "www.eterapy.com",
  "app.eterapy.com",
  "staging.eterapy.com",
]);

const EXPLICIT_EXTERNAL_PREFIXES = [
  "/api/",
  "/legal/",
  "/products/print/",
] as const;

const PRODUCT_ROUTE_ALIASES: Record<string, string> = {
  natal: "natal-chart",
};

const MINIAPP_PRODUCT_SLUGS = new Set([
  "reframe", "deep-report", "chat-analysis", "pair", "tarot",
  "natal-chart", "synastry", "horary", "tarot-numerology",
  "numerology", "family-scenarios", "human-design", "surname-story",
]);

function withSearchAndHash(pathname: string, source: URL): string {
  return `${pathname}${source.search}${source.hash}`;
}

function accountRoute(pathname: string, source: URL): string {
  const params = new URLSearchParams(source.searchParams);
  params.set("mode", pathname === "/register" ? "register" : "login");
  const next = params.get("next");
  if (next) {
    params.delete("next");
    params.set("returnTo", toMiniAppPath(next));
  }
  const query = params.toString();
  return `/miniapp/account${query ? `?${query}` : ""}${source.hash}`;
}

/**
 * Converts a first-party client continuation into its Mini App presentation.
 * Business APIs, legal documents, exports, provider redirects and truly
 * external links deliberately remain unchanged.
 */
export function toMiniAppPath(href: string): string {
  if (!href || href.startsWith("#") || /^(?:mailto|tel):/i.test(href)) return href;

  let source: URL;
  try {
    source = new URL(href, "https://eterapy.com");
  } catch {
    return href;
  }

  const isRelative = href.startsWith("/");
  if (!isRelative && !FIRST_PARTY_HOSTS.has(source.hostname)) return href;

  const pathname = source.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/miniapp" || pathname.startsWith("/miniapp/")) {
    return withSearchAndHash(pathname, source);
  }
  if (EXPLICIT_EXTERNAL_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return href;
  }

  if (pathname === "/login" || pathname === "/register") return accountRoute(pathname, source);
  if (pathname === "/forgot-password" || pathname === "/auth/forgot-password") return withSearchAndHash("/miniapp/account/recover", source);
  if (pathname === "/checkin") return withSearchAndHash("/miniapp/checkin", source);
  if (pathname === "/library" || pathname.startsWith("/library/")) return withSearchAndHash(`/miniapp${pathname}`, source);
  // B565: `/help` в вебе — публичная база знаний, а Центр поддержки живёт
  // отдельно (`/support` в кабинете). В мини-аппе теперь так же.
  //
  // `/legal/*` сознательно остаётся в `EXPLICIT_EXTERNAL_PREFIXES` и открывается
  // канонической публичной страницей — это решение принято раньше и не входит в
  // задачу. Экран `/miniapp/legal/[doc]` (тот же пакет документов) существует и
  // доступен из шторки «Помощь»; переводить туда ВСЕ правовые ссылки —
  // отдельное решение владельца.
  if (pathname === "/help") return withSearchAndHash("/miniapp/faq", source);
  if (pathname === "/support") return withSearchAndHash("/miniapp/support", source);
  if (["/catalog", "/tools", "/modalities", "/all-modalities"].includes(pathname)) return withSearchAndHash("/miniapp/services", source);
  if (pathname.startsWith("/tools/") || pathname.startsWith("/modalities/") || pathname.startsWith("/all-modalities/")) {
    const sourceSlug = pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (sourceSlug === "checkin") return withSearchAndHash("/miniapp/checkin", source);
    const slug = PRODUCT_ROUTE_ALIASES[sourceSlug] ?? sourceSlug;
    return withSearchAndHash(MINIAPP_PRODUCT_SLUGS.has(slug) ? miniAppProductPath(slug) : "/miniapp/services", source);
  }
  if (["/specialists", "/experts"].includes(pathname)) return withSearchAndHash("/miniapp/practitioners", source);
  if (pathname.startsWith("/session/")) return withSearchAndHash(pathname.replace("/session/", "/miniapp/session/"), source);
  if (pathname === "/products") return withSearchAndHash("/miniapp/services", source);
  if (pathname === "/pricing") return withSearchAndHash("/miniapp/packages", source);
  if (pathname === "/practitioners" || pathname.startsWith("/practitioners/")) {
    return withSearchAndHash(`/miniapp${pathname}`, source);
  }
  if (pathname === "/cabinet/diary" || pathname === "/diary") {
    return withSearchAndHash("/miniapp/diary", source);
  }
  if (["/cabinet/wallet", "/cabinet/credits", "/wallet"].includes(pathname)) return withSearchAndHash("/miniapp/profile/wallet", source);
  if (["/cabinet/billing", "/billing"].includes(pathname)) return withSearchAndHash("/miniapp/profile/subscription", source);
  if (pathname === "/cabinet/bookings") return withSearchAndHash("/miniapp/profile/bookings", source);
  if (pathname === "/cabinet/messages") return withSearchAndHash("/miniapp/profile/materials", source);
  if (pathname.startsWith("/cabinet/messages/")) return withSearchAndHash(pathname.replace("/cabinet/messages/", "/miniapp/materials/"), source);
  if (pathname === "/cabinet/chat") return withSearchAndHash("/miniapp/products/chat", source);
  if (pathname === "/cabinet/modalities") return withSearchAndHash("/miniapp/services", source);
  if (pathname.startsWith("/cabinet/modalities/")) return withSearchAndHash(pathname.replace("/cabinet/modalities/", "/miniapp/products/"), source);
  if (pathname === "/cabinet/invite") return withSearchAndHash("/miniapp/profile/invites", source);
  if (pathname === "/cabinet/settings") return withSearchAndHash("/miniapp/profile", source);
  if (pathname === "/cabinet/support") return withSearchAndHash("/miniapp/support", source);
  if (pathname === "/cabinet/questions") return withSearchAndHash("/miniapp/library", source);
  if (pathname === "/cabinet/practitioners" || pathname.startsWith("/cabinet/practitioners/")) {
    return withSearchAndHash(pathname.replace("/cabinet/practitioners", "/miniapp/practitioners"), source);
  }
  if (pathname.startsWith("/cabinet/results/")) {
    return withSearchAndHash(pathname.replace("/cabinet/results/", "/miniapp/results/"), source);
  }
  if (pathname === "/cabinet/practice") return withSearchAndHash("/miniapp/practice", source);
  if (pathname === "/cabinet" || pathname.startsWith("/cabinet/")) {
    return withSearchAndHash("/miniapp/profile", source);
  }
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return withSearchAndHash("/miniapp/profile", source);
  if (pathname === "/products/chat" || pathname.startsWith("/products/")) {
    return withSearchAndHash(pathname.replace("/products/", "/miniapp/products/"), source);
  }

  return href;
}

export function miniAppProductPath(slug: string): string {
  return slug === "chat-session"
    ? "/miniapp/products/chat"
    : `/miniapp/products/${encodeURIComponent(slug)}`;
}

export function isMiniAppInternalPath(href: string): boolean {
  return href.startsWith("/miniapp") || href.startsWith("#");
}

export function miniAppLoginPath(next: string, mode: "login" | "register" = "login"): string | null {
  if (!next.startsWith("/miniapp")) return null;
  return `/miniapp/account?mode=${mode}&returnTo=${encodeURIComponent(next)}`;
}
