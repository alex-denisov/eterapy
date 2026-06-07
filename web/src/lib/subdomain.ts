export { MAIN_DOMAIN, APP_DOMAIN, ADMIN_DOMAIN } from "@/lib/env";
import { MAIN_DOMAIN, APP_DOMAIN, ADMIN_DOMAIN } from "@/lib/env";

export const PRIMARY_DOMAIN_ONLY = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN_ONLY !== "false";
export const USE_SUBDOMAINS =
  process.env.NEXT_PUBLIC_USE_SUBDOMAINS === "true" && !PRIMARY_DOMAIN_ONLY;
export const PROTOCOL = "https://";
const APP_PATHS = ["/cabinet"];
const ADMIN_PATHS = ["/admin"];
const APP_VISIBLE_PATHS = [
  "/action-history",
  "/questions",
  "/bookings",
  "/wallet",
  "/credits",
  "/practice",
  "/billing",
  "/settings",
  "/practitioner",
];

function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function absoluteUrl(domain: string, pathname: string): string {
  return `${PROTOCOL}${domain}${normalizePath(pathname)}`;
}

function hrefForDomain(domain: string, pathname: string): string {
  const normalized = normalizePath(pathname);
  if (!USE_SUBDOMAINS) return normalized;
  return absoluteUrl(domain, normalized);
}

function domainForPath(pathname: string): string {
  const normalized = normalizePath(pathname);
  if (PRIMARY_DOMAIN_ONLY) return MAIN_DOMAIN;
  if (!USE_SUBDOMAINS) return MAIN_DOMAIN;
  if (ADMIN_PATHS.some(p => normalized.startsWith(p))) {
    return ADMIN_DOMAIN;
  }
  if (APP_PATHS.some(p => normalized.startsWith(p))) {
    return APP_DOMAIN;
  }
  return MAIN_DOMAIN;
}

export function appUrl(pathname: string): string {
  return hrefForDomain(APP_DOMAIN, pathname);
}

export function adminUrl(pathname: string): string {
  return hrefForDomain(ADMIN_DOMAIN, pathname);
}

export function mainUrl(pathname: string): string {
  return hrefForDomain(MAIN_DOMAIN, pathname);
}

export function subdomainUrl(pathname: string): string {
  const domain = domainForPath(pathname);
  return hrefForDomain(domain, pathname);
}

export function homePathForRole(role?: string | null): string {
  if (role === "PRACTITIONER") return "/cabinet/practitioner";
  if (role === "ADMIN" || role === "SUPERADMIN") return "/admin";
  return "/cabinet";
}

export function homeUrlForRole(role?: string | null): string {
  return subdomainUrl(homePathForRole(role ?? undefined));
}

export function loginUrl(): string {
  return mainUrl("/login");
}

export function registerUrl(): string {
  return mainUrl("/register");
}

export function logoutUrl(): string {
  return mainUrl("/api/auth/logout");
}

export function cabinetUrl(pathname: string): string {
  return appUrl(pathname);
}

export function adminPanelUrl(pathname: string): string {
  return adminUrl(pathname);
}

export function getSubdomain(host?: string | null): "app" | "admin" | "main" {
  const h = host ?? (typeof window !== "undefined" ? window.location.host : null);
  if (!h) return "main";
  const clean = h.split(":")[0].toLowerCase();
  if (clean === APP_DOMAIN) return "app";
  if (clean === ADMIN_DOMAIN) return "admin";
  return "main";
}

export function toPathname(href: string): string {
  if (!href) return "/";
  if (href.startsWith("/")) return href;
  try {
    return new URL(href).pathname;
  } catch {
    return href;
  }
}

export function toCabinetPathname(pathname: string): string {
  const normalized = normalizePath(pathname);
  if (normalized === "/cabinet" || normalized.startsWith("/cabinet/")) return normalized;
  if (APP_VISIBLE_PATHS.some((path) => normalized === path || normalized.startsWith(`${path}/`))) {
    return `/cabinet${normalized}`;
  }
  return normalized;
}

export function absoluteMainUrl(pathname: string): string {
  return absoluteUrl(MAIN_DOMAIN, pathname);
}

export function absoluteAppUrl(pathname: string): string {
  return absoluteUrl(APP_DOMAIN, pathname);
}

export function absoluteAdminUrl(pathname: string): string {
  return absoluteUrl(ADMIN_DOMAIN, pathname);
}
