import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SHARED_COOKIE_DOMAIN } from "@/lib/auth.config";
import { mainUrl } from "@/lib/subdomain";

const BASE_EXPIRED = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires: new Date(0),
  maxAge: 0,
};

function clearCookie(response: NextResponse, name: string, withDomain = false) {
  response.cookies.set(name, "", {
    ...BASE_EXPIRED,
    ...(withDomain && SHARED_COOKIE_DOMAIN ? { domain: SHARED_COOKIE_DOMAIN } : {}),
  });
}

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL(mainUrl("/"), request.url));

  const names = [
    SESSION_COOKIE_NAME,
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-authjs.callback-url",
    "authjs.callback-url",
    "__Host-authjs.csrf-token",
    "authjs.csrf-token",
    "admin-impersonating",
    "admin-session-backup",
    "__Host-admin-session-backup",
  ];

  for (const name of names) {
    clearCookie(response, name, false);
    clearCookie(response, name, true);
  }

  return response;
}
