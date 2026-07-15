import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { storeFile } from "@/lib/file-storage";

// Разрешённые MIME типы для файлов в чате
const ALLOWED_CHAT_MIME = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm",
  "text/plain",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

function participantScope(videoSessionId: string, userId: string) {
  return {
    id: videoSessionId,
    booking: {
      OR: [
        { clientId: userId },
        { practitioner: { userId } },
      ],
    },
  };
}

async function canAccessVideoSession(videoSessionId: string, userId: string) {
  return db.videoSession.findFirst({
    where: participantScope(videoSessionId, userId),
    select: { id: true },
  });
}

/** POST /api/video/chat — сохранить сообщение (текст или файл) */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  let videoSessionId: string | null = null;
  let text: string | null = null;
  let fileUrl: string | null = null;
  let fileName: string | null = null;
  let fileMime: string | null = null;
  let pendingFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    videoSessionId = formData.get("videoSessionId") as string;
    text = (formData.get("text") as string) ?? null;
    const file = formData.get("file") as File | null;

    if (file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Файл слишком большой (максимум 25 МБ)" }, { status: 400 });
      }
      if (!ALLOWED_CHAT_MIME.includes(file.type)) {
        return NextResponse.json({ error: `Тип файла не поддерживается: ${file.type}` }, { status: 400 });
      }
      // Проверяем расширение на безопасность
      const ext = file.name.split(".").pop()?.toLowerCase();
      const BLOCKED_EXTS = ["exe", "sh", "bat", "cmd", "ps1", "msi", "dmg", "app", "jar", "py", "js", "ts", "php", "rb"];
      if (!ext || BLOCKED_EXTS.includes(ext)) {
        return NextResponse.json({ error: "Этот тип файла запрещён" }, { status: 400 });
      }
      pendingFile = file;
    }
  } else {
    const body = await req.json();
    videoSessionId = body.videoSessionId;
    text = body.text;
  }

  if (!videoSessionId) return NextResponse.json({ error: "videoSessionId обязателен" }, { status: 400 });
  if (!text && !pendingFile) return NextResponse.json({ error: "Текст или файл обязателен" }, { status: 400 });

  const videoSession = await canAccessVideoSession(videoSessionId, session.user.id);
  if (!videoSession) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });

  // Store an attachment only after the booking-participant ownership check.
  if (pendingFile) {
    const { url } = await storeFile(session.user.id, pendingFile, "DOCUMENT");
    fileUrl = url;
    fileName = pendingFile.name;
    fileMime = pendingFile.type;
  }

  const message = await db.chatMessage.create({
    data: {
      videoSessionId,
      senderId: session.user.id,
      text: text ?? null,
      fileUrl,
      fileName,
      fileMime,
    },
    include: { sender: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ ok: true, message });
}

/** GET /api/video/chat?videoSessionId=xxx — история чата */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const videoSessionId = req.nextUrl.searchParams.get("videoSessionId");
  if (!videoSessionId) return NextResponse.json({ error: "videoSessionId обязателен" }, { status: 400 });

  const videoSession = await canAccessVideoSession(videoSessionId, session.user.id);
  if (!videoSession) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });

  const messages = await db.chatMessage.findMany({
    where: { videoSessionId },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ messages });
}
