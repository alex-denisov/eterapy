import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_request: NextRequest) {
  // Middleware сейчас не нужен — вся авторизация через layout/API
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
