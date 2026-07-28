/**
 * PRB-003 · Физическое удаление чата через 24 часа после завершения сессии.
 *
 * Вложения хранятся отдельными StoredFile. Удалить только строки чата означало
 * бы оставить публичные URL на диске, поэтому сначала удаляем файлы, затем
 * сообщения. Ошибка одного файла не останавливает очистку остальных сессий.
 */

import db from "@/lib/db";
import { deleteFile } from "@/lib/file-storage";
import { log } from "@/lib/logger";
import { VIDEO_CHAT_RETENTION_MS } from "@/lib/video-chat-policy";

export interface VideoChatRetentionResult {
  sessions: number;
  messages: number;
  files: number;
  fileFailures: number;
}

export async function cleanupExpiredVideoChats(
  now = new Date(),
): Promise<VideoChatRetentionResult> {
  const cutoff = new Date(now.getTime() - VIDEO_CHAT_RETENTION_MS);
  const sessions = await db.videoSession.findMany({
    where: {
      endedAt: { lte: cutoff },
      messages: { some: {} },
    },
    select: {
      id: true,
      messages: {
        select: { id: true, senderId: true, fileUrl: true },
      },
    },
    take: 100,
  });

  let messages = 0;
  let files = 0;
  let fileFailures = 0;

  for (const session of sessions) {
    for (const message of session.messages) {
      if (!message.fileUrl) continue;
      const stored = await db.storedFile.findFirst({
        where: { userId: message.senderId, path: message.fileUrl },
        select: { id: true },
      });
      if (!stored) continue;
      try {
        await deleteFile(stored.id, message.senderId);
        files += 1;
      } catch (error) {
        fileFailures += 1;
        log.error("video_chat.retention_file_failed", {
          videoSessionId: session.id,
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const deleted = await db.chatMessage.deleteMany({
      where: { videoSessionId: session.id },
    });
    messages += deleted.count;
  }

  return {
    sessions: sessions.length,
    messages,
    files,
    fileFailures,
  };
}
