import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";

export interface SessionSttResult {
  transcriptText: string;
  metadata: Prisma.InputJsonObject;
}

type SpeechKitChunk = {
  channelTag?: string;
  alternatives?: Array<{ text?: string }>;
};

type SpeechKitOperation = {
  id?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: { chunks?: SpeechKitChunk[] };
};

const DEFAULT_S3_ENDPOINT = "https://storage.yandexcloud.net";
const SPEECHKIT_START_URL =
  "https://transcribe.api.cloud.yandex.net/speech/stt/v2/longRunningRecognize";
const SPEECHKIT_OPERATION_URL = "https://operation.api.cloud.yandex.net/operations";
const MAX_AUDIO_BYTES = 1024 * 1024 * 1024;
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 30 * 60_000;

function requiredEnv(name: string, fallbackName?: string) {
  const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : "");
  if (!value) throw new Error(`${name} is required for Yandex SpeechKit session STT`);
  return value;
}

function localAudioPath(audioUrl: string) {
  let pathname = audioUrl;
  if (/^https?:\/\//i.test(audioUrl)) {
    pathname = new URL(audioUrl).pathname;
  }
  if (!pathname.startsWith("/uploads/recordings/")) {
    throw new Error("Session STT accepts only temporary LiveKit recordings");
  }

  const decodedName = decodeURIComponent(path.basename(pathname));
  if (!decodedName.endsWith(".ogg")) {
    throw new Error("Session STT requires an OggOpus LiveKit recording");
  }

  const recordingsRoot = path.resolve(process.cwd(), "public", "uploads", "recordings");
  const filepath = path.resolve(recordingsRoot, decodedName);
  if (!filepath.startsWith(`${recordingsRoot}${path.sep}`)) {
    throw new Error("Invalid session STT recording path");
  }
  return filepath;
}

function storageObjectUrl(endpoint: string, bucket: string, objectKey: string) {
  const base = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  return new URL(`${encodeURIComponent(bucket)}/${encodedKey}`, base).toString();
}

function remoteAudioObject(audioUrl: string, expectedBucket: string) {
  if (!audioUrl.startsWith("yandex-s3://")) return null;
  const parsed = new URL(audioUrl);
  const objectKey = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (
    parsed.hostname !== expectedBucket
    || !objectKey.startsWith("session-stt/")
    || !objectKey.endsWith(".ogg")
    || objectKey.includes("..")
  ) {
    throw new Error("Invalid Yandex Object Storage session STT locator");
  }
  return { bucket: parsed.hostname, objectKey };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<SpeechKitOperation> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null) as SpeechKitOperation | null;
    if (!response.ok || !body) {
      const message = body?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Yandex SpeechKit request failed: ${message}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function operationTranscript(operation: SpeechKitOperation) {
  if (operation.error) {
    throw new Error(
      `Yandex SpeechKit operation failed: ${operation.error.message || operation.error.code || "unknown error"}`,
    );
  }
  const chunks = operation.response?.chunks ?? [];
  const lines = chunks.flatMap((chunk) => {
    const text = chunk.alternatives?.[0]?.text?.trim();
    if (!text) return [];
    return [chunk.channelTag ? `Канал ${chunk.channelTag}: ${text}` : text];
  });
  const transcript = lines.join("\n").trim();
  if (transcript.length < 10) throw new Error("Yandex SpeechKit returned an empty transcript");
  return { transcript, chunkCount: chunks.length };
}

async function recognizeObject(
  objectUrl: string,
  apiKey: string,
  options: {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    pollMs?: number;
    timeoutMs?: number;
  } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const headers = {
    Authorization: `Api-Key ${apiKey}`,
    "Content-Type": "application/json",
  };
  const startedAt = Date.now();
  const started = await fetchJson(SPEECHKIT_START_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      config: {
        specification: {
          languageCode: "ru-RU",
          model: "general",
          profanityFilter: false,
          literature_text: true,
          audioEncoding: "OGG_OPUS",
          rawResults: false,
        },
      },
      audio: { uri: objectUrl },
    }),
  }, fetchImpl);
  if (!started.id) throw new Error("Yandex SpeechKit did not return an operation id");

  const deadline = startedAt + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let operation = started;
  while (!operation.done) {
    if (Date.now() >= deadline) {
      throw new Error(`Yandex SpeechKit operation ${started.id} timed out`);
    }
    await sleep(options.pollMs ?? DEFAULT_POLL_MS);
    operation = await fetchJson(
      `${SPEECHKIT_OPERATION_URL}/${encodeURIComponent(started.id)}`,
      { method: "GET", headers: { Authorization: `Api-Key ${apiKey}` } },
      fetchImpl,
    );
  }

  return {
    ...operationTranscript(operation),
    operationId: started.id,
    latencyMs: Date.now() - startedAt,
  };
}

export async function transcribeSessionAudio(input: {
  audioUrl: string;
  feature?: "session-stt";
  requestId?: string;
  userId?: string | null;
}): Promise<SessionSttResult> {
  const apiKey = requiredEnv("YANDEX_SPEECHKIT_API_KEY", "YANDEX_API_KEY");
  const accessKeyId = requiredEnv("YANDEX_S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("YANDEX_S3_SECRET_ACCESS_KEY");
  const bucket = requiredEnv("YANDEX_S3_BUCKET");
  const endpoint = process.env.YANDEX_S3_ENDPOINT?.trim() || DEFAULT_S3_ENDPOINT;
  const region = process.env.YANDEX_S3_REGION?.trim() || "ru-central1";
  const remote = remoteAudioObject(input.audioUrl, bucket);
  const objectKey = remote?.objectKey ?? [
      "session-stt",
      new Date().toISOString().slice(0, 10),
      `${randomUUID()}.ogg`,
    ].join("/");
  // Dynamic import keeps the heavy server-only AWS-compatible SDK out of the
  // browser/JSDOM graph while preserving native streaming uploads in workers.
  const {
    DeleteObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
  } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    endpoint,
    region,
    forcePathStyle: false,
    credentials: { accessKeyId, secretAccessKey },
  });
  let objectReady = false;
  let recognitionCompleted = false;
  let sourceBytes = 0;
  try {
    if (remote) {
      const object = await s3.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }));
      sourceBytes = object.ContentLength ?? 0;
    } else {
      const filepath = localAudioPath(input.audioUrl);
      const file = await stat(filepath);
      sourceBytes = file.size;
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: createReadStream(filepath),
        ContentLength: sourceBytes,
        ContentType: "audio/ogg",
        Metadata: {
          purpose: "eterapy-session-stt",
          request: (input.requestId || "unknown").replace(/[^\w.-]/g, "_").slice(0, 128),
        },
      }));
    }
    objectReady = true;
    if (sourceBytes <= 0 || sourceBytes > MAX_AUDIO_BYTES) {
      throw new Error("Session STT recording is empty or exceeds the 1 GB SpeechKit limit");
    }

    const recognition = await recognizeObject(
      storageObjectUrl(endpoint, bucket, objectKey),
      apiKey,
    );
    recognitionCompleted = true;
    return {
      transcriptText: recognition.transcript,
      metadata: {
        provider: "yandex",
        model: "speechkit-stt-v2-general",
        operationId: recognition.operationId,
        audioEncoding: "OGG_OPUS",
        chunkCount: recognition.chunkCount,
        sourceBytes,
        latencyMs: recognition.latencyMs,
      },
    };
  } finally {
    // Keep the object across transient job retries. The queue's final-failure
    // path and TTL cleanup remove it if recognition never succeeds.
    if (objectReady && recognitionCompleted) {
      await s3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      })).catch(() => undefined);
    }
    s3.destroy();
  }
}

export const sessionSttTestables = {
  localAudioPath,
  operationTranscript,
  remoteAudioObject,
  recognizeObject,
  storageObjectUrl,
};
