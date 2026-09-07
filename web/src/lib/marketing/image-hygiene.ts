/**
 * B725 — Очистка метаданных и скрытых C2PA/AI-маркеров изображений.
 *
 * Алгоритмы Instagram и Meta пессимизируют охваты постов и вешают плашку
 * «Made with AI» при наличии в заголовках изображений C2PA-манифестов
 * (`trainedAlgorithmicMedia`), EXIF или XMP метаданных AI-генераторов.
 *
 * Утилита удаляет метаданные без внешних нативных зависимостей (pure buffer stripping)
 * для PNG, JPEG и WebP, а также опционально задействует sharp при его наличии.
 */

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

async function getSharp() {
  try {
    const mod = await import("sharp");
    return mod.default || mod;
  } catch {
    return null;
  }
}

/**
 * Проверяет наличие AI-маркеров или C2PA метаданных в бинарном буфере изображения.
 */
export async function hasAiImageMetadata(buffer: Buffer): Promise<boolean> {
  const binaryString = buffer.toString("latin1");
  for (const pattern of AI_METADATA_PATTERNS) {
    if (binaryString.includes(pattern)) return true;
  }

  const sharp = await getSharp();
  if (sharp) {
    try {
      const metadata = await sharp(buffer).metadata();
      if (metadata.exif || metadata.xmp || metadata.iptc) {
        const rawXmp = metadata.xmp?.toString("utf8") ?? "";
        for (const pattern of AI_METADATA_PATTERNS) {
          if (rawXmp.toLowerCase().includes(pattern.toLowerCase())) return true;
        }
      }
    } catch {
      // Игнорируем ошибки парсинга поврежденных буферов
    }
  }

  return false;
}

/**
 * Удаляет EXIF, XMP, iTXt, tEXt и C2PA чанки из PNG буфера без транскодирования пикселей.
 */
export function stripPngMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 8 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    return buffer;
  }
  const chunks: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;
  const dropTypes = new Set(["text", "ztxt", "itxt", "exif", "c2pa"]);

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const totalChunkLength = 12 + length;
    if (offset + totalChunkLength > buffer.length) break;

    if (!dropTypes.has(type.toLowerCase())) {
      chunks.push(buffer.subarray(offset, offset + totalChunkLength));
    }
    offset += totalChunkLength;
  }
  return Buffer.concat(chunks);
}

/**
 * Удаляет APP1 (EXIF/XMP), APP13 (Photoshop/IPTC), APP2 (C2PA) и COM сегменты из JPEG буфера.
 */
export function stripJpegMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer;
  }
  const chunks: Buffer[] = [buffer.subarray(0, 2)]; // SOI
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xd9) { // EOI
      chunks.push(buffer.subarray(offset));
      break;
    }
    if (marker === 0xda) { // SOS (Start of Scan) - до конца файла идет сжатый растр
      chunks.push(buffer.subarray(offset));
      break;
    }
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    const segmentLength = 2 + length;
    if (offset + segmentLength > buffer.length) break;

    // Drop APP1 (0xE1: EXIF/XMP), APP13 (0xED: Photoshop), COM (0xFE), APP2 (0xE2: C2PA/FlashPix)
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe || marker === 0xe2;
    if (!drop) {
      chunks.push(buffer.subarray(offset, offset + segmentLength));
    }
    offset += segmentLength;
  }
  return Buffer.concat(chunks);
}

/**
 * Удаляет EXIF, XMP и C2PA чанки из WebP (RIFF) контейнера.
 */
export function stripWebpMetadata(buffer: Buffer): Buffer {
  if (
    buffer.length < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return buffer;
  }
  const chunks: Buffer[] = [buffer.subarray(0, 12)];
  let offset = 12;
  const dropTypes = new Set(["exif", "xmp ", "c2pa"]);

  while (offset + 8 <= buffer.length) {
    const fourCC = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const pad = size % 2 === 1 ? 1 : 0;
    const totalChunkLength = 8 + size + pad;
    if (offset + totalChunkLength > buffer.length) break;

    if (!dropTypes.has(fourCC.toLowerCase())) {
      const chunkBuf = Buffer.from(buffer.subarray(offset, offset + totalChunkLength));
      if (fourCC === "VP8X" && chunkBuf.length >= 9) {
        chunkBuf[8] = chunkBuf[8] & ~(0x08 | 0x04); // сброс флагов EXIF и XMP
      }
      chunks.push(chunkBuf);
    }
    offset += totalChunkLength;
  }
  const result = Buffer.concat(chunks);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

/**
 * Полный стриппинг EXIF, IPTC, XMP и C2PA манифестов.
 * Выполняется через надежный буферный стриппер без внешних платформозависимых бинарников.
 * Если доступен sharp, выполняется также ре-энкод при необходимости.
 */
export async function stripImageMetadata(inputBuffer: Buffer): Promise<Buffer> {
  // 1. Поточный стриппинг заголовков контейнеров (быстро, без потери качества растра)
  let stripped = inputBuffer;
  if (inputBuffer.length >= 8 && inputBuffer.toString("hex", 0, 8) === "89504e470d0a1a0a") {
    stripped = stripPngMetadata(inputBuffer);
  } else if (inputBuffer.length >= 2 && inputBuffer[0] === 0xff && inputBuffer[1] === 0xd8) {
    stripped = stripJpegMetadata(inputBuffer);
  } else if (
    inputBuffer.length >= 12 &&
    inputBuffer.toString("ascii", 0, 4) === "RIFF" &&
    inputBuffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    stripped = stripWebpMetadata(inputBuffer);
  }

  // 2. Если буфер очищен от паттернов AI, возвращаем результат
  const stillHasAi = await hasAiImageMetadata(stripped);
  if (!stillHasAi) {
    return stripped;
  }

  // 3. Если паттерны еще остаются и доступен sharp — пробуем глубокое перекодирование
  const sharp = await getSharp();
  if (sharp) {
    try {
      const image = sharp(stripped);
      const meta = await image.metadata();
      if (meta.format === "jpeg" || meta.format === "jpg") {
        return await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      }
      if (meta.format === "webp") {
        return await image.webp({ quality: 92, effort: 4 }).toBuffer();
      }
      return await image.png({ compressionLevel: 8 }).toBuffer();
    } catch {
      // Игнорируем сбои sharp
    }
  }

  return stripped;
}
