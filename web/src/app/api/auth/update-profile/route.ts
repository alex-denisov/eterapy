import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { storeFile } from "@/lib/file-storage";
import { validateName } from "@/lib/validation";

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
  if (!validateName(name.trim())) return NextResponse.json({ error: "Имя может содержать только буквы, пробелы и дефисы (макс. 50 символов)" }, { status: 400 });

  const sanitized = name.trim().slice(0, 50);
  const data: Record<string, string> = { name: sanitized };
  if (avatarUrl) data.avatarUrl = avatarUrl;

  await db.user.update({ where: { id: session.user!.id }, data });
  await logAudit(session.user!.id!, "PROFILE_UPDATE", undefined, avatarUrl ? "Профиль + аватар" : "Профиль");
  // B464 round-4 #7: a bare name/avatar save no longer completes the
  // «Рассказать о себе» mission — it counts only when the extended profile
  // carries meaningful personalisation data (see extended-profile route).

  return NextResponse.json({ ok: true, avatarUrl });
}
