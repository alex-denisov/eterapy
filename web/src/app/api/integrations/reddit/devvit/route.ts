import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import {
  devvitBridgeAuthorized,
  devvitPublicationCommands,
  recordDevvitPublicationResult,
} from "@/lib/marketing/devvit-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const subredditSchema = z.string()
  .trim()
  .transform((value) => value.replace(/^r\//i, ""))
  .pipe(z.string().regex(/^[A-Za-z0-9_]{2,21}$/));

const resultSchema = z.object({
  publicationId: z.string().min(1).max(100),
  status: z.enum(["PUBLISHED", "FAILED"]),
  externalPostId: z.string().min(1).max(100).optional(),
  publicUrl: z.string().url().max(2_000).optional(),
  error: z.string().max(500).optional(),
}).strict();

function guard(request: NextRequest) {
  const limit = checkRequestAuthRateLimit(request, "reddit-devvit-bridge", 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  if (!process.env.REDDIT_DEVVIT_SHARED_SECRET?.trim()) {
    return NextResponse.json({ error: "Bridge is not configured" }, { status: 503 });
  }
  if (!devvitBridgeAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function subredditFrom(request: NextRequest) {
  return subredditSchema.safeParse(request.headers.get("x-devvit-subreddit"));
}

export async function GET(request: NextRequest) {
  const blocked = guard(request);
  if (blocked) return blocked;
  const subreddit = subredditFrom(request);
  if (!subreddit.success) {
    return NextResponse.json({ error: "Invalid subreddit" }, { status: 400 });
  }
  return NextResponse.json(
    { commands: await devvitPublicationCommands(subreddit.data) },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const blocked = guard(request);
  if (blocked) return blocked;
  const subreddit = subredditFrom(request);
  if (!subreddit.success) {
    return NextResponse.json({ error: "Invalid subreddit" }, { status: 400 });
  }
  const parsed = resultSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid result" }, { status: 400 });
  }
  const outcome = await recordDevvitPublicationResult(subreddit.data, parsed.data);
  if (outcome === "not_found") {
    return NextResponse.json({ error: "Publication not found" }, { status: 404 });
  }
  if (outcome === "conflict") {
    return NextResponse.json({ error: "Publication state conflict" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, outcome }, { status: 200 });
}
