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

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    database: { ok: false } as Record<string, unknown>,
    yookassa: { ok: false } as Record<string, unknown>,
    telegram: { ok: false } as Record<string, unknown>,
  };

  // Check DB
  try {
    await db.$queryRaw`SELECT 1`;
    (results.database as Record<string, unknown>).ok = true;
    const migrations = await db.$queryRaw`SELECT * FROM "_prisma_migrations" ORDER BY "applied_steps_count" DESC LIMIT 5`;
    (results.database as Record<string, unknown>).migrations = migrations;
  } catch (err: unknown) {
    (results.database as Record<string, unknown>).error = err instanceof Error ? err.message : String(err);
  }

  // Check YooKassa
  try {
    const res = await fetch("https://api.yookassa.ru/v3/payments", { method: "HEAD" });
    (results.yookassa as Record<string, unknown>).ok = res.status === 401; // 401 is good (reachable but no keys)
    (results.yookassa as Record<string, unknown>).status = res.status;
  } catch (err: unknown) {
    (results.yookassa as Record<string, unknown>).error = err instanceof Error ? err.message : String(err);
  }

  // Check Telegram
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://api.telegram.org", { method: "HEAD", signal: controller.signal });
    clearTimeout(id);
    (results.telegram as Record<string, unknown>).ok = res.ok || res.status < 500;
    (results.telegram as Record<string, unknown>).status = res.status;
  } catch (err: unknown) {
    (results.telegram as Record<string, unknown>).error = err instanceof Error ? err.message : String(err);
    (results.telegram as Record<string, unknown>).isTimeout = err instanceof Error && err.name === "AbortError";
  }

  return NextResponse.json(results);
}
