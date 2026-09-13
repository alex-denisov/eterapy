/**
 * B743 — «повторяющиеся, одинаковые и однотипные» это три разные болезни.
 *
 * Владелец 2026-09-13 про Дзен: «много статей повторяющихся, одинаковых и
 * однотипных, это мне очень не нравится». Контур лечил только первую —
 * повтор ТЕМЫ (B686/B718). Две оставшиеся прогон и сторожит.
 */

import {
  MAX_MATERIAL_OVERLAP,
  MAX_SAME_SHAPE_IN_ROW,
  materialShape,
  samenessFindings,
  shapeDigest,
  shapeFingerprint,
} from "@/lib/marketing/sameness";

/** Абзацы с настоящей вариативностью: шаблон со сменой числа — это вода. */
function paragraphs(seed: number, count: number): string[] {
  const words = [
    "молчание", "граница", "решение", "разговор", "усталость", "привычка",
    "сомнение", "надежда", "выбор", "тревога", "опора", "признак",
    "причина", "поступок", "обещание", "дистанция", "близость", "внимание",
    "терпение", "ясность", "ошибка", "шаг", "память", "порядок",
  ];
  let state = (Math.imul(seed, 2654435761) ^ 0x9e3779b9) >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  return Array.from({ length: count }, () =>
    Array.from({ length: 14 }, () => words[next() % words.length]).join(" ") + ".");
}

const ARTICLE = paragraphs(1, 6).join("\n\n");

describe("B743 — одинаковость: тот же текст под другой темой", () => {
  it("дословный кусок недавнего материала ловится", () => {
    const findings = samenessFindings({
      text: ARTICLE,
      recent: [{ title: "Прошлая статья", text: ARTICLE }],
    });
    expect(findings.some((finding) => finding.rule === "sameness-overlap")).toBe(true);
  });

  it("самостоятельный текст на ту же тему проходит", () => {
    const findings = samenessFindings({
      text: paragraphs(42, 6).join("\n\n"),
      recent: [{ title: "Прошлая статья", text: ARTICLE }],
    });
    expect(findings.some((finding) => finding.rule === "sameness-overlap")).toBe(false);
  });

  it("порог мягче библиотечного: у поста есть обязательные общие куски", () => {
    // Призыв, подпись, название продукта совпадают законно — требовать от них
    // непохожести значило бы браковать материал за собственный бренд.
    expect(MAX_MATERIAL_OVERLAP).toBeGreaterThan(0.2);
    expect(MAX_MATERIAL_OVERLAP).toBeLessThan(0.5);
  });

  it("сравнивать не с чем — мера молчит, а не придирается", () => {
    expect(samenessFindings({ text: ARTICLE, recent: [] })).toEqual([]);
  });
});

describe("B743 — однотипность: другие слова, та же форма", () => {
  const asking = (seed: number) => [
    "А вы замечали это за собой?",
    ...paragraphs(seed, 4),
    "Что из этого про вас?",
  ].join("\n\n");

  it("третий подряд материал одной формы получает замечание", () => {
    const findings = samenessFindings({
      text: asking(7),
      recent: [
        { title: "Первая", text: asking(11) },
        { title: "Вторая", text: asking(12) },
      ],
    });
    const shape = findings.find((finding) => finding.rule === "sameness-shape");
    expect(shape).toBeDefined();
    // Замечание обязано говорить, ЧТО менять, иначе автор поменяет слова.
    expect(shape!.brief).toContain("Смени ФОРМУ");
  });

  it("два подряд — ещё совпадение, а не шаблон", () => {
    expect(MAX_SAME_SHAPE_IN_ROW).toBe(2);
    const findings = samenessFindings({
      text: asking(7),
      recent: [{ title: "Первая", text: asking(11) }],
    });
    expect(findings.some((finding) => finding.rule === "sameness-shape")).toBe(false);
  });

  it("смена формы снимает замечание, даже если тема прежняя", () => {
    const differentShape = [
      "Клиентка пришла с одной фразой.",
      ...paragraphs(7, 9),
      "Вывод простой и неприятный.",
    ].join("\n\n");
    const findings = samenessFindings({
      text: differentShape,
      recent: [
        { title: "Первая", text: asking(11) },
        { title: "Вторая", text: asking(12) },
      ],
    });
    expect(findings.some((finding) => finding.rule === "sameness-shape")).toBe(false);
  });

  it("заход в отпечаток формы не входит: смена первого слова не делает форму новой", () => {
    const one = ["Первый заход сюда.", ...paragraphs(3, 4), "И что теперь?"].join("\n\n");
    const two = ["Совсем другое начало текста.", ...paragraphs(4, 4), "И что теперь?"].join("\n\n");
    expect(shapeFingerprint(materialShape(one))).toBe(shapeFingerprint(materialShape(two)));
  });

  it("разный объём — разная форма: три абзаца и девять не одно и то же", () => {
    const short = paragraphs(5, 3).join("\n\n");
    const long = paragraphs(6, 9).join("\n\n");
    expect(shapeFingerprint(materialShape(short))).not.toBe(shapeFingerprint(materialShape(long)));
  });
});

describe("B743 — автору показывают форму, а не сто символов", () => {
  /**
   * Промт требовал «не повторяй ни хук, ни композицию, ни метафору», а в
   * данных ехало сто символов — первое предложение статьи Дзена. Композиции в
   * ста символах не видно: автора просили не повторять то, чего не показали.
   */
  it("описание формы отвечает на вопрос «как этот материал устроен»", () => {
    const digest = shapeDigest(ARTICLE);
    expect(digest.paragraphs).toBe(6);
    expect(digest.outline.length).toBeGreaterThan(1);
    expect(digest.opening.length).toBeGreaterThan(0);
  });

  it("размер описания ограничен сверху и не растёт вместе со статьёй", () => {
    /**
     * ⚠ ПРОВЕРЯЕТСЯ АБСОЛЮТНАЯ ГРАНИЦА, А НЕ «МЕНЬШЕ ИСХОДНИКА». Первая
     * редакция прогона сравнивала описание с длиной текста и падала на
     * короткой фикстуре — и была права: у поста в шесть коротких абзацев
     * описание почти равно самому посту. Дорого не это, а пять СТАТЕЙ ДЗЕНА в
     * промте каждого раунда. Значит и мерить надо потолок: описание обязано
     * быть ограничено сверху независимо от того, насколько длинна статья.
     */
    const long = paragraphs(9, 40).join("\n\n");
    expect(long.length).toBeGreaterThan(4_000);
    const digest = shapeDigest(long);
    expect(JSON.stringify(digest).length).toBeLessThan(1_000);
    // Пять таких описаний дешевле одной статьи — ровно ради этого они и есть.
    expect(JSON.stringify(digest).length * 5).toBeLessThan(long.length);
  });

  it("пустое тело не ломает описание", () => {
    expect(shapeDigest("")).toEqual({
      opening: "",
      paragraphs: 0,
      endsWithQuestion: false,
      outline: [],
    });
  });
});

describe("B743 — замечание, а не приговор", () => {
  it("однотипность едет замечанием контракта: материал правят, а не выбрасывают", () => {
    // Цена жёсткого гейта измерена: 27 смертей за две недели (B713), когда
    // круги редактуры кончались раньше, чем текст доходил до выпуска.
    for (const finding of samenessFindings({
      text: ARTICLE,
      recent: [{ title: "Прошлая", text: ARTICLE }],
    })) {
      expect(finding.kind).toBe("contract");
      expect(finding.brief.length).toBeGreaterThan(30);
    }
  });
});
