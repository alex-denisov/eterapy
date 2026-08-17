/**
 * B623 — контрактные поля материала не зависят от послушности модели.
 *
 * Замер прода 2026-07-30 (после снятия потолка токенов B622): выпуск встал на
 * трёх отказах, два из которых система умеет выполнить сама — обязательная
 * ссылка и CTA. Здесь проверяется именно это: подстановка вместо отбраковки, и
 * отбраковка только там, где брать нечего.
 */

import {
  isDeferrableError,
  MarketingCapacityError,
  MarketingModelSeparationError,
  repairPublishableDraft,
} from "@/lib/marketing/agent";
import { marketingProviderOrder } from "@/lib/marketing/model-pool";

const draft = {
  title: "Заголовок",
  text: "Полезный текст без ссылки.",
  audienceNeed: "саморефлексия",
  goal: "отклик",
  disclosure: "",
  cta: "",
  mediaBrief: "Спокойная сцена",
  researchUsed: [],
  safetyFlags: [],
};

describe("B623 · ссылка и CTA подставляются, а не бракуются", () => {
  it("ссылка из плана дописывается в текст, а не отбраковывает материал", () => {
    const result = repairPublishableDraft({
      draft,
      isConversational: false,
      destinationUrl: "https://eterapy.com/products/chat",
      platform: "vk",
    });

    expect(result.draft.text).toContain("https://eterapy.com/products/chat");
    expect(result.repairs.map((repair) => repair.field)).toContain("destinationUrl");
  });

  /**
   * B700 фаза 6 — ПРАВИЛО ПЕРЕВЁРНУТО, и это решение владельца (2026-08-09).
   *
   * B623 заполнял пустой CTA строкой «Открыть по ссылке в тексте: <url>», и
   * проверка «CTA есть» после этого проходила всегда. Замер прода 2026-08-09
   * показал цену: шесть материалов из семи заканчивались голой ссылкой, потому
   * что призыв за автора писала система, а не автор. Теперь пустой призыв —
   * это ЗАМЕЧАНИЕ, и система пишет его сама только на последнем раунде.
   */
  it("пустой CTA больше не заполняется молча: это замечание редактора", () => {
    const result = repairPublishableDraft({
      draft,
      isConversational: false,
      destinationUrl: "https://eterapy.com/products/chat",
      platform: "vk",
    });

    expect(result.repairs.map((repair) => repair.field)).not.toContain("cta");
    expect(result.violations.map((violation) => violation.kind)).toContain("cta");
  });

  it("последний раунд: призыв пишет система СЛОВАМИ, а не адресом", () => {
    const result = repairPublishableDraft({
      draft,
      isConversational: false,
      destinationUrl: "https://eterapy.com/products/chat",
      platform: "vk",
      topic: "как пережить расставание",
      finalRound: true,
    });

    expect(result.repairs.map((repair) => repair.field)).toContain("cta");
    expect(result.draft.cta).toContain("Разобрать свою ситуацию");
    // Хвост материала перестал быть голым адресом — ровно то, что владелец
    // назвал браком выпуска.
    expect(result.draft.text.trimEnd()).not.toMatch(/\n\s*https?:\/\/\S+$/u);
    expect(result.violations).toHaveLength(0);
  });

  it("правки видны редактору списком, а не молча", () => {
    const result = repairPublishableDraft({
      draft,
      isConversational: false,
      destinationUrl: "https://eterapy.com/products/chat",
      platform: "vk",
    });
    expect(result.repairs).toHaveLength(1);
    expect(result.repairs.every((repair) => repair.note.length > 0)).toBe(true);
  });

  it("готовый материал не переписывается: правок нет", () => {
    const result = repairPublishableDraft({
      draft: {
        ...draft,
        text: "Текст со ссылкой https://eterapy.com/products/chat внутри.",
        cta: "Собрать разбор",
      },
      isConversational: false,
      destinationUrl: "https://eterapy.com/products/chat",
      platform: "vk",
    });
    expect(result.repairs).toHaveLength(0);
    expect(result.draft.text).not.toMatch(/chat\s+https/);
  });

  it("отбраковка остаётся там, где ссылку взять негде", () => {
    expect(() => repairPublishableDraft({
      draft,
      isConversational: false,
      destinationUrl: null,
      platform: "vk",
    })).toThrow(/no destination URL/);
  });

  it("лимит площадки проверяется ПОСЛЕ подстановки", () => {
    // Проверяется именно МОМЕНТ проверки: 470 символов сами по себе в 480
    // помещаются, и только дописанная ссылка выводит текст за предел.
    //
    // B640 отдавал такой перебор наружу замечанием, и цикл возвращал его
    // автору на доработку. B713 §2 изменил исход по требованию владельца
    // 2026-08-17: модель не умеет считать символы, и замечание о длине
    // превращалось в бесконечный круг (27 смертей материалов за две недели).
    // Теперь длину снимает код на КАЖДОМ раунде — редактор её не видит вовсе.
    //
    // Инвариант B623 при этом жив и проверяется здесь же: длина меряется уже
    // ВМЕСТЕ с подставленной ссылкой, иначе материал уезжал бы за предел ровно
    // тем, чем его чинили.
    const result = repairPublishableDraft({
      draft: { ...draft, text: "я".repeat(470) },
      isConversational: false,
      destinationUrl: "https://eterapy.com/products/chat",
      platform: "threads",
    });
    expect(result.violations.map((violation) => violation.kind)).not.toContain("length");
    expect(result.repairs.map((repair) => repair.field)).toContain("length");
    expect(result.draft.text.length).toBeLessThanOrEqual(480);
    expect(result.draft.text).toContain("https://eterapy.com/products/chat");
  });

  it("разговорному материалу ссылка не обязательна", () => {
    const result = repairPublishableDraft({
      draft,
      isConversational: true,
      destinationUrl: null,
      platform: "vk",
    });
    expect(result.repairs).toHaveLength(0);
    expect(result.draft.text).toBe("Полезный текст без ссылки.");
  });

  it("safety-флаг автора по-прежнему останавливает выпуск", () => {
    expect(() => repairPublishableDraft({
      draft: { ...draft, safetyFlags: ["SAFETY_BLOCK"] },
      isConversational: false,
      destinationUrl: "https://eterapy.com/",
      platform: "vk",
    })).toThrow(/safety block/);
  });
});

describe("B623 · writer и reviewer не сходятся на одной модели", () => {
  it("пересечение моделей — отложенный отказ, а не брак материала", () => {
    expect(isDeferrableError(new MarketingModelSeparationError("same model"))).toBe(true);
    expect(isDeferrableError(new MarketingCapacityError("no capacity"))).toBe(true);
    expect(isDeferrableError(new Error("writer returned invalid structured output"))).toBe(false);
  });

  it("провайдер автора уходит в конец очереди редактора, но не выбрасывается", () => {
    const rotated = marketingProviderOrder("reviewer:seed");
    const writerProvider = rotated[0];
    const reviewerOrder = [
      ...rotated.filter((provider) => provider !== writerProvider),
      ...rotated.filter((provider) => provider === writerProvider),
    ];

    expect(reviewerOrder).toHaveLength(rotated.length);
    expect(reviewerOrder.at(-1)).toBe(writerProvider);
    expect(reviewerOrder[0]).not.toBe(writerProvider);
  });
});
