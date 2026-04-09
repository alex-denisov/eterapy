/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

/**
 * DELETE /api/auth/cleanup-test-user
 * Deletes the placeholder VK test user.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const deleted = await db.user.deleteMany({ where: { email } });

    return NextResponse.json({
      deleted: deleted.count,
      email,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
