import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ensureGuestSession } from "@/lib/guest-session";

export function GET(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const guest = ensureGuestSession(request, response);

  return NextResponse.json(
    {
      ok: true,
      created: guest.created,
    },
    {
      headers: response.headers,
    }
  );
}
