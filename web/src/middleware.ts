import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Redirect logged-in users away from the guest landing page
  if (request.nextUrl.pathname === "/") {
    const sessionCookie = request.cookies.get("authjs.session-token")
      || request.cookies.get("__Secure-authjs.session-token")
      || request.cookies.get("next-auth.session-token");

    if (sessionCookie) {
      // Parse the JWT to get the user role
      const [, payloadBase64] = sessionCookie.value.split(".");
      try {
        const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf-8"));
        const role = payload.role as string | undefined;

        if (role === "PRACTITIONER") {
          return NextResponse.redirect(new URL("/cabinet/practitioner", request.url));
        }
        if (role === "ADMIN" || role === "SUPERADMIN") {
          return NextResponse.redirect(new URL("/admin", request.url));
        }
        // CLIENT or unknown -> cabinet
        return NextResponse.redirect(new URL("/cabinet", request.url));
      } catch {
        // If we can't parse the cookie, let them through to the landing page
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
