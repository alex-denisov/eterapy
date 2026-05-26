import { NextRequest, NextResponse } from "next/server";
import { getApprovedLibraryEntry } from "@/data/anonymous-library";
import { getSetting, setSetting } from "@/lib/platform-settings";
import { log, serializeError } from "@/lib/logger";

const KEY = (slug: string) => `library.reactions.${slug}`;

/**
 * POST /api/library/[slug]/track — increment "прошли разбор" counter.
 *
 * The counter is stored in the platformSetting table so we don't need a
 * dedicated migration. Each entry's published baseline (from the static
 * catalogue) is added to the persisted increment at read time.
 *
 * The endpoint is best-effort: it does not require auth (anyone hitting
 * "Начать свой разбор" on a library card triggers the increment) and it
 * silently 200s if the DB is unavailable so the UX is not blocked.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getApprovedLibraryEntry(slug);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const currentRaw = await getSetting(KEY(slug));
    const current = Number.parseInt(currentRaw || "0", 10) || 0;
    const next = current + 1;
    await setSetting(KEY(slug), String(next));
    return NextResponse.json({ ok: true, total: entry.reactions + next });
  } catch (error) {
    log.warn("library-track-failed", { slug, error: serializeError(error) });
    return NextResponse.json({ ok: true, total: entry.reactions, persisted: false });
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getApprovedLibraryEntry(slug);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const currentRaw = await getSetting(KEY(slug));
    const current = Number.parseInt(currentRaw || "0", 10) || 0;
    return NextResponse.json({ total: entry.reactions + current });
  } catch {
    return NextResponse.json({ total: entry.reactions, persisted: false });
  }
}
