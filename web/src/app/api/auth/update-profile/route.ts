import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { storeFile } from "@/lib/file-storage";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  let name: string | null = null;
  let avatarUrl: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    name = formData.get("name") as string | null;
    const avatarFile = formData.get("avatar") as File | null;

    if (avatarFile && avatarFile.size > 0) {
      const { url } = await storeFile(session.user!.id!, avatarFile, "AVATAR");
      avatarUrl = url;
    }
  } else {
    const body = await req.json();
    name = body.name;
  }

  if (!name?.trim()) return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });

  const data: Record<string, string> = { name: name.trim() };
  if (avatarUrl) data.avatarUrl = avatarUrl;

  await db.user.update({ where: { id: session.user!.id }, data });

  return NextResponse.json({ ok: true, avatarUrl });
}
