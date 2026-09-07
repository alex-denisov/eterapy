/**
 * B727 — раскладка обложки выбирается по ТЕЛУ материала.
 *
 * Замер реестра прода 2026-09-07: диалоговый мокап B725 был прикреплён к 0 из
 * 226 строк. Решение принимала регулярка по ЗАГОЛОВКУ, а заголовку она
 * соответствовала у 8 строк из 226 (3,5 %). Цитату собеседника персона Ани
 * (B723) ставит в текст поста: `«` есть в теле у 99 из 222 (45 %).
 */
import { coverLayoutFor, dialogueQuoteFrom } from "@/lib/marketing/cover-layout";

describe("B727: обложка-мокап смотрит в тело поста", () => {
  const anyaPost = [
    "Самое странное в ожидании бывшего: кажется, стоит перестать о нём думать.",
    "",
    "«Я просто был занят» — и снова две недели тишины.",
    "",
    "У вас тоже так было?",
  ].join("\n");

  it("цитата из тела включает мокап и попадает на обложку", () => {
    const decided = coverLayoutFor({
      title: "Вернётся ли бывший или я жду зря",
      body: anyaPost,
    });

    expect(decided.layout).toBe("chat_mockup");
    expect(decided.messageText).toBe("Я просто был занят");
  });

  it("прежняя проверка по заголовку этот же материал не поймала бы", () => {
    const title = "Вернётся ли бывший или я жду зря";
    const oldRule = title.includes("«")
      || /диалог|переписк|сообщен|написал|молчани|чат/i.test(title);

    expect(oldRule).toBe(false);
    expect(coverLayoutFor({ title, body: anyaPost }).layout).toBe("chat_mockup");
  });

  it("материал без реплики остаётся графической обложкой", () => {
    const decided = coverLayoutFor({
      title: "Что показывает натальная карта: разбор без предсказаний",
      body: "Астрологический портрет подсвечивает частые паттерны, но не управляет поступками.",
    });

    expect(decided.layout).toBe("art");
    expect(decided.messageText).toBeNull();
  });

  it("наш собственный призыв в кавычках репликой не считается", () => {
    // Иначе мокап напечатает как «входящее сообщение» нашу же ссылку.
    expect(dialogueQuoteFrom("Читать разбор: «https://eterapy.com/library/x»")).toBeNull();
    expect(dialogueQuoteFrom("Подробнее «см. eterapy.com/library»")).toBeNull();
  });

  it("заголовочные маркеры остаются вторым входом", () => {
    expect(coverLayoutFor({
      title: "Почему он читает сообщения и не отвечает",
      body: "Текст без прямой речи.",
    }).layout).toBe("chat_mockup");

    expect(coverLayoutFor({
      title: "Разбор темы",
      body: "Текст без прямой речи.",
      cluster: "Разбор переписки",
    }).layout).toBe("chat_mockup");
  });

  it("тело сильнее заголовка: реплика оттуда и печатается", () => {
    const decided = coverLayoutFor({
      title: "«Заголовочная цитата»",
      body: "Он написал «ты сама всё придумала» и вышел из чата.",
    });

    expect(decided.messageText).toBe("ты сама всё придумала");
  });
});
