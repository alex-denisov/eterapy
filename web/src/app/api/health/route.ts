import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  let dbStatus = "unknown";
  let userCount = 0;

  try {
    userCount = await db.user.count();
    dbStatus = "ok";
  } catch (err) {
    dbStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.0.1",
      db: dbStatus,
      users: userCount,
    },
    { status: 200 }
  );
}
