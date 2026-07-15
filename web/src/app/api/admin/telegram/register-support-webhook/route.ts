import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/** Legacy endpoint retained as an explicit guard against re-enabling replies. */
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Только суперадмин" }, { status: 403 });
  }
  return NextResponse.json(
    { ok: false, error: "B482: входящие ответы через Telegram отключены" },
    { status: 410 },
  );
}
