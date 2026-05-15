import { NextResponse } from "next/server";

// This endpoint was a test utility. It is permanently disabled in all environments
// to prevent unauthenticated user deletion. Do not re-enable without SUPERADMIN
// auth guard and NODE_ENV=test guard.
export async function POST() {
  return NextResponse.json({ error: "Not available" }, { status: 404 });
}
