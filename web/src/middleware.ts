import { NextRequest, NextResponse } from "next/server";

/**
 * Cloudflare Flexible SSL: браузер → HTTPS → Cloudflare → HTTP → Next.js
 *
 * NextAuth v5 определяет useSecureCookies по протоколу входящего запроса.
 * Когда Cloudflare передаёт HTTP, NextAuth ставит cookie без __Host- префикса,
 * но браузер видит HTTPS и хранит cookie с __Host- → MissingCSRF при логине.
 *
 * Фикс: если x-forwarded-proto = https, переписываем URL на https
 * чтобы NextAuth считал соединение защищённым.
 */
export function middleware(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto");

  // Cloudflare ставит x-forwarded-proto: https
  if (proto === "https" && request.url.startsWith("http:")) {
    const url = request.url.replace(/^http:/, "https:");
    const response = NextResponse.rewrite(new URL(url));
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Применяем ко всем маршрутам включая /api/auth/*
  matcher: ["/((?!_next/static|_next/image|favicon).*)"],
};
