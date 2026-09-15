/**
 * B746 §1 — ФОРМАТ РЕШАЕТ КАРТИНКУ, ССЫЛКУ И ПРОДОЛЖЕНИЕ, И КОД ЕМУ ПОДЧИНЯЕТСЯ.
 *
 * Замер прода 2026-09-15: 100 % постов всех площадок за 14 суток — с
 * картинкой; первый материал нового формата Threads («острый вопрос», правило
 * «ссылка НЕ нужна») прошёл редактора с хвостом «Разобрать свою ситуацию…:
 * https://…» — ссылку дописала система поверх правил формата. Владелец:
 * «скриншот+текст в телеге — это жутко бесит».
 *
 * Прогон меряет то, что можно померить без ленты: у каждой площадки несколько
 * форматов, картинка — решение формата, формат без ссылки не получает ссылку
 * от кода, формат с продолжением требует `replyText` и публикатор шлёт его
 * ответом на свой пост.
 */

import { contentPlanFor } from "@/lib/marketing/content-plan";
import {
  DZEN_FORMATS,
  INSTAGRAM_FORMATS,
  TELEGRAM_FORMATS,
  THREADS_FORMATS,
  VK_FORMATS,
  ZODIAC_CALLOUT_LABEL,
  formatFor,
  formatRulesFor,
  formatsFor,
  postFormatByLabel,
  zodiacSignFor,
} from "@/lib/marketing/post-formats";
import { repairPublishableDraft, stripPlanLink } from "@/lib/marketing/agent";
import { replyTextFromNotes } from "@/lib/marketing/publish";

const URL = "https://eterapy.com/library/test?utm_source=threads&utm_medium=social&utm_campaign=library";

function draft(text: string, extra: Partial<Parameters<typeof repairPublishableDraft>[0]["draft"]> = {}) {
  return {
    title: "t",
    text,
    audienceNeed: "a",
    goal: "g",
    disclosure: "",
    cta: "",
    mediaBrief: "",
    researchUsed: [],
    safetyFlags: [],
    ...extra,
  };
}

describe("B746 §1 — библиотеки форматов всех площадок", () => {
  it("у каждой площадки несколько форматов, и картинка — решение формата", () => {
    for (const [platform, library] of [
      ["telegram", TELEGRAM_FORMATS],
      ["vk", VK_FORMATS],
      ["instagram", INSTAGRAM_FORMATS],
      ["dzen", DZEN_FORMATS],
      ["threads", THREADS_FORMATS],
    ] as const) {
      expect(formatsFor(platform)).toBe(library);
      expect(library.length).toBeGreaterThanOrEqual(4);
      for (const format of library) {
        expect(format.construction.length).toBeGreaterThan(40);
        expect(["none", "art", "chat_mockup"]).toContain(format.media);
        expect(typeof format.link).toBe("boolean");
        // Формат без ссылки обязан сказать об этом и редактору словами:
        // иначе тот режет по общей рубрике (B734).
        if (!format.link) expect(format.rules.join(" ")).toMatch(/Призыв и ссылка НЕ нужны/);
      }
    }
    // Telegram: картинка — исключение. Владелец: «скриншот+текст в телеге —
    // это жутко бесит». Мокап переписки — ровно один формат с малым весом.
    const telegramText = TELEGRAM_FORMATS.filter((format) => format.media === "none");
    expect(telegramText.length).toBeGreaterThan(TELEGRAM_FORMATS.length / 2);
    const telegramMockup = TELEGRAM_FORMATS.filter((format) => format.media === "chat_mockup");
    expect(telegramMockup).toHaveLength(1);
    expect(telegramMockup[0].weight).toBe(1);
    // Instagram без картинки не публикуется — там все форматы с медиа.
    expect(INSTAGRAM_FORMATS.every((format) => format.media !== "none")).toBe(true);
  });

  it("формат — поле слота у ВСЕХ площадок, лента каждой идёт несколькими форматами", () => {
    const plan = contentPlanFor(new Date("2026-09-16T09:00:00+03:00"));
    for (const channel of ["telegram", "vk", "instagram", "dzen", "threads"] as const) {
      const slots = plan.filter((slot) => slot.channel === channel);
      expect(slots.length).toBeGreaterThan(2);
      const used = new Set<string>();
      for (const slot of slots) {
        const format = postFormatByLabel(slot.format, channel);
        expect(format).not.toBeNull();
        expect(slot.formatMedia).toBe(format!.media);
        expect(slot.formatLink).toBe(format!.link);
        expect(slot.formatRules).toEqual(expect.arrayContaining([...format!.rules]));
        used.add(slot.format);
      }
      // Instagram выходит через день — в недельном окне 3–4 слота, и трёх
      // разных форматов там может не набраться; у остальных лент их больше.
      expect(used.size).toBeGreaterThanOrEqual(slots.length < 5 ? 2 : 3);
    }
    // Одна дата не даёт один и тот же формат Telegram и VK: сдвиг площадки.
    const day = 20700;
    expect(formatFor("telegram", day, 0).label).not.toBe(formatFor("vk", day, 0).label);
  });

  it("оклик по знаку: знак от номера суток, прогноз ответом, без ссылки", () => {
    const callout = postFormatByLabel(ZODIAC_CALLOUT_LABEL, "threads")!;
    expect(callout.link).toBe(false);
    expect(callout.reply).toBe("forecast");
    expect(callout.media).toBe("none");
    expect(callout.example).toMatch(/Забирайте прогноз:$/);
    // Знак — детерминированный от суток и не зависит от позиции в окне.
    expect(zodiacSignFor(12)).toBe(zodiacSignFor(0));
    expect(zodiacSignFor(11)).toBe("Рыбы");
    expect(formatRulesFor(callout, 11)[0]).toMatch(/Знак этого поста — Рыбы/);
    // Несерийный формат правил не меняет.
    const question = postFormatByLabel("острый вопрос", "threads")!;
    expect(formatRulesFor(question, 11)).toBe(question.rules);
    // Формат — заметная доля ленты, а не единичный эксперимент.
    const seen = new Map<string, number>();
    for (let day = 0; day < 90; day += 1) {
      for (let sequence = 0; sequence < 2; sequence += 1) {
        const label = formatFor("threads", day, sequence).label;
        seen.set(label, (seen.get(label) ?? 0) + 1);
      }
    }
    expect(seen.get(ZODIAC_CALLOUT_LABEL)! / 180).toBeGreaterThan(0.15);
  });
});

describe("B746 §1 — код подчиняется решению формата о ссылке и продолжении", () => {
  it("формат без ссылки: адрес и призыв НЕ дописываются даже на последнем раунде", () => {
    const result = repairPublishableDraft({
      draft: draft("какую фразу бывшего вы до сих пор помните дословно?"),
      isConversational: false,
      destinationUrl: URL,
      platform: "threads",
      finalRound: true,
      format: { link: false },
    });
    expect(result.draft.text).not.toContain("eterapy.com");
    expect(result.draft.text).not.toMatch(/Разобрать свою ситуацию/);
    expect(result.draft.cta).toBe("");
    expect(result.violations.filter((violation) => violation.kind === "cta")).toHaveLength(0);
    expect(result.repairs.filter((repair) => repair.field === "cta")).toHaveLength(0);
  });

  it("формат без ссылки: адрес, вставленный автором, снимается", () => {
    const result = repairPublishableDraft({
      draft: draft(`какую фразу бывшего вы до сих пор помните дословно?\n\nРазобрать: ${URL}`),
      isConversational: false,
      destinationUrl: URL,
      platform: "threads",
      format: { link: false },
    });
    expect(result.draft.text).toBe("какую фразу бывшего вы до сих пор помните дословно?");
    expect(result.repairs.map((repair) => repair.field)).toContain("destinationUrl");
    // Чужие адреса не трогаются: это дело редактора.
    expect(stripPlanLink("см. https://example.org/x и всё", URL)).toBe("см. https://example.org/x и всё");
  });

  it("формат без ссылки может выйти и без адреса в плане", () => {
    expect(() => repairPublishableDraft({
      draft: draft("я: мне норм\nмой психолог: вы это говорите четвёртый месяц подряд"),
      isConversational: false,
      destinationUrl: null,
      platform: "threads",
      finalRound: true,
      format: { link: false },
    })).not.toThrow();
  });

  it("прежнее поведение с ссылкой не изменилось", () => {
    const result = repairPublishableDraft({
      draft: draft("Когда «просто устала» держится четвёртый месяц, это уже не усталость, это режим. Три абзаца текста про то, как это выглядит изнутри и что с этим делать."),
      isConversational: false,
      destinationUrl: URL,
      platform: "telegram",
      finalRound: true,
      topic: "Про себя",
    });
    expect(result.draft.text).toContain(URL);
    expect(result.draft.cta.length).toBeGreaterThan(0);
  });

  it("формат с продолжением: пустой replyText — нарушение, полный — проходит", () => {
    const empty = repairPublishableDraft({
      draft: draft("Рыбы — готовы? Про вас, что будет в ближайшие полторы недели.\nЗабирайте прогноз:"),
      isConversational: false,
      destinationUrl: null,
      platform: "threads",
      format: { link: false, reply: "forecast" },
    });
    expect(empty.violations.map((violation) => violation.kind)).toContain("reply");

    const full = repairPublishableDraft({
      draft: draft("Рыбы — готовы? Про вас, что будет в ближайшие полторы недели.\nЗабирайте прогноз:", {
        replyText: "Вам придётся простить — не кого-то другого, а себя. Ближайший месяц вернёт вас мыслями к решению, за которое вы до сих пор носите вину. Кто-то напомнит об этом без злого умысла. Это не шаг назад. Это последний круг.",
      }),
      isConversational: false,
      destinationUrl: null,
      platform: "threads",
      format: { link: false, reply: "forecast" },
    });
    expect(full.violations.map((violation) => violation.kind)).not.toContain("reply");
    expect(full.draft.replyText).toMatch(/последний круг/);
  });

  it("продолжение читается из notes только пока notes — JSON с replyText", () => {
    expect(replyTextFromNotes(JSON.stringify({ format: "x", replyText: " прогноз " }))).toBe("прогноз");
    expect(replyTextFromNotes(JSON.stringify({ format: "x" }))).toBeNull();
    expect(replyTextFromNotes(`${JSON.stringify({ replyText: "прогноз" })}\nREPLY: https://…`)).toBeNull();
    expect(replyTextFromNotes(null)).toBeNull();
  });
});
