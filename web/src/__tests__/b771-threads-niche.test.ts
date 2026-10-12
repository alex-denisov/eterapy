import { describe, expect, it } from "@jest/globals";
import {
  NICHE_TARGET_SHARE,
  nichePole,
  suggestPole,
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

  it("психологический полюс тоже держит тему", () => {
    for (const text of [
      "Тревога по воскресеньям — это не лень, а привычка ждать плохого.",
      "Границы — это не стена, а дверь с ручкой с твоей стороны.",
      "Психолог спросил, чего я хочу. Я назвала четыре вещи, которых не хочу.",
      "Ссора из-за посуды — почти никогда про посуду. Самооценка тоже в комнате.",
    ]) expect(nicheFindings(text)).toEqual([]);
  });

  it("жизнь без нашей оптики по-прежнему мимо", () => {
    expect(nicheFindings("Сосед сверху опять сверлит в воскресенье в восемь утра.")).not.toEqual([]);
  });

  it("полюс поста: практики, психология или смесь", () => {
    expect(nichePole("Расклад таро показал бывшего")).toBe("practice");
    expect(nichePole("Границы — это про самооценку, а не про ссору")).toBe("psych");
    expect(nichePole("Луна в Раках и тревога по воскресеньям")).toBe("blend");
    expect(nichePole("Кот уронил кружку")).toBeNull();
  });

  it("следующий пост берёт полюс, которого в ленте меньше", () => {
    const practice = ["расклад таро", "Луна в Деве", "гороскоп на неделю", "ретроград"];
    const psych = ["тревога по воскресеньям", "границы и самооценка", "психолог спросил", "ссора и конфликт"];
    expect(suggestPole(practice)).toBe("psych");
    expect(suggestPole(psych)).toBe("practice");
    expect(suggestPole([])).toBe("blend");
    expect(suggestPole([...practice.slice(0, 2), ...psych.slice(0, 2)])).toBe("blend");
  });

  it("периферийная область весит меньше ядерной", () => {
    expect(areaTierWeight("транспорт")).toBeLessThan(areaTierWeight("бывший"));
    expect(areaTierWeight("неизвестная новая область")).toBe(1);
  });
});
