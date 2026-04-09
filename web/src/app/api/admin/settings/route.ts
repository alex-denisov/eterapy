import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllSettings, setSettings } from "@/lib/platform-settings";

function isSuperAdmin(role: string | undefined) {
  return role === "SUPERADMIN";
}

export async function GET() {
  const session = await auth();
  if (!isSuperAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const settings = await getAllSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isSuperAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { settings } = await req.json() as { settings: Record<string, string> };
  if (!settings || typeof settings !== "object") {
    return NextResponse.json({ error: "settings объект обязателен" }, { status: 400 });
  }

  await setSettings(settings, session?.user?.id);
  return NextResponse.json({ ok: true });
}
