/**
 * B725 — Очистка метаданных и скрытых C2PA/AI-маркеров изображений.
 *
 * Алгоритмы Instagram и Meta пессимизируют охваты постов и вешают плашку
 * «Made with AI» при наличии в заголовках изображений C2PA-манифестов
 * (`trainedAlgorithmicMedia`), EXIF или XMP метаданных AI-генераторов.
 *
 * Данная утилита перекодирует графический буфер через sharp, отбрасывая
 * любые метаданные и манифесты, оставляя только чистые пиксели.
 */

import sharp from "sharp";

const AI_METADATA_PATTERNS = [
  "C2PA",
  "c2pa",
  "trainedAlgorithmicMedia",
  "photoshop:Credit=\"AI\"",
  "stablediffusion",
  "midjourney",
  "flux",
  "imagen",
  "dall-e",
  "com.google.imagen",
];

/**
 * Проверяет наличие AI-маркеров или C2PA метаданных в бинарном буфере изображения.
 */
export async function hasAiImageMetadata(buffer: Buffer): Promise<boolean> {
  const binaryString = buffer.toString("latin1");
  for (const pattern of AI_METADATA_PATTERNS) {
    if (binaryString.includes(pattern)) return true;
  }

  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.exif || metadata.xmp || metadata.iptc) {
      const rawXmp = metadata.xmp?.toString("utf8") ?? "";
      for (const pattern of AI_METADATA_PATTERNS) {
        if (rawXmp.toLowerCase().includes(pattern.toLowerCase())) return true;
      }
    }
  } catch {
    // Неверный формат или поврежденный буфер
  }

  return false;
}

/**
 * Полный стриппинг EXIF, IPTC, XMP и C2PA манифестов.
 * Sharp по умолчанию отбрасывает все метаданные при конвертации без `.withMetadata()`.
 */
export async function stripImageMetadata(inputBuffer: Buffer): Promise<Buffer> {
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const format = metadata.format;

  if (format === "jpeg" || format === "jpg") {
    return await image
      .jpeg({
        quality: 92,
        mozjpeg: true,
      })
      .toBuffer();
  }

  if (format === "webp") {
    return await image
      .webp({
        quality: 92,
        effort: 4,
      })
      .toBuffer();
  }

  // По умолчанию возвращаем чистый PNG без служебных чанков
  return await image
    .png({
      compressionLevel: 8,
    })
    .toBuffer();
}
