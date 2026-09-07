import { stripImageMetadata, hasAiImageMetadata } from "@/lib/marketing/image-hygiene";
import { CoverArt, ChatMockupArt } from "@/lib/marketing/cover-art";
import { generateMarketingImage } from "@/lib/marketing/image-generation";

// Минимальные валидные 1x1 base64 буферы
const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SAMPLE_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

describe("B725: Visual Conveyor, Chat Mockup & Image Hygiene", () => {
  it("hasAiImageMetadata обнаруживает C2PA и AI-маркеры в буфере", async () => {
    const aiBuffer = Buffer.from(
      "PNG_MOCK_HEADER_data_c2pa_manifest_trainedAlgorithmicMedia_tail",
      "latin1",
    );
    expect(await hasAiImageMetadata(aiBuffer)).toBe(true);

    const cleanBuffer = Buffer.from("CLEAN_IMAGE_WITHOUT_ANY_MARKERS", "latin1");
    expect(await hasAiImageMetadata(cleanBuffer)).toBe(false);
  });

  it("stripImageMetadata очищает EXIF, C2PA и метаданные из PNG и JPEG буферов", async () => {
    // Создаем PNG с внедренным C2PA iTXt чанком
    const testImageWithAi = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from([0, 0, 0, 4]),
      Buffer.from("IHDR"),
      Buffer.from([0, 0, 0, 1]),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from([0, 0, 0, 4]),
      Buffer.from("iTXt"),
      Buffer.from("C2PA"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("IEND"),
      Buffer.from([0, 0, 0, 0]),
    ]);

    expect(await hasAiImageMetadata(testImageWithAi)).toBe(true);

    const cleaned = await stripImageMetadata(testImageWithAi);
    expect(cleaned).toBeInstanceOf(Buffer);
    expect(cleaned.length).toBeGreaterThan(0);
    expect(await hasAiImageMetadata(cleaned)).toBe(false);

    // Проверяем чистый PNG
    const cleanPng = await stripImageMetadata(SAMPLE_PNG);
    expect(cleanPng).toBeInstanceOf(Buffer);
    expect(await hasAiImageMetadata(cleanPng)).toBe(false);

    // Проверяем чистый JPEG
    const cleanJpeg = await stripImageMetadata(SAMPLE_JPEG);
    expect(cleanJpeg).toBeInstanceOf(Buffer);
    expect(await hasAiImageMetadata(cleanJpeg)).toBe(false);
  });

  it("ChatMockupArt корректно собирает разметку диалога со входящим сообщением и плашкой Ани", () => {
    const element = ChatMockupArt({
      slotKey: "test-slot-1",
      platform: "telegram",
      title: "«Ты слишком много думаешь» — почему переписка зашла в тупик",
      eyebrow: "Скрытый мотив: поиск контроля",
      scheduledFor: new Date("2026-09-07T12:00:00Z"),
    });

    expect(element).toBeDefined();
    expect(element.props.style.backgroundColor).toBe("#0B0F19");
  });

  it("CoverArt переключается на ChatMockupArt при layout=chat_mockup", () => {
    const art = CoverArt({
      slotKey: "test-slot-2",
      platform: "instagram",
      title: "Обычный арт",
      eyebrow: "Кластер",
      scheduledFor: null,
      layout: "art",
    });
    expect(art).toBeDefined();

    const chat = CoverArt({
      slotKey: "test-slot-3",
      platform: "instagram",
      title: "«Он написал в 02:00»",
      eyebrow: "Разбор переписки",
      scheduledFor: null,
      layout: "chat_mockup",
    });
    expect(chat).toBeDefined();
  });

  it("generateMarketingImage вызывает Imagen 3 и при успехе очищает буфер", async () => {
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            predictions: [{ bytesBase64Encoded: SAMPLE_JPEG.toString("base64") }],
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 500 } as unknown as Response;
    });

    process.env.GEMINI_API_KEY = "test-gemini-key";
    const result = await generateMarketingImage({
      prompt: "Anya curator working with laptop, warm ambient lighting",
      aspectRatio: "1:1",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("imagen-3");
    expect(result?.buffer).toBeInstanceOf(Buffer);
    expect(await hasAiImageMetadata(result!.buffer)).toBe(false);
  });

  it("generateMarketingImage переключается на FLUX.1 при отказе Imagen 3", async () => {
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return { ok: false, status: 429, text: async () => "Quota exceeded" } as unknown as Response;
      }
      if (url.includes("openrouter.ai")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ b64_json: SAMPLE_PNG.toString("base64") }],
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 500 } as unknown as Response;
    });

    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const result = await generateMarketingImage({
      prompt: "Lifestyle photo of coffee cup and notebook",
      aspectRatio: "1:1",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("flux-1");
    expect(result?.buffer).toBeInstanceOf(Buffer);
  });
});
