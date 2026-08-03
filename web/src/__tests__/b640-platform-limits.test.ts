/**
 * B640 — материал больше не умирает из-за длины.
 *
 * Срез прода 2026-08-03: за неделю опубликован один материал, а 29 выброшено
 * валидатором на выходе — 11 threads по 480 символов, 8 telegram по 1000,
 * 8 dzen без медиа-брифа, 2 instagram без него же. Токены обеих ролей
 * потрачены, на площадку не вышло ничего.
 *
 * Проверяем поведение, а не формулировки: что нарушение превращается в
 * исполнимое замечание с точной цифрой, что последний раунд чинит
 * детерминированно, и что усечение сохраняет ссылку и не рвёт слово.
 */
import {
  draftLimitViolations,
  fallbackMediaBrief,
  platformLimitsForPrompt,
  platformPublishLimits,
  trimToLimit,
} from "@/lib/marketing/platform-limits";
import { repairPublishableDraft } from "@/lib/marketing/agent";

const draft = {
  title: "Когда решение не даётся",
  text: "Полезный текст.",
  cta: "Открыть разбор",
  mediaBrief: "Кружка на подоконнике, утренний свет.",
  safetyFlags: [] as string[],
  audienceNeed: "саморефлексия",
  goal: "полезный отклик",
  disclosure: "",
  researchUsed: [] as string[],
};

describe("B640 — лимиты площадок как данные, а не как текст промпта", () => {
  it("предел площадки попадает в задачу автора цифрой", () => {
    expect(platformLimitsForPrompt("threads")).toMatchObject({
      platform: "threads",
      maxCharacters: 480,
      mediaBriefRequired: false,
    });
    expect(platformLimitsForPrompt("telegram")).toMatchObject({
      maxCharacters: 1_000,
      mediaBriefRequired: true,
    });
  });

  it("у Дзена предела по длине нет, но визуальная идея обязательна", () => {
    expect(platformPublishLimits("dzen")).toMatchObject({
      textLimit: null,
      mediaBriefRequired: true,
    });
  });

  it("незнакомая площадка не изобретает себе ограничений", () => {
    expect(draftLimitViolations({ platform: "mastodon", text: "я".repeat(9_000) })).toEqual([]);
  });

  it("замечание называет, НА СКОЛЬКО перебор — «слишком длинно» неисполнимо", () => {
    const [violation] = draftLimitViolations({
      platform: "threads",
      text: "я".repeat(694),
    });
    expect(violation.kind).toBe("length");
    expect(violation.issue).toContain("694");
    expect(violation.issue).toContain("480");
    expect(violation.brief).toContain("214");
  });

  it("пустой mediaBrief там, где площадка без картинки не публикует", () => {
    const kinds = draftLimitViolations({
      platform: "instagram",
      text: "Короткий текст.",
      mediaBrief: "   ",
    }).map((violation) => violation.kind);
    expect(kinds).toEqual(["media-brief"]);
  });
});

describe("B640 — нарушение возвращается на доработку, а не в архив", () => {
  const url = "https://eterapy.com/products/chat";

  it("не последний раунд: материал цел, замечание вынесено наружу", () => {
    const result = repairPublishableDraft({
      draft: { ...draft, text: "я".repeat(1_200), mediaBrief: "" },
      isConversational: false,
      destinationUrl: url,
      platform: "telegram",
      finalRound: false,
    });
    expect(result.violations.map((violation) => violation.kind).sort())
      .toEqual(["length", "media-brief"]);
    // текст НЕ усечён: у автора ещё есть раунд, чтобы сократить осмысленно
    expect(result.draft.text.length).toBeGreaterThan(1_000);
  });

  it("последний раунд: система чинит сама и помечает, что это её правка", () => {
    const result = repairPublishableDraft({
      draft: { ...draft, text: "я".repeat(1_200), mediaBrief: "" },
      isConversational: false,
      destinationUrl: url,
      platform: "telegram",
      topic: "выбор работы",
      finalRound: true,
    });
    expect(result.violations).toEqual([]);
    expect(result.draft.text.length).toBeLessThanOrEqual(1_000);
    expect(result.draft.text).toContain(url);
    expect(result.draft.mediaBrief).toContain("выбор работы");
    const fields = result.repairs.map((repair) => repair.field);
    expect(fields).toContain("length");
    expect(fields).toContain("mediaBrief");
  });

  it("материал в пределах лимита не трогается ни на каком раунде", () => {
    const result = repairPublishableDraft({
      draft: { ...draft, text: `Короткий пост. ${url}` },
      isConversational: false,
      destinationUrl: url,
      platform: "threads",
      finalRound: true,
    });
    expect(result.repairs).toEqual([]);
    expect(result.violations).toEqual([]);
    expect(result.draft.text).toBe(`Короткий пост. ${url}`);
  });

  it("разговорный материал лимитами площадки не проверяется", () => {
    const result = repairPublishableDraft({
      draft: { ...draft, text: "я".repeat(1_200), mediaBrief: "" },
      isConversational: true,
      destinationUrl: null,
      platform: "telegram",
      finalRound: true,
    });
    expect(result.violations).toEqual([]);
  });

  it("safety-флаг и отсутствие адреса остаются отбраковкой", () => {
    expect(() => repairPublishableDraft({
      draft: { ...draft, safetyFlags: ["SAFETY_BLOCK"] },
      isConversational: false,
      destinationUrl: url,
      platform: "telegram",
    })).toThrow(/safety block/);
    expect(() => repairPublishableDraft({
      draft,
      isConversational: false,
      destinationUrl: null,
      platform: "telegram",
    })).toThrow(/no destination URL/);
  });
});

describe("B640 — усечение сохраняет то, ради чего писали", () => {
  const url = "https://eterapy.com/products/chat";

  it("режет по границе предложения, а не посреди слова", () => {
    const text = `${"Первое предложение живёт здесь. ".repeat(20)}${url}`;
    const trimmed = trimToLimit({ text, limit: 200, mustKeep: url });
    expect(trimmed.length).toBeLessThanOrEqual(200);
    expect(trimmed).toContain(url);
    expect(trimmed).toMatch(/здесь\.\n\nhttps/);
  });

  it("ссылка не теряется даже когда от текста остаётся мало", () => {
    const text = `${"я".repeat(500)} ${url}`;
    const trimmed = trimToLimit({ text, limit: 90, mustKeep: url });
    expect(trimmed).toContain(url);
    expect(trimmed.length).toBeLessThanOrEqual(90);
  });

  it("текст без границы предложения обрывается с многоточием, а не на середине слова", () => {
    const trimmed = trimToLimit({
      text: `${"длинноесловобезточек ".repeat(30)}${url}`,
      limit: 120,
      mustKeep: url,
    });
    expect(trimmed).toMatch(/…/);
    expect(trimmed).toContain(url);
  });

  it("короткий текст возвращается как есть", () => {
    expect(trimToLimit({ text: "Коротко.", limit: 100, mustKeep: null })).toBe("Коротко.");
  });

  it("запасная визуальная идея понятна дизайнеру и не притворяется авторской", () => {
    const brief = fallbackMediaBrief({ title: "Заголовок", topic: "сон и тревога" });
    expect(brief).toContain("сон и тревога");
    expect(brief.length).toBeGreaterThan(40);
  });
});
