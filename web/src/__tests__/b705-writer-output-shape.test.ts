/**
 * B705 — форма ответа автора проверяется на границе, а не первым `.trim()`.
 *
 * Замер прода 2026-08-16: два материала умерли с причиной
 * `input.draft.mediaBrief?.trim is not a function`. Модель вернула валидный
 * JSON, где `mediaBrief` был объектом; разбор прошёл, а проход упал TypeError'ом
 * уже внутри `repairPublishableDraft` — и материал получил приговор «не
 * подлежит повтору» за ошибку нашего кода.
 */

import {
  isDeferrableError,
  MarketingWriterGarbageError,
  repairPublishableDraft,
  writerObject,
} from "@/lib/marketing/agent";

const POST_TEXT =
  "Три ночи подряд один и тот же сон пугает сильнее самого сюжета. Повтор не предсказывает "
  + "событие: он показывает, какая тема не отпускает вас наяву. Начните с одного вопроса — "
  + "что вы чувствовали в момент пробуждения.";

describe("B705 · разбор ответа автора не доверяет форме полей", () => {
  it("объект вместо строки в mediaBrief не роняет проход", () => {
    const raw = JSON.stringify({
      title: "Повторяющийся сон",
      text: POST_TEXT,
      audienceNeed: "успокоиться",
      goal: "дать опору",
      disclosure: "",
      cta: "Разобрать свой сон вместе с нами",
      // Ровно та форма, которая убила два материала на проде.
      mediaBrief: { idea: "тёмная спальня, мягкий свет", palette: ["indigo", "sand"] },
      researchUsed: [],
      safetyFlags: [],
    });

    const draft = writerObject(raw, "запасной заголовок");
    expect(typeof draft.mediaBrief).toBe("string");

    // Главное утверждение: следующий шаг конвейера больше не падает.
    expect(() =>
      repairPublishableDraft({
        draft,
        isConversational: false,
        destinationUrl: "https://eterapy.com/products/dreams",
        platform: "telegram",
        topic: "сны",
      }),
    ).not.toThrow();
  });

  it("число и массив в строковых полях приводятся к строке, а не текут дальше", () => {
    const raw = JSON.stringify({
      title: 42,
      text: POST_TEXT,
      cta: ["Разобрать", "сон"],
      mediaBrief: null,
      researchUsed: "не массив",
      safetyFlags: [null, "ok"],
    });
    const draft = writerObject(raw, "запасной заголовок");
    expect(draft.title).toBe("42");
    expect(draft.cta).toBe("");
    expect(draft.mediaBrief).toBe("");
    expect(draft.researchUsed).toEqual([]);
    expect(draft.safetyFlags).toEqual(["ok"]);
  });

  it("пустой заголовок заменяется запасным, а не остаётся пустым", () => {
    const draft = writerObject(JSON.stringify({ title: "", text: POST_TEXT }), "запасной заголовок");
    expect(draft.title).toBe("запасной заголовок");
  });

  it("лог рассуждений вместо поста отвергается на разборе, а не у редактора", () => {
    const raw = JSON.stringify({
      title: "Повторяющийся сон",
      text: "Let me write a calm post about recurring dreams for the Telegram channel.",
    });
    expect(() => writerObject(raw, "запасной заголовок")).toThrow(/no publishable post/u);
  });

  it("запасная ветка разбора судится тем же стражем", () => {
    // JSON не разобрался, текст пришёл прозой — и это английский лог.
    const raw = "Okay, so the user wants a short post about recurring dreams. "
      + "I will keep the tone calm, avoid promises, and place the call to action at the very end "
      + "of the message so that it does not read like an advertisement to the audience of the channel.";
    expect(() => writerObject(raw, "запасной заголовок")).toThrow(/no publishable post/u);
  });
});

describe("B705 · перебор целиком из «не постов» откладывает материал, а не хоронит", () => {
  it("отказ стража называется откладываемым, а не браком материала", () => {
    const garbage = new MarketingWriterGarbageError(
      "Ни один маршрут не вернул текст поста: модели отвечали логом рассуждений",
    );
    expect(isDeferrableError(garbage)).toBe(true);

    // Граница: обычный брак структуры откладываемым НЕ становится — иначе
    // материал с настоящим дефектом ходил бы по кругу вечно.
    expect(isDeferrableError(new Error("No free provider returned valid structured output"))).toBe(false);
  });
});
