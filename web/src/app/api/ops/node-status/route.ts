/**
 * B541 — агент-эндпоинт ноды: отдаёт релиз, health и ресурсы хоста.
 *
 * Опрашивается только панелью суперадмина (`lib/fleet/status.ts`) внутри
 * приватной сети флота. Секрет передаётся заголовком `x-ops-secret`.
 * Данные пользователей здесь не появляются — только инфраструктурные метрики.
 */
import { statfs } from "node:fs/promises";
import { freemem, totalmem } from "node:os";
import { NextRequest, NextResponse } from "next/server";
import { getReadinessHealth } from "@/lib/health";
import { requestContextFromHeaders } from "@/lib/request-context";
import { timingSafeEqualString } from "@/lib/ops-secret";
import { parseReleaseSha } from "@/lib/fleet/nodes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function usage(totalBytes: number, freeBytes: number) {
  if (!totalBytes) return undefined;
  return {
    usedPct: Math.round(((totalBytes - freeBytes) / totalBytes) * 100),
    totalBytes,
    freeBytes,
  };
}

async function diskUsage() {
  try {
    const stats = await statfs("/");
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    return usage(totalBytes, freeBytes);
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest) {
  const expected = process.env.FLEET_OPS_SECRET ?? process.env.CRON_SECRET ?? "";
  const provided = req.headers.get("x-ops-secret") ?? "";

  if (!expected || !timingSafeEqualString(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = requestContextFromHeaders(req.headers);
  const ready = await getReadinessHealth(context);

  return NextResponse.json(
    {
      node: process.env.FLEET_NODE_NAME ?? null,
      releaseSha: parseReleaseSha(process.env.ETERAPY_IMAGE) ?? process.env.GIT_SHA ?? null,
      health: ready.status,
      checks: ready.checks.map((check) => ({ name: check.name, status: check.status })),
      uptimeSec: Math.round(process.uptime()),
      disk: await diskUsage(),
      memory: usage(totalmem(), freemem()),
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
