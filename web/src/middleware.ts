import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Redirect logged-in users from guest landing page
  if (pathname === "/") {
    const sessionCookie = request.cookies.get("authjs.session-token")
      || request.cookies.get("__Secure-authjs.session-token")
      || request.cookies.get("next-auth.session-token");

    if (sessionCookie) {
      const [, payloadBase64] = sessionCookie.value.split(".");
      try {
        const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf-8"));
        const role = payload.role as string | undefined;
        const dest = (role === "PRACTITIONER") ? "/cabinet/practitioner"
                   : (role === "ADMIN" || role === "SUPERADMIN") ? "/admin"
                   : "/cabinet";
        return NextResponse.redirect(new URL(dest, request.url));
      } catch { /* ignore */ }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
