import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("__Secure-authjs.session-token")
    ?? request.cookies.get("authjs.session-token");
  if (!sessionCookie) return NextResponse.next();

  const pathname = request.nextUrl.pathname;

  // Don't redirect if path contains undefined/null/empty segments
  if (pathname.includes("undefined") || pathname.includes("null")) {
    return NextResponse.next();
  }

  // Redirect /practitioners → /cabinet/practitioners for logged-in users
  // But NOT /practitioners/apply
  if (pathname === "/practitioners") {
    const newUrl = new URL("/cabinet/practitioners" + request.nextUrl.search, request.url);
    return NextResponse.redirect(newUrl);
  }
  if (pathname.startsWith("/practitioners/") && pathname !== "/practitioners/apply") {
    const newPath = pathname.replace("/practitioners/", "/cabinet/practitioners/");
    const newUrl = new URL(newPath + request.nextUrl.search, request.url);
    return NextResponse.redirect(newUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/practitioners/:path*"],
};
