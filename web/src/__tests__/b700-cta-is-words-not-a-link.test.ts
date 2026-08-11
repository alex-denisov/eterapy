/**
 * B700 фаза 6 — приклеенный адрес перестал считаться призывом.
 *
 * ЧТО СЛУЧИЛОСЬ. Владелец 2026-08-09: «статьи в медиа ресурсах вышли вообще
 * без CTA некоторые, а это значит что работа маркетолога и/или SMM выполнена
 * очень плохо и не конвертирует трафик в клиентов нашей площадки».
 *
 * Замер прода 2026-08-09 показал, что он прав и точнее, чем формулировал:
 * ссылка была в 13 из 14 выпущенных постов, а ПРИЗЫВА не было почти нигде.
 * Шесть материалов из семи заканчивались голым URL. Причина не в модели: и
 * ссылку, и «CTA» дописывала за автора система (`repairPublishableDraft`,
 * B623) — пустое поле заполнялось строкой «Открыть по ссылке в тексте: <url>»,
 * после чего проверка «CTA есть» проходила ВСЕГДА. Система создавала видимость
 * призыва там, где его не написал никто.
 *
 * ГРАНИЦЫ, КОТОРЫЕ ДЕРЖИТ ЭТОТ ТЕСТ:
 *   1. пустой призыв — замечание автору, а не тихая подстановка;
 *   2. поле, где кроме адреса ничего нет, призывом не считается;
 *   3. настоящий короткий призыв («Разбор целиком») проходит — планка отделяет
 *      фразу от адреса, а не хорошую фразу от плохой;
 *   4. на последнем раунде система пишет призыв СЛОВАМИ, и материал перестаёт
 *      заканчиваться голым адресом;
 *   5. дописанный призыв учитывается ДО усечения по лимиту площадки — иначе
 *      материал уезжал бы за предел ровно тем, чем его чинили.
 */

import { repairPublishableDraft } from "@/lib/marketing/agent";
import { CTA_MIN_WORDS, ctaWordsOf } from "@/lib/marketing/platform-limits";

const URL = "https://eterapy.com/library/kak-perezhit-rasstavanie-s-lyubimym";

const draft = {
  title: "Почему расставание длится дольше отношений",
  text: "Расставание редко заканчивается в тот день, когда закончились отношения.",
  audienceNeed: "понять своё состояние",
  goal: "дать один наблюдаемый шаг",
  disclosure: "",
  cta: "",
  mediaBrief: "спокойная абстрактная обложка",
  researchUsed: [],
  safetyFlags: [],
};

const repair = (patch: Partial<typeof draft>, extra: { finalRound?: boolean } = {}) =>
  repairPublishableDraft({
    draft: { ...draft, ...patch },
    isConversational: false,
    destinationUrl: URL,
    platform: "vk",
    topic: "как пережить расставание",
    ...extra,
  });

describe("B700 фаза 6 · CTA считается словами, а не наличием ссылки", () => {
  it("голый адрес в поле cta не считается призывом", () => {
    expect(ctaWordsOf(URL)).toBe(0);
    expect(ctaWordsOf(`  ${URL}  `)).toBeLessThan(CTA_MIN_WORDS);
  });

  it("настоящий короткий призыв проходит: планка отделяет фразу от адреса", () => {
    // Единственный настоящий CTA из замера — «Разбор целиком: <ссылка>».
    expect(ctaWordsOf(`Разбор целиком: ${URL}`)).toBeGreaterThanOrEqual(CTA_MIN_WORDS);
    expect(repair({ cta: `Разбор целиком: ${URL}` }).violations
      .map((violation) => violation.kind)).not.toContain("cta");
  });

  it("пустой призыв — замечание автору, а не тихая подстановка системы", () => {
    const result = repair({ cta: "" });

    expect(result.violations.map((violation) => violation.kind)).toContain("cta");
    expect(result.repairs.map((repair) => repair.field)).not.toContain("cta");
    // Поле осталось пустым: за автора его никто не заполнил.
    expect(result.draft.cta).toBe("");
  });

  it("последний раунд: призыв пишет система, и хвост перестаёт быть голым адресом", () => {
    const result = repair({ cta: "" }, { finalRound: true });

    expect(result.repairs.map((repair) => repair.field)).toContain("cta");
    expect(result.draft.cta).toContain("Разобрать свою ситуацию");
    expect(result.draft.text).toContain(URL);
    expect(result.draft.text.trimEnd()).not.toMatch(/\n\s*https?:\/\/\S+$/u);
    expect(result.violations).toHaveLength(0);
  });

  it("дописанный призыв учитывается ДО усечения по лимиту площадки", () => {
    const result = repairPublishableDraft({
      draft: { ...draft, cta: "", text: "я".repeat(1_100) },
      isConversational: false,
      destinationUrl: URL,
      platform: "telegram",
      topic: "как пережить расставание",
      finalRound: true,
    });

    expect(result.violations).toHaveLength(0);
    // Материал уложился в лимит ВМЕСТЕ с призывом и ссылкой.
    expect(result.draft.text.length).toBeLessThanOrEqual(1_000);
    expect(result.draft.text).toContain(URL);
  });
});
