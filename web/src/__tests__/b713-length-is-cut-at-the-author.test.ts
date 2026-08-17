/**
 * B713 §2 — ДЛИНУ СНИМАЕТ КОД У АВТОРА, А НЕ РЕДАКТОР ЗАМЕЧАНИЕМ.
 *
 * Требование владельца 2026-08-17 дословно: «убедись что лимит по символам
 * будет именно у автора (иначе это снова превратится в бесконечный круг)».
 *
 * ЧТО БЫЛО. Усечение по лимиту площадки стояло за условием `input.finalRound`.
 * На первом и втором раунде материал уходил редактору КАК ЕСТЬ, тот честно
 * писал «Text is 5222 chars, limit is 900», автор получал задание сократить —
 * и не мог, потому что модель не умеет считать символы. Круг повторялся до
 * исчерпания раундов.
 *
 * Замер прода 03.08–17.08: 27 смертей материалов с превышением лимита, включая
 * «Устранено: mediaBrief заполнен. Не устранено: длина текста (5240 символов
 * при лимите 1000)» и «превышение лимита на 48 символов не устранено». Каждая
 * из них стоила круга автора И круга редактора.
 *
 * ЧТО СТАЛО. Усечение выполняется на КАЖДОМ раунде, до того как считаются
 * замечания. Редактор физически не может увидеть текст длиннее лимита, значит
 * не может потратить на него раунд.
 *
 * ⚠ ПОРЯДОК СОХРАНЁН. Призыв по-прежнему чинится ПЕРЕД усечением: он добавляет
 * текст, и мерить длину надо уже вместе с ним — иначе материал уезжает за
 * предел ровно тем, чем его чинили.
 */

import { repairPublishableDraft } from "@/lib/marketing/agent";
import { platformPublishLimits } from "@/lib/marketing/platform-limits";

const LIMIT = platformPublishLimits("telegram").textLimit ?? 1000;

function longDraft() {
  return {
    title: "Заголовок материала",
    // Заведомо длиннее любого лимита: 5000+ символов, как у живого случая.
    text: "Предложение про поиск себя и спокойный разбор ситуации. ".repeat(100),
    audienceNeed: "саморефлексия",
    goal: "полезный отклик",
    disclosure: "",
    cta: "Посмотреть разбор — что человек получит по ссылке",
    mediaBrief: "Перекрёсток в утреннем свете, крупный план указателя",
    researchUsed: [],
    safetyFlags: [] as string[],
  };
}

function repair(finalRound: boolean) {
  return repairPublishableDraft({
    draft: longDraft(),
    platform: "telegram",
    isConversational: false,
    destinationUrl: "https://eterapy.com/library/ne-mogu-nayti-sebya",
    topic: "поиск себя",
    finalRound,
  });
}

describe("B713 — длина снимается у автора на каждом раунде", () => {
  it.each([
    ["первый раунд", false],
    ["последний раунд", true],
  ])("%s: текст уже в пределах лимита площадки", (_name, finalRound) => {
    const result = repair(finalRound as boolean);
    expect(result.draft.text.length).toBeLessThanOrEqual(LIMIT);
  });

  it("редактор не получает замечания о длине НИ на одном раунде", () => {
    for (const finalRound of [false, true]) {
      const result = repair(finalRound);
      expect(result.violations.filter((item) => item.kind === "length")).toHaveLength(0);
    }
  });

  it("починка названа в карточке, а не выполнена молча", () => {
    const result = repair(false);
    const note = result.repairs.find((item) => item.field === "length");
    expect(note).toBeDefined();
    expect(note?.note).toContain("Длину привела в норму система");
  });

  it("обязательная ссылка переживает усечение", () => {
    const result = repair(false);
    expect(result.draft.text).toContain("https://eterapy.com/library/ne-mogu-nayti-sebya");
  });

  it("текст в пределах лимита не трогается вовсе", () => {
    const short = {
      ...longDraft(),
      text: "Короткий материал про поиск себя. https://eterapy.com/library/ne-mogu-nayti-sebya",
    };
    const result = repairPublishableDraft({
      draft: short,
      platform: "telegram",
      isConversational: false,
      destinationUrl: "https://eterapy.com/library/ne-mogu-nayti-sebya",
      topic: "поиск себя",
      finalRound: false,
    });
    expect(result.repairs.find((item) => item.field === "length")).toBeUndefined();
    expect(result.draft.text).toBe(short.text);
  });
});
