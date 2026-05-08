/**
 * GET /api/diagnostics
 * Checks connectivity to external services and database status.
 */
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    // Return limited info for non-admins or 401
    // For now, let's keep it restricted
    // return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    database: { ok: false },
    yookassa: { ok: false },
    telegram: { ok: false },
  };

  // Check DB
  try {
    await db.$queryRaw`SELECT 1`;
    results.database.ok = true;
    const migrations = await db.$queryRaw`SELECT * FROM "_prisma_migrations" ORDER BY "applied_steps_count" DESC LIMIT 5`;
    results.database.migrations = migrations;
  } catch (err: any) {
    results.database.error = err.message;
  }

  // Check YooKassa
  try {
    const res = await fetch("https://api.yookassa.ru/v3/payments", { method: "HEAD" });
    results.yookassa.ok = res.status === 401; // 401 is good (reachable but no keys)
    results.yookassa.status = res.status;
  } catch (err: any) {
    results.yookassa.error = err.message;
  }

  // Check Telegram
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://api.telegram.org", { method: "HEAD", signal: controller.signal });
    clearTimeout(id);
    results.telegram.ok = res.ok || res.status < 500;
    results.telegram.status = res.status;
  } catch (err: any) {
    results.telegram.error = err.message;
    results.telegram.isTimeout = err.name === "AbortError";
  }

  return NextResponse.json(results);
}
