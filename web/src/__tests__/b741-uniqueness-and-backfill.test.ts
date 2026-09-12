/**
 * B741 — уникальность текста, дописывание тонких карточек и потолок расхода
 * на Gemini.
 *
 * Три разные вещи в одном файле не по лени: все три появились из одного
 * решения владельца 2026-09-12 и все три отвечают на один вопрос — «почему за
 * всё время нет роста в SEO». Корпус тонкий, новые страницы рискуют повторять
 * старые, а голова пула стала платной.
 */

import { AIProvider } from "@prisma/client";
import {
  MAX_CONTAINMENT,
  buildCorpusIndex,
  checkUniqueness,
  containment,
  selfRepeatRatio,
  shingleSet,
} from "@/lib/seo/uniqueness";
import { mergeBackfill, thinCards } from "@/lib/seo/backfill";
import { libraryDepth, libraryOwnWordCount } from "@/lib/library-depth";
import { approvedLibraryEntries } from "@/data/anonymous-library";
import {
  MARKETING_PAID_ROUTE_CAPS,
  marketingMeteredProviders,
  paidRouteCap,
} from "@/lib/marketing/paid-route-budget";
import {
  MARKETING_REVIEWER_MODEL_PREFERENCES,
  MARKETING_WRITER_MODEL_PREFERENCES,
  marketingModelFreshness,
} from "@/lib/marketing/model-pool";
import { MARKETING_ROLES } from "@/lib/marketing/agent-roles";

/**
 * Текст с настоящей вариативностью, а не «одна фраза с меняющимся числом».
 *
 * ⚠ ПЕРВАЯ ВЕРСИЯ ФИКСТУРЫ ПРОВАЛИВАЛА СОБСТВЕННЫЕ ПРОГОНЫ, И ЭТО БЫЛО ВЕРНО.
 * Она повторяла один и тот же шаблон со сменой номера, и мера самоповтора
 * честно браковала её как воду — то есть гейт работал, а не тест. Настоящий
 * текст так не устроен, поэтому фикстура собирается перестановкой слов из
 * словаря: детерминированно (прогон обязан быть воспроизводим) и без
 * повторяющихся пятисловных последовательностей.
 */
function variedText(seed: number, sentences = 60): string {
  const words = [
    "молчание", "ожидание", "граница", "решение", "разговор", "усталость",
    "привычка", "сомнение", "надежда", "выбор", "тревога", "опора",
    "признак", "причина", "поступок", "обещание", "дистанция", "близость",
    "внимание", "терпение", "спокойствие", "ясность", "ошибка", "шаг",
    "память", "порядок", "интерес", "просьба", "отказ", "согласие",
    "перемена", "ритм", "пауза", "вопрос", "ответ", "письмо",
    "встреча", "уговор", "срок", "повод",
  ];
  /**
   * ⚠ `Math.imul`, А НЕ ОБЫЧНОЕ УМНОЖЕНИЕ. Первая версия считала
   * `state * 1103515245 % 2**32` обычной арифметикой: при state порядка 4·10⁹
   * произведение выходит за 2⁵³, точность теряется, и генератор вырождается —
   * два «независимых» текста давали пересечение 87 %, а прогон выглядел как
   * поломка гейта. Именно поэтому фикстура собирается 32-битной арифметикой.
   */
  let state = (Math.imul(seed, 2654435761) ^ 0x9e3779b9) >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  return Array.from({ length: sentences }, () =>
    Array.from({ length: 9 }, () => words[next() % words.length]).join(" ")).join(". ");
}

const LOREM = variedText(1);

describe("B741 — гейт уникальности", () => {
  it("дословная копия корпуса не проходит", () => {
    const corpus = buildCorpusIndex([{ slug: "old", text: LOREM }]);
    const verdict = checkUniqueness({ text: LOREM, corpus });
    expect(verdict.unique).toBe(false);
    expect(verdict.worstAgainst).toBe("old");
    expect(verdict.worstContainment).toBeGreaterThan(MAX_CONTAINMENT);
  });

  it("самостоятельный текст на ту же тему проходит", () => {
    const corpus = buildCorpusIndex([{ slug: "old", text: LOREM }]);
    const fresh = variedText(77);
    expect(checkUniqueness({ text: fresh, corpus }).unique).toBe(true);
  });

  it("мера несимметрична: короткая копия внутри длинного оригинала ловится", () => {
    // Jaccard здесь дал бы низкое число и пропустил бы заимствование — вопрос
    // у нас «сколько НОВОГО текста уже было», а не «похожи ли два текста».
    const corpus = buildCorpusIndex([{ slug: "long", text: [LOREM, variedText(2), variedText(3)].join(". ") }]);
    const short = LOREM.split(". ").slice(0, 12).join(". ");
    expect(checkUniqueness({ text: short, corpus }).unique).toBe(false);
  });

  it("дописывание не сверяется с той карточкой, которую дописывают", () => {
    const corpus = buildCorpusIndex([{ slug: "self", text: LOREM }]);
    expect(checkUniqueness({ text: LOREM, corpus, excludeSlug: "self" }).unique).toBe(true);
  });

  it("вода внутри страницы ловится отдельной мерой", () => {
    const paragraph = "этот абзац повторяется дословно чтобы добрать объём страницы";
    const watery = Array.from({ length: 12 }, () => paragraph).join(". ");
    expect(selfRepeatRatio(watery)).toBeGreaterThan(0.5);
    expect(checkUniqueness({ text: watery, corpus: [] }).unique).toBe(false);
  });

  it("текст короче одного шингла не выпускается: сравнивать нечего", () => {
    expect(shingleSet("два слова").size).toBe(0);
    expect(checkUniqueness({ text: "два слова", corpus: [] }).unique).toBe(false);
  });

  it("пересечение пустого множества равно нулю, а не делению на ноль", () => {
    expect(containment(new Set(), new Set(["a"]))).toBe(0);
  });
});

describe("B741 — дописывание тонких карточек", () => {
  it("замер корпуса не изменился: материалов заметно меньше, чем карточек", () => {
    const all = approvedLibraryEntries();
    const deep = all.filter((entry) => libraryDepth(entry).indexable);
    // Ровно это число и есть ответ на «почему нет роста»: ранжировать нечего.
    expect(deep.length).toBeLessThan(all.length / 2);
    expect(thinCards().length).toBe(all.length - deep.length);
  });

  it("очередь дописывания идёт по интересу, а не по объёму", () => {
    const queue = thinCards();
    for (let index = 1; index < queue.length; index += 1) {
      expect(queue[index - 1].entry.reactions).toBeGreaterThanOrEqual(queue[index].entry.reactions);
    }
  });

  it("дописывание добавляет глубину, не трогая вопрос и услугу", () => {
    const card = thinCards()[0];
    const before = libraryOwnWordCount(card.entry);
    const merged = mergeBackfill(card.entry, {
      body: [{
        heading: "Разбор",
        paragraphs: [LOREM, LOREM.split(". ").slice(0, 40).join(". ")],
      }],
      faqs: [
        { question: "Первый вопрос?", answer: "Первый ответ." },
        { question: "Второй вопрос?", answer: "Второй ответ." },
      ],
      perspectives: ["раз", "два", "три"],
      mainForkTitle: "Что различить",
      mainForkNote: "Пояснение",
      metaTitle: "Заголовок",
      metaDescription: "Описание",
      publishedAt: new Date("2026-09-12T10:00:00Z"),
    });
    expect(merged.question).toBe(card.entry.question);
    expect(merged.topic).toBe(card.entry.topic);
    expect(merged.ctaProduct).toBe(card.entry.ctaProduct);
    expect(merged.reactions).toBe(card.entry.reactions);
    expect(libraryOwnWordCount(merged)).toBeGreaterThan(before);
    // Дата проверки — день дописывания: страница действительно пересматривалась.
    expect(merged.reviewedAt).toBe("2026-09-12");
  });

  it("дописанная карточка начинает проходить гейт глубины", () => {
    const card = thinCards()[0];
    expect(libraryDepth(card.entry).indexable).toBe(false);
    const body = Array.from({ length: 4 }, (_, index) => ({
      heading: `Раздел ${index}`,
      paragraphs: [
        Array.from({ length: 60 }, (_, word) => `слово${index}x${word}`).join(" "),
        Array.from({ length: 60 }, (_, word) => `иное${index}y${word}`).join(" "),
      ],
    }));
    const merged = mergeBackfill(card.entry, {
      body,
      faqs: [
        { question: "Вопрос один?", answer: "Ответ один." },
        { question: "Вопрос два?", answer: "Ответ два." },
      ],
      perspectives: ["раз", "два", "три"],
      mainForkTitle: "Что различить",
      mainForkNote: "Пояснение",
      metaTitle: "Заголовок",
      metaDescription: "Описание",
      publishedAt: new Date(),
    });
    expect(libraryDepth(merged).indexable).toBe(true);
  });
});

describe("B741 — Gemini стал платным и получил потолок", () => {
  it("реестр потолков шире платного хвоста: голова тоже считается", () => {
    const metered = marketingMeteredProviders();
    expect(metered).toContain(AIProvider.GEMINI);
    expect(metered).toContain(AIProvider.OPENAI);
    expect(Object.keys(MARKETING_PAID_ROUTE_CAPS)).toEqual(metered);
  });

  it("суточный потолок назван владельцем, месячный равен бонусному кредиту", () => {
    const cap = paidRouteCap(AIProvider.GEMINI);
    expect(cap?.limit).toBe(1);
    expect(cap?.monthlyLimit).toBe(10);
    // Тридцать суточных потолков дают $30 при кредите $10 — без месячного
    // ограничителя две трети расхода ушли бы с карты, а не с бонуса.
    expect((cap?.limit ?? 0) * 30).toBeGreaterThan(cap?.monthlyLimit ?? 0);
  });

  it("у каждого потолка назван источник цены", () => {
    for (const cap of Object.values(MARKETING_PAID_ROUTE_CAPS)) {
      expect(cap.priceSource.length).toBeGreaterThan(10);
    }
  });

  it("автор и редактор Gemini смотрят в разные модели и обе свежие", () => {
    const writer = MARKETING_WRITER_MODEL_PREFERENCES[AIProvider.GEMINI];
    const reviewer = MARKETING_REVIEWER_MODEL_PREFERENCES[AIProvider.GEMINI];
    expect(writer).toBe("gemini-3.8-flash");
    expect(reviewer).not.toBe(writer);
    expect(marketingModelFreshness(writer!)).not.toBeNull();
    expect(marketingModelFreshness(reviewer!)).not.toBeNull();
  });
});

describe("B741 — редактору разрешена точечная правка", () => {
  /**
   * Прогон сторожит СОГЛАСОВАННОСТЬ двух половин одного промта. Хартия роли
   * приклеивается первым блоком, тело промта идёт следом; пока в первой стояло
   * «переписывать текст за автора нельзя», а во второй «мелкую правку вноси
   * САМ», модель выбирала запрет — `revisedText` заполнялся в 7 раундах из 150.
   */
  it("запрет сузился до переписывания заново, а не любого касания текста", () => {
    const notMine = MARKETING_ROLES.editor.notMine.join(" ");
    expect(notMine).toContain("переписывать материал заново");
    expect(notMine).not.toContain("правки вносит автор");
  });

  it("право на точечную правку объявлено среди решений роли", () => {
    expect(MARKETING_ROLES.editor.decides.join(" ")).toContain("точечную правку");
  });

  it("автор больше не обещает себе второй раунд за опечатку", () => {
    expect(MARKETING_ROLES.writer.handoff).toContain("мелкое он поправит сам");
  });
});
