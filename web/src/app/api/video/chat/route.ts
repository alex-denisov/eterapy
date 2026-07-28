import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  authRateLimitKey,
  authRateLimitResponse,
  checkAuthRateLimit,
  checkRequestAuthRateLimit,
} from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import {
  FILE_STORAGE_ALLOWED_MIME,
  FILE_STORAGE_MAX_BYTES,
  storeFile,
} from "@/lib/file-storage";
import {
  VIDEO_CHAT_PAGE_MAX,
  VIDEO_CHAT_TEXT_MAX,
  videoChatReadable,
  videoChatRetentionExpiresAt,
  videoChatWritable,
} from "@/lib/video-chat-policy";

const CHAT_MIME = FILE_STORAGE_ALLOWED_MIME.DOCUMENT;
const MAX_FILE_SIZE = FILE_STORAGE_MAX_BYTES.DOCUMENT;
const MAX_MULTIPART_OVERHEAD = 1024 * 1024;

function participantScope(videoSessionId: string, userId: string) {
  return {
    id: videoSessionId,
    booking: {
      OR: [{ clientId: userId }, { practitioner: { userId } }],
    },
  };
}

async function accessibleVideoSession(videoSessionId: string, userId: string) {
  return db.videoSession.findFirst({
    where: participantScope(videoSessionId, userId),
    select: { id: true, status: true, endedAt: true },
  });
}

function rateLimited(req: NextRequest, userId: string, action: "read" | "write") {
  const limit = action === "write" ? 30 : 120;
  const ip = checkRequestAuthRateLimit(req, `video-chat:${action}:ip`, limit, 5 * 60_000);
  if (!ip.allowed) return authRateLimitResponse(ip);
  const user = checkAuthRateLimit(
    authRateLimitKey(`video-chat:${action}:user`, userId),
    limit,
    5 * 60_000,
  );
  return user.allowed ? null : authRateLimitResponse(user);
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

/** POST /api/video/chat — сохранить сообщение (текст или файл). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const rateLimit = rateLimited(req, session.user.id, "write");
  if (rateLimit) return rateLimit;

  const contentType = req.headers.get("content-type") ?? "";
  let videoSessionId: string | null = null;
  let text: string | null = null;
  let pendingFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const length = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD) {
      return NextResponse.json({ error: "Файл слишком большой (максимум 20 МБ)" }, { status: 413 });
    }
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Не удалось прочитать форму" }, { status: 400 });
    }
    const rawSessionId = formData.get("videoSessionId");
    videoSessionId = typeof rawSessionId === "string" ? rawSessionId : null;
    text = normalizedText(formData.get("text"));
    const file = formData.get("file");

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Файл слишком большой (максимум 20 МБ)" }, { status: 413 });
      }
      if (!CHAT_MIME.includes(file.type.trim().toLowerCase())) {
        return NextResponse.json({ error: `Тип файла не поддерживается: ${file.type}` }, { status: 400 });
      }
      pendingFile = file;
    }
  } else {
    const body = await req.json().catch(() => null) as {
      videoSessionId?: unknown;
      text?: unknown;
    } | null;
    videoSessionId = typeof body?.videoSessionId === "string"
      ? body.videoSessionId
      : null;
    text = normalizedText(body?.text);
  }

  if (!videoSessionId || videoSessionId.length > 100) {
    return NextResponse.json({ error: "videoSessionId обязателен" }, { status: 400 });
  }
  if (!text && !pendingFile) {
    return NextResponse.json({ error: "Текст или файл обязателен" }, { status: 400 });
  }
  if (text && text.length > VIDEO_CHAT_TEXT_MAX) {
    return NextResponse.json(
      { error: `Сообщение длиннее ${VIDEO_CHAT_TEXT_MAX} знаков` },
      { status: 400 },
    );
  }

  const videoSession = await accessibleVideoSession(videoSessionId, session.user.id);
  if (!videoSession) {
    return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  }
  if (!videoChatWritable(videoSession)) {
    return NextResponse.json(
      { error: "Сессия завершена — чат доступен только для чтения" },
      { status: 409 },
    );
  }

  let fileUrl: string | null = null;
  let fileName: string | null = null;
  let fileMime: string | null = null;
  if (pendingFile) {
    try {
      const stored = await storeFile(session.user.id, pendingFile, "DOCUMENT");
      fileUrl = stored.url;
      fileName = pendingFile.name;
      fileMime = pendingFile.type;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Не удалось сохранить файл" },
        { status: 400 },
      );
    }
  }

  const message = await db.chatMessage.create({
    data: {
      videoSessionId,
      senderId: session.user.id,
      text,
      fileUrl,
      fileName,
      fileMime,
    },
    include: { sender: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ ok: true, message });
}

/** GET /api/video/chat?videoSessionId=…&cursor=…&limit=50. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const rateLimit = rateLimited(req, session.user.id, "read");
  if (rateLimit) return rateLimit;

  const videoSessionId = req.nextUrl.searchParams.get("videoSessionId");
  if (!videoSessionId || videoSessionId.length > 100) {
    return NextResponse.json({ error: "videoSessionId обязателен" }, { status: 400 });
  }

  const videoSession = await accessibleVideoSession(videoSessionId, session.user.id);
  if (!videoSession) {
    return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  }
  const now = new Date();
  if (!videoChatReadable(videoSession, now)) {
    return NextResponse.json(
      { error: "Срок хранения чата завершён" },
      { status: 410 },
    );
  }

  const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? VIDEO_CHAT_PAGE_MAX);
  const limit = Number.isInteger(rawLimit)
    ? Math.min(VIDEO_CHAT_PAGE_MAX, Math.max(1, rawLimit))
    : VIDEO_CHAT_PAGE_MAX;
  const cursor = req.nextUrl.searchParams.get("cursor");

  const rows = await db.chatMessage.findMany({
    where: { videoSessionId },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const nextCursor = hasMore ? page.at(-1)?.id ?? null : null;

  return NextResponse.json({
    messages: page.reverse(),
    nextCursor,
    writable: videoChatWritable(videoSession),
    retentionExpiresAt: videoChatRetentionExpiresAt(videoSession)?.toISOString() ?? null,
  });
}
