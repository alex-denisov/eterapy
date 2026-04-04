/**
 * Файловое хранилище ETerapy.
 * 
 * Локально: /public/uploads/{kind}/{userId}/{filename}
 * В будущем: S3 / Yandex Object Storage (переключается через env)
 */
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import db from "./db";
import { FileKind } from "@prisma/client";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const MAX_SIZES: Record<FileKind, number> = {
  AVATAR:   5 * 1024 * 1024,   // 5 MB
  DOCUMENT: 20 * 1024 * 1024,  // 20 MB
  REPORT:   10 * 1024 * 1024,  // 10 MB
};
const ALLOWED_MIME: Record<FileKind, string[]> = {
  AVATAR:   ["image/jpeg", "image/png", "image/webp", "image/gif"],
  DOCUMENT: ["application/pdf", "image/jpeg", "image/png", "text/plain"],
  REPORT:   ["application/pdf", "application/json", "text/html"],
};

export async function storeFile(
  userId: string,
  file: File,
  kind: FileKind
): Promise<{ url: string; fileId: string }> {
  // Validate size
  if (file.size > MAX_SIZES[kind]) {
    throw new Error(`Файл слишком большой. Максимум: ${MAX_SIZES[kind] / 1024 / 1024} МБ`);
  }
  // Validate mime
  if (!ALLOWED_MIME[kind].includes(file.type)) {
    throw new Error(`Неподдерживаемый тип файла: ${file.type}`);
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const kindDir = kind.toLowerCase() + "s"; // avatars, documents, reports
  const dir = path.join(UPLOAD_ROOT, kindDir, userId);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const urlPath = `/uploads/${kindDir}/${userId}/${filename}`;

  // Record in DB
  const record = await db.storedFile.create({
    data: {
      userId,
      kind,
      path: urlPath,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

  return { url: urlPath, fileId: record.id };
}

export async function deleteFile(fileId: string, userId: string): Promise<void> {
  const record = await db.storedFile.findFirst({ where: { id: fileId, userId } });
  if (!record) throw new Error("Файл не найден");

  // Physical delete
  try {
    const { unlink } = await import("fs/promises");
    await unlink(path.join(process.cwd(), "public", record.path));
  } catch { /* ignore if already gone */ }

  await db.storedFile.delete({ where: { id: fileId } });
}
