/**
 * B740 — прогон SEO-агента: сбор спроса, отсев, гейт страницы, перевод строки
 * базы в запись корпуса.
 *
 * Всё, что здесь проверяется, — чистые функции. Живой Wordstat, живой Trends и
 * живая база в прогоне не участвуют намеренно: их отказ должен ломать заход
 * агента, а не прогон, который сторожит правила.
 */

import {
  DEMAND_MIN_WORDS,
  normalizePhrase,
  rejectReasonFor,
} from "@/lib/seo/demand/harvest";
import {
  parseTopRequests,
  seedWindow,
  WORDSTAT_HARVEST_MAX_DEMAND,
  WORDSTAT_HARVEST_MIN_DEMAND,
} from "@/lib/seo/demand/wordstat-harvest";
import {
  parseRisingQueries,
  parseTrendsBody,
  pickRelatedQueriesWidget,
  trendsSeedWindow,
} from "@/lib/seo/demand/google-trends";
import {
  blockingViolations,
  containsQuery,
  countExactOccurrences,
  inspectSeoPageDraft,
  ownWordCount,
  type SeoPageDraft,
} from "@/lib/seo/page-gate";
import {
  ctaProductForService,
  seoPageToLibraryEntry,
  topicForService,
} from "@/lib/seo/library-store";
import { libraryDepth } from "@/lib/library-depth";
import { LIBRARY_MIN_OWN_WORDS } from "@/lib/library-depth";

const NO_COVERAGE = new Set<string>();

function draftWithWords(words: number): SeoPageDraft {
  const filler = Array.from({ length: words }, (_, index) => `слово${index}`).join(" ");
  return {
    question: `Почему он не пишет первым и что с этим делать?`,
    metaTitle: "Почему он не пишет первым: разбор",
    metaDescription:
      "Почему он не пишет первым — разбираем, что стоит за молчанием, какие версии проверить и какой шаг сделать, чтобы не додумывать за другого человека.",
    summary: `Почему он не пишет первым — вопрос чаще про ожидания, чем про него. ${filler}`,
    body: [
      { heading: "Что происходит", paragraphs: ["Первый абзац разбора."] },
      { heading: "Что проверить", paragraphs: ["Второй абзац разбора."] },
      { heading: "Что дальше", paragraphs: ["Третий абзац разбора."] },
    ],
    mainForkTitle: "Вы ищете объяснение или разрешение идти дальше?",
    mainForkNote: "Это разные вопросы, и ответы у них разные.",
    perspectives: ["Опишите последние три ситуации", "Отметьте момент напряжения"],
    faqs: [
      { question: "Стоит ли писать первой?", answer: "Одно спокойное сообщение честнее тишины." },
      { question: "Сколько ждать?", answer: "Столько, сколько вам самим выносимо." },
    ],
    firstStep: "Сформулируйте одну фразу, которую хотите сказать.",
  };
}

describe("B740 — отсев спроса делается до вызова модели", () => {
  it("нормализация схлопывает регистр, кавычки и пробелы", () => {
    expect(normalizePhrase('  «Почему   ОН  не пишет» ')).toBe("почему он не пишет");
  });

  it("односложная фраза — это тема, а не запрос", () => {
    const reason = rejectReasonFor({
      phrase: "таро",
      monthlyDemand: 5_000,
      source: "wordstat",
      coveredPhrases: NO_COVERAGE,
    });
    expect(reason).toContain("короткая");
    expect(DEMAND_MIN_WORDS).toBeGreaterThan(1);
  });

  it("фраза вне сферы платформы отсекается стоп-словом", () => {
    expect(rejectReasonFor({
      phrase: "скачать таро бесплатно",
      monthlyDemand: 5_000,
      source: "wordstat",
      coveredPhrases: NO_COVERAGE,
    })).toContain("вне сферы");
  });

  it("головной запрос не берётся: его закрывает посадочная услуги", () => {
    expect(rejectReasonFor({
      phrase: "почему он не пишет первым",
      monthlyDemand: WORDSTAT_HARVEST_MAX_DEMAND + 1,
      source: "wordstat",
      coveredPhrases: NO_COVERAGE,
    })).toContain("Головной запрос".toLowerCase().slice(0, 7));
  });

  it("низкая частотность не окупает страницу", () => {
    expect(rejectReasonFor({
      phrase: "почему он не пишет первым",
      monthlyDemand: WORDSTAT_HARVEST_MIN_DEMAND - 1,
      source: "wordstat",
      coveredPhrases: NO_COVERAGE,
    })).toContain("ниже порога");
  });

  it("растущий запрос без измеренной частотности НЕ отбраковывается за молчание источника", () => {
    expect(rejectReasonFor({
      phrase: "он перестал писать после ссоры",
      monthlyDemand: null,
      source: "google-trends",
      coveredPhrases: NO_COVERAGE,
    })).toBeNull();
  });

  it("уже закрытый корпусом запрос не пишется второй раз", () => {
    const covered = new Set(["почему он не пишет первым"]);
    expect(rejectReasonFor({
      phrase: "Почему он не пишет первым",
      monthlyDemand: 4_000,
      source: "wordstat",
      coveredPhrases: covered,
    })).toContain("уже закрыт");
  });
});

describe("B740 — разбор ответов источников спроса", () => {
  it("wordstat: `count` приходит строкой и не теряется", () => {
    const rows = parseTopRequests({ results: [{ phrase: "он не пишет", count: "1200" }] });
    expect(rows).toEqual([{ phrase: "он не пишет", count: 1200 }]);
  });

  it("wordstat: второе имя массива в ответе тоже разбирается", () => {
    expect(parseTopRequests({ topRequests: [{ phrase: "а", count: 5 }] })).toHaveLength(1);
  });

  it("trends: антиJSONP-префикс срезается", () => {
    expect(parseTrendsBody(")]}',\n{\"widgets\":[]}")).toEqual({ widgets: [] });
  });

  it("trends: берётся именно виджет запросов, а не тем", () => {
    const widget = pickRelatedQueriesWidget({
      widgets: [
        { id: "RELATED_TOPICS", token: "t1", request: { a: 1 } },
        { id: "RELATED_QUERIES", token: "t2", request: { b: 2 } },
      ],
    });
    expect(widget).toEqual({ token: "t2", request: { b: 2 } });
  });

  it("trends: берётся список растущих, а не список популярных", () => {
    const rising = parseRisingQueries({
      default: {
        rankedList: [
          { rankedKeyword: [{ query: "популярное", value: 100 }] },
          { rankedKeyword: [{ query: "растущее", value: 250 }] },
        ],
      },
    });
    expect(rising).toEqual([{ query: "растущее", value: 250 }]);
  });

  it("окна источников сдвинуты: два источника не спрашивают про одно и то же", () => {
    const now = new Date("2026-09-12T09:00:00Z");
    const wordstat = seedWindow(now).map((item) => item.seed);
    const trends = trendsSeedWindow(now).map((item) => item.seed);
    expect(trends.some((seed) => wordstat.includes(seed))).toBe(false);
  });

  it("окно Wordstat едет по кластерам, а не стоит на месте", () => {
    const first = seedWindow(new Date("2026-09-12T00:00:00Z")).map((item) => item.seed);
    const later = seedWindow(new Date("2026-09-12T06:00:00Z")).map((item) => item.seed);
    expect(later).not.toEqual(first);
  });
});

describe("B740 — гейт страницы ловит то, что можно посчитать", () => {
  it("страница ниже рубежа индексируемости не выпускается", () => {
    const violations = inspectSeoPageDraft({
      draft: draftWithWords(20),
      targetQuery: "почему он не пишет первым",
    });
    const blocking = blockingViolations(violations);
    expect(blocking.some((item) => item.message.includes(String(LIBRARY_MIN_OWN_WORDS)))).toBe(true);
  });

  it("материал нормального объёма гейт пропускает", () => {
    const draft = draftWithWords(500);
    expect(ownWordCount(draft)).toBeGreaterThanOrEqual(LIBRARY_MIN_OWN_WORDS);
    expect(blockingViolations(inspectSeoPageDraft({
      draft,
      targetQuery: "почему он не пишет первым",
    }))).toEqual([]);
  });

  it("дословный повтор запроса сверх потолка — это переспам, и он блокирует выпуск", () => {
    const draft = draftWithWords(500);
    const query = "почему он не пишет первым";
    draft.body[0].paragraphs = [Array.from({ length: 9 }, () => query).join(". ")];
    const blocking = blockingViolations(inspectSeoPageDraft({ draft, targetQuery: query }));
    expect(blocking.some((item) => item.message.includes("переспам"))).toBe(true);
  });

  it("запрос засчитывается по словоформам, а не по дословной вставке", () => {
    expect(containsQuery("Он давно не пишет мне первым", "почему он не пишет первым")).toBe(true);
    expect(containsQuery("Как выбрать колоду Таро", "почему он не пишет первым")).toBe(false);
  });

  it("markdown-разметка в теле блокирует выпуск: в шаблон она уедет звёздочками", () => {
    const draft = draftWithWords(500);
    draft.body[0].paragraphs = ["**жирный** текст"];
    expect(blockingViolations(inspectSeoPageDraft({
      draft,
      targetQuery: "почему он не пишет первым",
    })).some((item) => item.message.includes("markdown"))).toBe(true);
  });

  it("счётчик дословных вхождений не считает пересекающиеся", () => {
    expect(countExactOccurrences("аба аба аба", "аба")).toBe(3);
  });
});

describe("B740 — услуга страницы назначается кластером, а не моделью", () => {
  it("каждая услуга ядра ведёт в существующую карточку CTA", () => {
    for (const service of ["chat-analysis", "tarot", "horoscope", "human-design", "family-questions"]) {
      expect(ctaProductForService(service)).toBeTruthy();
      expect(topicForService(service)).toBeTruthy();
    }
  });

  it("неизвестная услуга не роняет выпуск, а получает разумный запас", () => {
    expect(ctaProductForService("неизвестно")).toBe("Подробный разбор");
  });
});

describe("B740 — строка базы становится записью корпуса", () => {
  const row = {
    slug: "pochemu-on-ne-pishet-pervym",
    topic: "Отношения",
    question: "Почему он не пишет первым?",
    summary: "Короткий ответ.",
    metaTitle: "Почему он не пишет первым",
    metaDescription: "Описание для выдачи.",
    body: [{ heading: "Разбор", paragraphs: ["Абзац."] }],
    perspectives: ["Проверьте одно", "Проверьте другое"],
    faqs: [{ question: "В?", answer: "О." }],
    mainForkTitle: "Что различить",
    mainForkNote: "Пояснение",
    firstStep: "Шаг",
    ctaProduct: "Разбор переписки",
    publishedAt: new Date("2026-09-12T10:00:00Z"),
    updatedAt: new Date("2026-09-12T10:00:00Z"),
  };

  it("дата проверки — дата выпуска, а не общая дата корпуса", () => {
    expect(seoPageToLibraryEntry(row).reviewedAt).toBe("2026-09-12");
  });

  it("счётчик откликов равен нулю: выдуманное число было бы враньём", () => {
    expect(seoPageToLibraryEntry(row).reactions).toBe(0);
  });

  it("тонкая страница агента не попадает в индекс так же, как тонкая карточка корпуса", () => {
    // Гейт глубины общий для обоих источников — исключений агенту не делается.
    expect(libraryDepth(seoPageToLibraryEntry(row)).indexable).toBe(false);
  });

  it("неизвестная тема не роняет рендер", () => {
    expect(seoPageToLibraryEntry({ ...row, topic: "Марсианская" }).topic).toBe("Выбор и решения");
  });
});
