/**
 * PATCH /api/practitioner/profile — обновление профиля практика самим практиком
 * Поля: title, bio, experience, specialties, tags, languages
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { storeFile } from "@/lib/file-storage";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user?.role !== "PRACTITIONER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  let data: Record<string, unknown> = {};
  let avatarUrl: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    data = {
      title:       formData.get("title") as string,
      bio:         formData.get("bio") as string,
      experience:  formData.get("experience") as string,
      categories:  JSON.parse(formData.get("categories") as string ?? "[]"),
      directions:  JSON.parse(formData.get("directions") as string ?? "[]"),
      specialties: JSON.parse(formData.get("specialties") as string ?? "[]"),
      tags:        JSON.parse(formData.get("tags") as string ?? "[]"),
      languages:   JSON.parse(formData.get("languages") as string ?? "[]"),
    };
    const avatarFile = formData.get("avatar") as File | null;
    if (avatarFile && avatarFile.size > 0) {
      const stored = await storeFile(session.user.id, avatarFile, "AVATAR");
      avatarUrl = stored.url;
    }
  } else {
    data = await req.json();
  }

  const p = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!p) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  await db.practitioner.update({
    where: { id: p.id },
    data: {
      ...(data.title       ? { title:       data.title as string }                   : {}),
      ...(data.bio         ? { bio:         data.bio as string }                     : {}),
      ...(data.experience  ? { experience:  data.experience as string }              : {}),
      ...(Array.isArray(data.categories) ? { categories:  data.categories as string[] }  : {}),
      ...(Array.isArray(data.directions) ? { directions:  data.directions as string[] }  : {}),
      ...(Array.isArray(data.specialties) ? { specialties: { set: data.specialties as never[] } } : {}),
      ...(Array.isArray(data.tags)        ? { tags:        data.tags as string[] }        : {}),
      ...(Array.isArray(data.languages)   ? { languages:   data.languages as string[] }   : {}),
    },
  });

  if (avatarUrl) {
    await db.user.update({ where: { id: session.user.id }, data: { avatarUrl } });
  }

  await logAudit(session.user.id, "PROFILE_UPDATE", undefined, "Практик обновил профиль");

  return NextResponse.json({ ok: true, avatarUrl });
}
