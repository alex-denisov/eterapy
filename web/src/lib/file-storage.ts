/**
 * Файловое хранилище ETerapy.
 * 
 * Локально: /public/uploads/{kind}/{userId}/{filename}
 * В будущем: S3 / Yandex Object Storage (переключается через env)
 */
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "path";
import db from "./db";
import { FileKind } from "@prisma/client";
import { authRateLimitKey, checkAuthRateLimit } from "./auth-rate-limit";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const PUBLIC_ROOT = path.join(process.cwd(), "public");
const USER_STORAGE_QUOTA_BYTES = 250 * 1024 * 1024;
const MAX_SIZES: Record<FileKind, number> = {
  AVATAR:   5 * 1024 * 1024,   // 5 MB
  DOCUMENT: 20 * 1024 * 1024,  // 20 MB
  REPORT:   10 * 1024 * 1024,  // 10 MB
};
const ALLOWED_MIME: Record<FileKind, readonly string[]> = {
  AVATAR: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  DOCUMENT: ["application/pdf", "image/jpeg", "image/png", "text/plain"],
  // REPORT is server-created only. Active HTML must never be placed in the
  // same-origin public tree; JSON and PDF use canonical, non-executable suffixes.
  REPORT: ["application/pdf", "application/json"],
};

const CANONICAL_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/json": "json",
  "text/plain": "txt",
};

function hasPrefix(buffer: Buffer, bytes: readonly number[]) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function contentMatchesMime(buffer: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (mime === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mime === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "text/plain" || mime === "application/json") {
    if (buffer.includes(0)) return false;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      if (mime === "application/json") JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function safePathBelow(root: string, ...segments: string[]) {
  const candidate = path.resolve(root, ...segments);
  if (!candidate.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error("Небезопасный путь файла");
  }
  return candidate;
}

export async function storeFile(
  userId: string,
  file: File,
  kind: FileKind
): Promise<{ url: string; fileId: string }> {
  if (!(kind in MAX_SIZES)) throw new Error("Неподдерживаемая категория файла");
  const userLimit = checkAuthRateLimit(authRateLimitKey("file:store:user", userId), 60, 60 * 60_000);
  if (!userLimit.allowed) throw new Error("Слишком много загрузок. Попробуйте позже.");

  // Validate size
  if (file.size <= 0 || file.size > MAX_SIZES[kind]) {
    throw new Error(`Файл слишком большой. Максимум: ${MAX_SIZES[kind] / 1024 / 1024} МБ`);
  }
  // Validate mime
  const mime = file.type.trim().toLowerCase();
  if (!ALLOWED_MIME[kind].includes(mime)) {
    throw new Error(`Неподдерживаемый тип файла: ${mime}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!contentMatchesMime(buffer, mime)) {
    throw new Error("Содержимое файла не соответствует заявленному типу");
  }

  const storedBytes = await db.storedFile.aggregate({
    where: { userId },
    _sum: { sizeBytes: true },
  });
  if ((storedBytes._sum.sizeBytes ?? 0) + buffer.length > USER_STORAGE_QUOTA_BYTES) {
    throw new Error("Лимит хранилища исчерпан. Удалите ненужные файлы.");
  }

  const ext = CANONICAL_EXTENSION[mime];
  if (!ext) throw new Error("Неподдерживаемый тип файла");
  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  const kindDir = kind.toLowerCase() + "s"; // avatars, documents, reports
  const dir = safePathBelow(UPLOAD_ROOT, kindDir, userId);
  await mkdir(dir, { recursive: true });

  const storedPath = safePathBelow(dir, filename);
  await writeFile(storedPath, buffer, { flag: "wx", mode: 0o600 });

  const urlPath = `/uploads/${kindDir}/${userId}/${filename}`;

  // Record in DB
  let record;
  try {
    record = await db.storedFile.create({
      data: {
        userId,
        kind,
        path: urlPath,
        originalName: path.basename(file.name).slice(0, 255),
        mimeType: mime,
        sizeBytes: buffer.length,
      },
    });
  } catch (error) {
    await unlink(storedPath).catch(() => undefined);
    throw error;
  }

  return { url: urlPath, fileId: record.id };
}

export async function deleteFile(fileId: string, userId: string): Promise<void> {
  const record = await db.storedFile.findFirst({ where: { id: fileId, userId } });
  if (!record) throw new Error("Файл не найден");

  if (!record.path.startsWith("/uploads/")) throw new Error("Небезопасный путь файла");
  const storedPath = safePathBelow(PUBLIC_ROOT, `.${record.path}`);
  await unlink(storedPath).catch(() => undefined);

  await db.storedFile.delete({ where: { id: fileId } });
}
