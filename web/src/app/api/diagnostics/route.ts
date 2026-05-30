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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Check Telegram — probe the actual bot via getMe. A HEAD to the bare host
  // (api.telegram.org) does NOT reflect bot health and produced a false "down"
  // (B4). getMe returns {ok:true,result:{username}} for a valid token.
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      (results.telegram as Record<string, unknown>).ok = false;
      (results.telegram as Record<string, unknown>).error = "TELEGRAM_BOT_TOKEN not set";
    } else {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: controller.signal });
      clearTimeout(id);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { username?: string } };
      (results.telegram as Record<string, unknown>).ok = Boolean(data?.ok);
      (results.telegram as Record<string, unknown>).status = res.status;
      if (data?.result?.username) (results.telegram as Record<string, unknown>).username = data.result.username;
      if (!data?.ok && data?.description) (results.telegram as Record<string, unknown>).error = data.description;
    }
  } catch (err: unknown) {
    (results.telegram as Record<string, unknown>).error = err instanceof Error ? err.message : String(err);
    (results.telegram as Record<string, unknown>).isTimeout = err instanceof Error && err.name === "AbortError";
  }

  return NextResponse.json(results);
}
