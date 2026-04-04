import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storeFile } from "@/lib/file-storage";
import db from "@/lib/db";
import { FileKind } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const kind = (formData.get("kind") as FileKind | null) ?? "DOCUMENT";

  if (!file) return NextResponse.json({ error: "Файл не выбран" }, { status: 400 });

  try {
    const { url, fileId } = await storeFile(session.user!.id!, file, kind);

    // If avatar — update user avatarUrl
    if (kind === "AVATAR") {
      await db.user.update({ where: { id: session.user!.id }, data: { avatarUrl: url } });
    }

    return NextResponse.json({ ok: true, url, fileId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка загрузки";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const kind = req.nextUrl.searchParams.get("kind") as FileKind | null;
  const files = await db.storedFile.findMany({
    where: { userId: session.user!.id, ...(kind ? { kind } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ files });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { fileId } = await req.json();
  if (!fileId) return NextResponse.json({ error: "fileId обязателен" }, { status: 400 });

  try {
    const { deleteFile } = await import("@/lib/file-storage");
    await deleteFile(fileId, session.user!.id!);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Ошибка" }, { status: 400 });
  }
}
