import { describe, expect, it } from "@jest/globals";
import {
  NICHE_TARGET_SHARE,
  areaTierWeight,
  nicheFindings,
  nicheShare,
} from "@/lib/marketing/threads-niche";

describe("B771 тематический якорь Threads", () => {
  it("пост без нашей темы получает замечание", () => {
    const rules = nicheFindings("Лиза три дня вычисляла, с кем её бывший зависает в баре.").map((f) => f.rule);
    expect(rules).toEqual(["threads-off-niche"]);
  });

  it("слова нашей темы проходят: таро, знаки, Луна, ретроград, нумерология", () => {
    for (const text of [
      "Расклад таро показал бывшего. Кот не удивился.",
      "Раки, в среду Луна уйдёт в Деву, а вы всё ещё пишете ему.",
      "Ретроград Меркурия — удобная причина не отвечать.",
      "Число судьбы 7 — это про тех, кто перечитывает переписку.",
      "Гороскоп от банка: ваш поток на неделю",
    ]) expect(nicheFindings(text)).toEqual([]);
  });

  it("границы слов: «лев» внутри чужого слова темой не считается", () => {
    expect(nicheFindings("Сосед левой рукой выбросил пакет")).not.toEqual([]);
  });

  it("падежи знаков и гадание", () => {
    for (const text of ["Овнов не переспорить", "Раков тянет к бывшим", "Весов спросили про ужин", "С Девой не спорят", "Это гадание, а не план"]) {
      expect(nicheFindings(text)).toEqual([]);
    }
  });

  it("пустой текст — без замечаний", () => {
    expect(nicheFindings("  ")).toEqual([]);
  });

  it("доля темы по ленте", () => {
    expect(nicheShare(["расклад таро", "бывший написал", "Луна в Раке", "соседи шумят"])).toBe(0.5);
    expect(nicheShare([])).toBeNull();
    expect(NICHE_TARGET_SHARE).toBeGreaterThanOrEqual(0.7);
  });

  it("периферийная область весит меньше ядерной", () => {
    expect(areaTierWeight("транспорт")).toBeLessThan(areaTierWeight("бывший"));
    expect(areaTierWeight("неизвестная новая область")).toBe(1);
  });
});
