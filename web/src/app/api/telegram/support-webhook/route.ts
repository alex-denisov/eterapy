import { NextResponse } from "next/server";

/**
 * B482: Telegram is outbound alerting only. Keep a 200 endpoint while the old
 * webhook registration ages out so Telegram does not retry deliveries, but do
 * not parse, persist or route any inbound support content.
 */
export async function POST() {
  return NextResponse.json({ ok: true, supportRepliesDisabled: true });
}
