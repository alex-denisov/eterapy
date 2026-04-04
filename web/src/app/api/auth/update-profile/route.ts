import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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
      const bytes = await avatarFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = avatarFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const filename = `${session.user!.id}.${ext}`;
      const dir = path.join(process.cwd(), "public", "avatars");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), buffer);
      avatarUrl = `/avatars/${filename}`;
    }
  } else {
    const body = await req.json();
    name = body.name;
  }

  if (!name?.trim()) return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });

  const data: Record<string, string> = { name: name.trim() };
  if (avatarUrl) data.avatarUrl = avatarUrl;

  await db.user.update({ where: { id: session.user!.id }, data });

  return NextResponse.json({ ok: true });
}
