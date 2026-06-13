import { MAIN_DOMAIN, APP_DOMAIN, ADMIN_DOMAIN } from "@/lib/env";

export const seoHosts = {
  main: MAIN_DOMAIN,
  app: APP_DOMAIN,
  admin: ADMIN_DOMAIN,
} as const;

export const seoOrigins = {
  main: `https://${MAIN_DOMAIN}`,
  app: `https://${APP_DOMAIN}`,
  admin: `https://${ADMIN_DOMAIN}`,
} as const;

export const publicSeoRoutes = [
  "/",
  "/about",
  "/help",
  "/how-it-works",
  "/how-to-choose",
  "/pricing",
  "/telegram",
  "/products/pair",
  "/library",
  "/products",
  "/pricing/compare",
  "/products/clarity-practice",
  "/products/perspectives",
  "/products/deep-report",
  "/products/chat-analysis",
  "/products/compatibility",
  "/products/seven-days",
  "/products/my-map",
  "/products/tarot",
  "/products/natal-chart",
  "/products/synastry",
  "/products/numerology",
  "/products/family-scenarios",
  "/all-modalities",
  "/checkin",
  "/practitioners",
  "/practitioners/apply",
  "/legal/ethics",
  "/legal/offer",
  "/legal/privacy",
] as const;

export const protectedNoIndexPrefixes = [
  "/admin",
  "/cabinet",
  "/dashboard",
  "/session",
  "/api",
] as const;

export const noIndexRobots = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
} as const;

export function canonicalUrl(pathname: string = "/"): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalizedPath, seoOrigins.main).toString();
}

export function hostKind(hostHeader: string | null): "main" | "app" | "admin" | "unknown" {
  const host = (hostHeader ?? "").split(":")[0]?.toLowerCase();
  if (host === seoHosts.main || host === `www.${seoHosts.main}`) return "main";
  if (host === seoHosts.app) return "app";
  if (host === seoHosts.admin) return "admin";
  return "unknown";
}

export function shouldNoIndex(hostHeader: string | null, pathname: string): boolean {
  const kind = hostKind(hostHeader);
  if (kind === "app" || kind === "admin") return true;
  return protectedNoIndexPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
