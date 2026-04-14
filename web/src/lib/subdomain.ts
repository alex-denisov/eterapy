/**
 * Subdomain-aware URL helpers for eTerapy routing.
 *
 * In production (VPS): uses app.eterapy.com / admin.eterapy.com
 * In local dev: uses eterapy.com for everything (Docker Desktop TLS limitation)
 */

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN ?? "eterapy.com";
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "app.eterapy.com";
const ADMIN_DOMAIN = process.env.NEXT_PUBLIC_ADMIN_DOMAIN ?? "admin.eterapy.com";
// Use subdomains only when explicitly enabled via env var.
// Set NEXT_PUBLIC_USE_SUBDOMAINS=true on VPS; leave unset for local dev.
const USE_SUBDOMAINS = process.env.NEXT_PUBLIC_USE_SUBDOMAINS === "true";
const PROTOCOL = "https://";

/** Paths that belong on the main (guest) domain */
const MAIN_PATHS = ["/", "/login", "/register", "/practitioners", "/about", "/help",
  "/how-to-choose", "/all-modalities", "/modalities", "/tools", "/legal", "/session"];

/** Paths that belong on the app subdomain */
const APP_PATHS = ["/cabinet"];

/** Paths that belong on the admin subdomain */
const ADMIN_PATHS = ["/admin"];

/**
 * Return the correct domain for a given pathname.
 */
function domainForPath(pathname: string, role?: string): string {
  if (!USE_SUBDOMAINS) return MAIN_DOMAIN;
  if (ADMIN_PATHS.some(p => pathname.startsWith(p))) {
    return ADMIN_DOMAIN;
  }
  if (APP_PATHS.some(p => pathname.startsWith(p))) {
    return APP_DOMAIN;
  }
  return MAIN_DOMAIN;
}

/**
 * Build a fully-qualified URL for the given pathname,
 * using the correct subdomain based on the path pattern.
 */
export function appUrl(pathname: string): string {
  const domain = USE_SUBDOMAINS ? APP_DOMAIN : MAIN_DOMAIN;
  return `${PROTOCOL}${domain}${pathname}`;
}

export function adminUrl(pathname: string): string {
  const domain = USE_SUBDOMAINS ? ADMIN_DOMAIN : MAIN_DOMAIN;
  return `${PROTOCOL}${domain}${pathname}`;
}

export function mainUrl(pathname: string): string {
  return `${PROTOCOL}${MAIN_DOMAIN}${pathname}`;
}

/**
 * Given a pathname, return the correct fully-qualified URL
 * based on which subdomain should serve it.
 */
export function subdomainUrl(pathname: string, role?: string): string {
  const domain = domainForPath(pathname, role);
  return `${PROTOCOL}${domain}${pathname}`;
}

/**
 * Cabinet-specific helper — always returns app.eterapy.com URL in production,
 * eterapy.com in local dev.
 */
export function cabinetUrl(pathname: string): string {
  const domain = USE_SUBDOMAINS ? APP_DOMAIN : MAIN_DOMAIN;
  if (pathname.startsWith("/")) return `${PROTOCOL}${domain}${pathname}`;
  return `${PROTOCOL}${domain}/${pathname}`;
}

/**
 * Admin-specific helper
 */
export function adminPanelUrl(pathname: string): string {
  const domain = USE_SUBDOMAINS ? ADMIN_DOMAIN : MAIN_DOMAIN;
  if (pathname.startsWith("/")) return `${PROTOCOL}${domain}${pathname}`;
  return `${PROTOCOL}${domain}/${pathname}`;
}

/**
 * Determine which subdomain is serving the current request.
 * Works both server-side (from headers) and client-side (from window.location).
 */
export function getSubdomain(host?: string | null): "app" | "admin" | "main" {
  const h = host ?? (typeof window !== "undefined" ? window.location.host : null);
  if (!h) return "main";
  const clean = h.split(":")[0].toLowerCase();
  if (clean === APP_DOMAIN) return "app";
  if (clean === ADMIN_DOMAIN) return "admin";
  return "main";
}
