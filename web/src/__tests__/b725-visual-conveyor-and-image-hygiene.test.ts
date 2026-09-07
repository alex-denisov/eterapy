import sharp from "sharp";
import { stripImageMetadata, hasAiImageMetadata } from "@/lib/marketing/image-hygiene";
import { CoverArt, ChatMockupArt } from "@/lib/marketing/cover-art";
import { generateMarketingImage } from "@/lib/marketing/image-generation";

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

  it("stripImageMetadata очищает EXIF и метаданные через Sharp", async () => {
    // Создаем тестовое PNG изображение
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const cleaned = await stripImageMetadata(testImage);
    expect(cleaned).toBeInstanceOf(Buffer);
    expect(cleaned.length).toBeGreaterThan(0);

    const metadata = await sharp(cleaned).metadata();
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(100);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(await hasAiImageMetadata(cleaned)).toBe(false);
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
    const samplePixel = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            predictions: [{ bytesBase64Encoded: samplePixel.toString("base64") }],
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
    const samplePixel = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 50, g: 50, b: 50 } },
    })
      .png()
      .toBuffer();

    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        // Imagen 3 недоступен / квота исчерпана
        return { ok: false, status: 429, text: async () => "Quota exceeded" } as unknown as Response;
      }
      if (url.includes("openrouter.ai")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ b64_json: samplePixel.toString("base64") }],
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
