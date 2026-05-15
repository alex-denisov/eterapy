import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { readGuestSessionId } from "@/lib/guest-session";
import { requestContextFromHeaders } from "@/lib/request-context";
import { createHash } from "crypto";

const schema = z.object({
  event: z.string().min(1).max(120),
  surface: z.string().max(80).optional(),
  dialogueId: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export async function POST(request: NextRequest) {
  requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const guestSessionId = userId ? null : readGuestSessionId(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const { event, surface, dialogueId, properties } = parsed.data;

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : null;
  const userAgent = request.headers.get("user-agent");

  await db.analyticsEvent.create({
    data: {
      event,
      userId,
      sessionId: guestSessionId,
      dialogueId: dialogueId ?? null,
      surface: surface ?? null,
      properties: properties ? (properties as Record<string, string>) : undefined,
      ipHash: hashIp(ip),
      userAgent: userAgent ? userAgent.slice(0, 300) : null,
    },
  }).catch(() => { /* non-critical — don't fail the request */ });

  return NextResponse.json({ ok: true });
}
