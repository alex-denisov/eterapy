import { stripImageMetadata, hasAiImageMetadata } from "@/lib/marketing/image-hygiene";
import { CoverArt, ChatMockupArt } from "@/lib/marketing/cover-art";

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

  // B731: плашки «РАЗБОР АНИ» в мокапе больше нет — ни один скриншот из
  // мессенджера её не содержит, и она сильнее всего выдавала подделку. Фон стал
  // цветом ночной темы Telegram. Подробности проверяет b731-*.
  it("ChatMockupArt корректно собирает разметку диалога со входящим сообщением", () => {
    const element = ChatMockupArt({
      slotKey: "test-slot-1",
      platform: "telegram",
      title: "«Ты слишком много думаешь» — почему переписка зашла в тупик",
      eyebrow: "Скрытый мотив: поиск контроля",
      scheduledFor: new Date("2026-09-07T12:00:00Z"),
    });

    expect(element).toBeDefined();
    expect(element.props.style.backgroundColor).toBe("#0f0f10");
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

  /**
   * B732 — два прогона «generateMarketingImage» удалены вместе с модулем.
   *
   * Они были зелёными всё время, пока механизм был мёртв: мок отвечал за
   * `generativelanguage.googleapis.com`, ключ подставлялся в `process.env`
   * прямо в тесте, а на проде ни этой переменной, ни модели
   * `imagen-3.0-generate-002` (выключена Google) не существовало. Проверка
   * платной обложки живёт теперь в `b732-paid-cover-images.test.ts` и меряет
   * учётку из ХРАНИЛИЩА ШЛЮЗА, а не из окружения.
   */
});
