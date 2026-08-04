/**
 * B653 — карточка «опубликовано» в маркетинговый канал.
 *
 * Прогон закрывает ровно то, что нельзя проверить глазами на проде: состав
 * карточки для трёх типов материала и обещание «недоставленное уведомление не
 * трогает уже вышедший материал».
 */

import {
  buildPublishedNotification,
  missingUrlReason,
  publicationKindLabel,
  type PublishedNotificationInput,
} from "@/lib/marketing/publish-notification";

const AT = new Date("2026-08-04T09:30:00.000Z"); // 12:30 МСК

function input(over: Partial<PublishedNotificationInput> = {}): PublishedNotificationInput {
  return {
    platform: "telegram",
    channelName: "ETerapy",
    contentType: "POST",
    title: "Когда тревога говорит вашим голосом",
    body: "Короткий текст материала.",
    publicUrl: "https://t.me/eterapy/42",
    destinationUrl: null,
    cluster: "Тревога и состояние",
    targetQuery: null,
    engagementTargetLabel: null,
    engagementTargetUrl: null,
    engagementExcerpt: null,
    engagementTone: null,
    publishedAt: AT,
    ...over,
  };
}

describe("B653 · состав карточки", () => {
  it("у поста есть площадка, тема, время МСК и ссылка", () => {
    const text = buildPublishedNotification(input());
    expect(text).toContain("Опубликовано: Пост");
    expect(text).toContain("telegram · ETerapy");
    expect(text).toContain("Тема:</b> Тревога и состояние");
    expect(text).toContain("https://t.me/eterapy/42");
    // Время печатается в МСК, а не в UTC воркера: 09:30Z = 12:30 МСК.
    expect(text).toContain("12:30");
  });

  it("у ответа на входящее видно КОМУ ответили и что нам написали", () => {
    const text = buildPublishedNotification(input({
      contentType: "INBOUND_REPLY",
      title: "Ответ",
      engagementTargetLabel: "@marina в комментариях к посту про сон",
      engagementExcerpt: "А это работает, если не спишь вторую неделю?",
      publicUrl: "https://t.me/eterapy/42?comment=7",
    }));
    expect(text).toContain("Опубликовано: Ответ на входящее");
    expect(text).toContain("Кому ответили:</b> @marina");
    expect(text).toContain("Нам написали:");
    expect(text).toContain("вторую неделю");
  });

  it("у комментария подпись — «Где прокомментировали», а не «Кому ответили»", () => {
    const text = buildPublishedNotification(input({
      contentType: "COMMENT",
      engagementTargetLabel: "тред r/anxiety",
    }));
    expect(text).toContain("Где прокомментировали:");
    expect(text).not.toContain("Кому ответили:");
  });

  it("у обычного поста нет полей разговора — они пусты и не должны рисовать прочерки", () => {
    const text = buildPublishedNotification(input());
    expect(text).not.toContain("Кому ответили");
    expect(text).not.toContain("Где прокомментировали");
    expect(text).not.toContain("Регистр:");
  });
});

describe("B653 · пустой адрес называет причину, а не молчит", () => {
  it("у Дзена сказано, что адрес появится после импорта ленты", () => {
    const text = buildPublishedNotification(input({ platform: "dzen", publicUrl: null }));
    expect(text).toContain("Ссылка:</b> пока нет");
    expect(text).toContain("Дзен заберёт материал из ленты");
  });

  it("у остальных площадок — честное «не вернула адрес»", () => {
    expect(missingUrlReason("vk")).toContain("не вернула адрес");
  });

  it("пустая ссылка никогда не печатается пустым местом", () => {
    const text = buildPublishedNotification(input({ publicUrl: null }));
    expect(text).not.toMatch(/Ссылка:<\/b>\s*$/m);
  });
});

describe("B653 · экранирование и длина", () => {
  it("разметка из текста площадки не ломает HTML сообщения", () => {
    const text = buildPublishedNotification(input({
      engagementExcerpt: "<b>жирный</b> & <script>alert(1)</script>",
      contentType: "COMMENT",
    }));
    expect(text).not.toContain("<script>");
    expect(text).toContain("&lt;script&gt;");
  });

  it("длинное тело подрезается — карточка обязана оставаться ёмкой", () => {
    const text = buildPublishedNotification(input({ body: "я".repeat(5_000) }));
    expect(text).toContain("…");
    expect(text.length).toBeLessThan(2_000);
  });
});

describe("B653 · тип материала называется по-человечески", () => {
  it.each([
    ["POST", "Пост"],
    ["COMMENT", "Комментарий"],
    ["INBOUND_REPLY", "Ответ на входящее"],
  ])("%s → %s", (code, label) => {
    expect(publicationKindLabel(code)).toBe(label);
  });
});

describe("B653 · недоставленное уведомление не трогает вышедший материал", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("падение Telegram гасится внутри и возвращает false, а не бросает", async () => {
    jest.doMock("@/lib/telegram", () => ({
      sendTelegram: jest.fn().mockRejectedValue(new Error("chat not found")),
    }));
    jest.doMock("@/lib/ops-notification-channel", () => ({
      marketingDeliveryTargets: jest.fn().mockResolvedValue(["-100123"]),
    }));

    const { notifyPublished } = await import("@/lib/marketing/publish-notification");
    await expect(notifyPublished(input())).resolves.toBe(false);
  });

  it("первый успешный адрес останавливает перебор — дубля в служебный канал нет", async () => {
    const sendTelegram = jest.fn().mockResolvedValue(1);
    jest.doMock("@/lib/telegram", () => ({ sendTelegram }));
    jest.doMock("@/lib/ops-notification-channel", () => ({
      marketingDeliveryTargets: jest.fn().mockResolvedValue(["-100marketing", "-100ops"]),
    }));

    const { notifyPublished } = await import("@/lib/marketing/publish-notification");
    await expect(notifyPublished(input())).resolves.toBe(true);
    expect(sendTelegram).toHaveBeenCalledTimes(1);
    expect(sendTelegram).toHaveBeenCalledWith("-100marketing", expect.stringContaining("Опубликовано"));
  });
});
