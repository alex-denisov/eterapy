/**
 * B705/B706 — что считает регулярка, редактор считать не должен.
 *
 * Первый тест воспроизводит ровно тот случай прода, ради которого заведён
 * валидатор: `archive_reason` от 2026-08-12 дословно — «текст всё ещё длиннее
 * лимита Threads (718 символов), CTA дублируется». Круг редактуры был потрачен
 * на измерение длины строки.
 */

import { inspectDraft } from "@/lib/marketing/draft-inspection";
import { parsePlaybookOverride, playbookSettingKey } from "@/lib/marketing/playbook-settings";
import { platformContract } from "@/lib/marketing/platform-playbook";

function defectRules(defects: { rule: string }[]) {
  return defects.map((defect) => defect.rule);
}

describe("B705 — контракт площадки проверяется без вызова модели", () => {
  it("ловит перебор длины Threads и называет точную цифру", () => {
    const defects = inspectDraft({
      platform: "threads",
      title: "Низкая совместимость по дате",
      text: "а".repeat(718),
    });
    const length = defects.find((defect) => defect.rule === "length-over");
    expect(length).toBeDefined();
    // Исполнимость замечания — предмет проверки: «сократи на 238» исполнимо,
    // «слишком длинно» нет.
    expect(length?.brief).toContain("238");
    expect(length?.issue).toContain("718");
  });

  it("не путает площадки: тот же текст проходит длину Дзена и валится на Threads", () => {
    const text = "а".repeat(3_000);
    const onThreads = defectRules(inspectDraft({ platform: "threads", title: "т", text }));
    const onDzen = defectRules(inspectDraft({
      platform: "dzen",
      title: "т",
      text,
      mediaBrief: "обложка",
    }));
    expect(onThreads).toContain("length-over");
    expect(onDzen).not.toContain("length-over");
    expect(onDzen).not.toContain("length-under");
  });

  it("длинное тире — дефект везде, кроме Дзена с его автотипографикой", () => {
    const text = `${"а".repeat(200)} слово — слово ${"б".repeat(200)}`;
    expect(defectRules(inspectDraft({ platform: "telegram", title: "т", text })))
      .toContain("em-dash-present");
    expect(defectRules(inspectDraft({ platform: "vk", title: "т", text, mediaBrief: "о" })))
      .toContain("em-dash-present");
    expect(defectRules(inspectDraft({
      platform: "dzen",
      title: "т",
      text: `${"а".repeat(2_600)} слово — слово`,
      mediaBrief: "обложка",
    }))).not.toContain("em-dash-present");
  });

  it("короткое тире и двойной дефис считаются наравне с длинным", () => {
    for (const dash of ["–", "--"]) {
      const defects = defectRules(inspectDraft({
        platform: "telegram",
        title: "т",
        text: `${"а".repeat(200)} слово ${dash} слово ${"б".repeat(200)}`,
      }));
      expect(defects).toContain("em-dash-present");
    }
  });

  it("призыв обязателен в VK и является дефектом в Threads", () => {
    const cta = "Разберите свою ситуацию по шагам";
    const inVk = defectRules(inspectDraft({
      platform: "vk",
      title: "т",
      text: "а".repeat(800),
      mediaBrief: "обложка",
      cta: "",
    }));
    expect(inVk).toContain("cta-missing");

    const inThreads = defectRules(inspectDraft({
      platform: "threads",
      title: "т",
      text: "а".repeat(200),
      cta,
    }));
    expect(inThreads).toContain("cta-forbidden");
  });

  it("голая ссылка призывом не считается", () => {
    const defects = defectRules(inspectDraft({
      platform: "vk",
      title: "т",
      text: "а".repeat(800),
      mediaBrief: "обложка",
      cta: "https://eterapy.com/checkin",
    }));
    expect(defects).toContain("cta-missing");
  });

  it("отдаёт весь список дефектов за раунд, а не первый", () => {
    const defects = inspectDraft({
      platform: "threads",
      title: "т",
      text: `В современном мире ${"а".repeat(700)} — вот так! #а #б #в`,
      cta: "Откройте разбор",
    });
    expect(defects.length).toBeGreaterThan(3);
    expect(new Set(defectRules(defects)).size).toBe(defectRules(defects).length);
  });
});

describe("B706 ступень 1 — числа контракта правятся без выкатки", () => {
  it("ключ настройки строится по имени площадки", () => {
    expect(playbookSettingKey("Threads")).toBe("marketing.playbook.threads");
  });

  it("переопределение из настроек меняет поведение валидатора", () => {
    const { contract, overridden } = parsePlaybookOverride(
      "threads",
      JSON.stringify({ maxCharacters: 900 }),
    );
    expect(overridden).toEqual(["maxCharacters"]);
    // Текст, который валился по коду, проходит по переопределённому контракту.
    const defects = defectRules(inspectDraft(
      { platform: "threads", title: "т", text: "а".repeat(718) },
      contract,
    ));
    expect(defects).not.toContain("length-over");
  });

  it("испорченный JSON не роняет разбор — берётся контракт из кода", () => {
    const result = parsePlaybookOverride("threads", "{не json");
    expect(result.contract).toEqual(platformContract("threads"));
    expect(result.rejected[0].field).toBe("*");
  });

  it("значение вне разумных пределов отвергается с причиной", () => {
    const result = parsePlaybookOverride("threads", JSON.stringify({ maxCharacters: 4 }));
    expect(result.overridden).toEqual([]);
    expect(result.rejected[0].reason).toContain("допустимо от");
    expect(result.contract.maxCharacters).toBe(platformContract("threads").maxCharacters);
  });

  it("неизвестное поле отвергается, а соседнее верное применяется", () => {
    const result = parsePlaybookOverride(
      "vk",
      JSON.stringify({ maxEmoji: 5, придуманноеПоле: 1 }),
    );
    expect(result.overridden).toEqual(["maxEmoji"]);
    expect(result.rejected).toHaveLength(1);
    expect(result.contract.maxEmoji).toBe(5);
  });

  it("противоречивая пара границ откатывается целиком, а не наполовину", () => {
    const base = platformContract("vk");
    const result = parsePlaybookOverride(
      "vk",
      JSON.stringify({ minCharacters: 3_000, maxCharacters: 1_000 }),
    );
    expect(result.contract.minCharacters).toBe(base.minCharacters);
    expect(result.contract.maxCharacters).toBe(base.maxCharacters);
    expect(result.overridden).not.toContain("minCharacters");
  });

  it("ctaPolicy принимает только известные значения", () => {
    expect(parsePlaybookOverride("vk", JSON.stringify({ ctaPolicy: "discouraged" })).contract.ctaPolicy)
      .toBe("discouraged");
    expect(parsePlaybookOverride("vk", JSON.stringify({ ctaPolicy: "сомнительно" })).overridden)
      .toEqual([]);
  });
});

/**
 * B705 — граница между «вернуть автору» и «отдать редактору».
 *
 * Регрессия, найденная тестом B700 при первой сборке: контрактные замечания
 * были положены в `violations`, а там любое замечание ОТМЕНЯЕТ раунд редактора
 * и возвращает материал автору. Написанное переставало ложиться на склад, и
 * следующий проход оплачивал автора второй раз — ровно та трата, против
 * которой заведён B700.
 */
describe("B705 — контрактное замечание не отменяет раунд редактора", () => {
  const draft = {
    title: "Вернётся ли бывший",
    text: "Он прочитал и не ответил.\n\nЭто факт. Всё остальное — ваша достройка: "
      + "что он занят, что он обиделся, что он с кем-то. Ни одного из этих слов "
      + "в его молчании нет.\n\nПопробуйте выписать отдельно, что вы ЗНАЕТЕ, и "
      + "отдельно — что вы предполагаете. Обычно во втором столбце оказывается "
      + "всё, из-за чего не спится третью ночь подряд.\n\n"
      + "Это не про то, чтобы перестать переживать. Это про то, чтобы точно "
      + "знать, из-за чего именно вы переживаете: из-за его молчания или из-за "
      + "той истории, которую вы за это молчание досочинили за трое суток.",
    audienceNeed: "n",
    goal: "g",
    disclosure: "",
    cta: "Разберите свою ситуацию по шагам",
    mediaBrief: "Тёмный экран телефона на подоконнике, одна непрочитанная строка",
    researchUsed: [],
    safetyFlags: [] as string[],
  };

  it("длинное тире ловится, но материал остаётся оценимым", () => {
    const defects = inspectDraft({ platform: "telegram", ...draft });
    // Тире в тексте есть — замечание обязано быть.
    expect(defectRules(defects)).toContain("em-dash-present");
    // И это НЕ повод не звать редактора: текст в пределах площадки.
    expect(defectRules(defects)).not.toContain("length-over");
    expect(defectRules(defects)).not.toContain("length-under");
  });

  it("Дзен не считает длинное тире дефектом — у него своя автотипографика", () => {
    const long = { ...draft, text: `${draft.text}\n\n${"а".repeat(2_200)}` };
    expect(defectRules(inspectDraft({ platform: "dzen", ...long })))
      .not.toContain("em-dash-present");
  });

  it("незнакомая площадка не изобретает себе ограничений", () => {
    // Совпадает с правилом B640: строгий запасной контракт — это отказ вниз,
    // при котором новая площадка молча перестаёт публиковаться.
    expect(inspectDraft({ platform: "mastodon", title: "т", text: "я".repeat(9_000) }))
      .toEqual([]);
  });
});
