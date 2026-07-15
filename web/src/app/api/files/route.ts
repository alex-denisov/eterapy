import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storeFile } from "@/lib/file-storage";
import db from "@/lib/db";
import { FileKind } from "@prisma/client";
import { authRateLimitResponse, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";

const CLIENT_UPLOAD_KINDS = new Set<FileKind>([FileKind.AVATAR, FileKind.DOCUMENT]);

function parseFileKind(value: FormDataEntryValue | string | null, allowReport = false): FileKind | null {
  if (typeof value !== "string" || !(Object.values(FileKind) as string[]).includes(value)) return null;
  const kind = value as FileKind;
  return allowReport || CLIENT_UPLOAD_KINDS.has(kind) ? kind : null;
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object"
    && value !== null
    && typeof (value as File).arrayBuffer === "function"
    && typeof (value as File).name === "string"
    && typeof (value as File).type === "string";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const limit = checkRequestAuthRateLimit(req, "file:upload", 20, 5 * 60_000);
  if (!limit.allowed) return authRateLimitResponse(limit);

  const formData = await req.formData();
  const file = formData.get("file");
  const kindValue = formData.get("kind");
  const kind = kindValue === null ? FileKind.DOCUMENT : parseFileKind(kindValue);

  if (!kind) return NextResponse.json({ error: "Недопустимая категория файла" }, { status: 400 });
  if (!isUploadedFile(file)) return NextResponse.json({ error: "Файл не выбран" }, { status: 400 });

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

  const kindValue = req.nextUrl.searchParams.get("kind");
  const kind = kindValue === null ? null : parseFileKind(kindValue, true);
  if (kindValue !== null && !kind) {
    return NextResponse.json({ error: "Недопустимая категория файла" }, { status: 400 });
  }
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
