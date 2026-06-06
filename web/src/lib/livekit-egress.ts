/**
 * LiveKit Egress API — запись видеосессий
 *
 * Requires LiveKit Egress server.
 * In dev: docker-compose.dev.yml includes livekit/egress image.
 * Recordings stored in /public/uploads/recordings/ with 24h TTL.
 *
 * Egress docs: https://docs.livekit.io/egress/
 */
import { EgressClient } from "livekit-server-sdk";
import path from "path";
import { log } from "./logger";

const LIVEKIT_URL   = process.env.LIVEKIT_URL ?? "ws://localhost:7880";
const API_KEY       = process.env.LIVEKIT_API_KEY ?? "devkey";
const API_SECRET    = process.env.LIVEKIT_API_SECRET ?? "devsecret";

// HTTP URL for Egress (replace ws:// with http://)
const EGRESS_URL = LIVEKIT_URL.replace(/^wss?/, "http");

const RECORDINGS_DIR = "/uploads/recordings";
const TTL_HOURS = 24;
const AUDIO_TTL_HOURS = 1;

let _egress: EgressClient | null = null;
function getEgress(): EgressClient {
  if (!_egress) _egress = new EgressClient(EGRESS_URL, API_KEY, API_SECRET);
  return _egress;
}

export interface RecordingInfo {
  egressId: string;
  filename: string;
  url: string;
  expiresAt: Date;
}

/**
 * Начинает запись комнаты — composite (всё видео + аудио в один файл MP4).
 * Возвращает egressId для последующей остановки.
 */
export async function startRoomRecording(roomName: string, bookingId: string): Promise<RecordingInfo | null> {
  try {
    const egress = getEgress();
    const filename = `session_${bookingId}_${Date.now()}.mp4`;
    const filepath = path.join(RECORDINGS_DIR, filename);

    const info = await egress.startRoomCompositeEgress(roomName, {
      file: { filepath, disableManifest: true } as never,
    });

    const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/uploads/recordings/${filename}`;

    return {
      egressId: info.egressId,
      filename,
      url,
      expiresAt,
    };
  } catch (e) {
    log.error("egress.start_recording_failed", { err: e });
    return null;
  }
}

/**
 * Начинает audio-only egress комнаты для серверного STT.
 * Файл временный: воркер обязан удалить его сразу после транскрипции,
 * а serverSttAudioExpiresAt страхует хвосты максимум на 1 час.
 */
export async function startRoomAudioEgress(roomName: string, bookingId: string): Promise<RecordingInfo | null> {
  try {
    const egress = getEgress();
    const filename = `stt_${bookingId}_${Date.now()}.mp4`;
    const filepath = path.join(RECORDINGS_DIR, filename);

    const info = await egress.startRoomCompositeEgress(
      roomName,
      { file: { filepath, disableManifest: true } } as never,
      { audioOnly: true } as never,
    );

    const expiresAt = new Date(Date.now() + AUDIO_TTL_HOURS * 60 * 60 * 1000);
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/uploads/recordings/${filename}`;

    return {
      egressId: info.egressId,
      filename,
      url,
      expiresAt,
    };
  } catch (e) {
    log.error("egress.start_audio_failed", { err: e });
    return null;
  }
}

export async function deleteLocalRecording(urlOrPath: string): Promise<boolean> {
  try {
    const { unlink } = await import("fs/promises");
    const filename = path.basename(urlOrPath);
    const filepath = path.join(process.cwd(), "public", "uploads", "recordings", filename);
    await unlink(filepath).catch(() => undefined);
    return true;
  } catch (e) {
    log.error("egress.delete_recording_failed", { urlOrPath, err: e });
    return false;
  }
}

/**
 * Останавливает запись по egressId.
 */
export async function stopRecording(egressId: string): Promise<void> {
  try {
    const egress = getEgress();
    await egress.stopEgress(egressId);
  } catch (e) {
    log.error("egress.stop_recording_failed", { err: e });
  }
}

/**
 * Проверяет статус Egress.
 */
export async function getRecordingStatus(egressId: string) {
  try {
    const egress = getEgress();
    const list = await egress.listEgress({ egressId });
    return list[0] ?? null;
  } catch (e) {
    log.error("egress.get_status_failed", { err: e });
    return null;
  }
}

/**
 * Удаляет записи с истёкшим TTL.
 * Вызывать из cron или при старте сервера.
 */
export async function purgeExpiredRecordings(db: import("@prisma/client").PrismaClient): Promise<number> {
  const expired = await db.videoSession.findMany({
    where: {
      recordingExpiry: { lt: new Date() },
      recordingUrl: { not: null },
    },
    select: { id: true, recordingUrl: true },
  });

  let purged = 0;
  for (const session of expired) {
    try {
      if (session.recordingUrl) {
        const { unlink } = await import("fs/promises");
        const filename = path.basename(session.recordingUrl);
        const filepath = path.join(process.cwd(), "public", "uploads", "recordings", filename);
        await unlink(filepath).catch(() => { /* file may not exist */ });
      }
      await db.videoSession.update({
        where: { id: session.id },
        data: { recordingUrl: null, recordingExpiry: null },
      });
      purged++;
    } catch (e) {
      log.error("egress.purge_failed", { sessionId: session.id, err: e });
    }
  }
  return purged;
}
