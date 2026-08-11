/**
 * B702 фаза 6 — темы из поисковой выдачи.
 *
 * Владелец 2026-08-11: «никто не отбирал у тебя поиск в интернете через
 * поисковик, а не напрямую в ресурсах медиа/площадок». Ходим в Яндекс SearchAPI
 * тем же ключом, что и Wordstat, и берём формулировки, которых ЕЩЁ НЕТ в ядре:
 * то, что в ядре уже есть, спрос и так учитывает.
 *
 * Форма ответа проверена живьём на проде 2026-08-11: `POST /v2/web/search`
 * отдаёт `{ rawData: <XML в base64> }`.
 */

import {
  SERP_TREND_MIN_RESULTS,
  parseSerpTexts,
  serpTrends,
} from "@/lib/marketing/trend-serp";

function xml(...titles: string[]): string {
  const body = titles
    .map((title, index) => `<doc><domain>site${index}.ru</domain><title>${title}</title><passages><passage>Подробный разбор темы.</passage></passages></doc>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><yandexsearch><response><results><grouping>${body}</grouping></results></response></yandexsearch>`;
}

/** Результат магазина: домен маркетплейса. */
function shopDoc(title: string): string {
  return `<doc><domain>www.wildberries.ru</domain><title>${title}</title><passages><passage>Бесплатная доставка по низкой цене.</passage></passages></doc>`;
}

function respond(rawXml: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ rawData: Buffer.from(rawXml, "utf8").toString("base64") }),
  } as unknown as Response;
}

describe("B702 фаза 6 — темы из поисковой выдачи", () => {
  it("снимает разметку подсветки и достаёт тексты", () => {
    const texts = parseSerpTexts(xml("Как читать <hlword>матрицу</hlword> судьбы"));
    expect(texts[0]).toContain("матрицу судьбы");
    expect(texts.join(" ")).not.toMatch(/[<>]/);
  });

  it("частая формулировка выдачи становится кандидатом", async () => {
    const fetchImpl = jest.fn(async () => respond(xml(
      "Финансовый код рождения: как считать",
      "Финансовый код рождения по дате",
      "Разбор: финансовый код рождения и деньги",
    )));

    const trends = await serpTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["матрица судьбы"],
      apiKey: "ключ",
      folderId: "папка",
      corePhrases: ["матрица судьбы"],
      useCache: false,
    });

    // Проверяем ПОПАДАНИЕ в кандидаты, а не первое место: порядок задаёт число
    // результатов, и общая для всех врезка законно делит первое место.
    expect(trends.some((item) => item.topic.includes("финансовый код"))).toBe(true);
    expect(trends.every((item) => item.source === "searchSuggestions")).toBe(true);
  });

  it("формулировка, которая уже есть в ядре, трендом не считается", async () => {
    const fetchImpl = jest.fn(async () => respond(xml(
      "Матрица судьбы по дате рождения",
      "Матрица судьбы по дате рождения: расчёт",
      "Матрица судьбы по дате рождения онлайн",
    )));

    const trends = await serpTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["матрица судьбы"],
      apiKey: "ключ",
      folderId: "папка",
      corePhrases: ["матрица судьбы по дате рождения"],
      useCache: false,
    });

    expect(trends.some((item) => item.topic.includes("матрица судьбы"))).toBe(false);
  });

  it("одиночное совпадение трендом не считается", async () => {
    expect(SERP_TREND_MIN_RESULTS).toBeGreaterThan(1);
    const fetchImpl = jest.fn(async () => respond(xml(
      "Уникальная формулировка встречается однажды",
      "Совсем другой заголовок",
      "И третий про другое",
    )));

    const trends = await serpTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["тема"],
      apiKey: "ключ",
      folderId: "папка",
      corePhrases: [],
      useCache: false,
    });

    expect(trends.some((item) => item.topic.includes("уникальная"))).toBe(false);
  });

  it("выдача магазинов темой не становится", async () => {
    // Живой прогон на проде 2026-08-11 по запросу «таро» дал «бесплатная
    // доставка», «интернет магазине», «магазине wildberries», «низкой цене»:
    // маркетплейсы продают колоды, и их лексика повторяется в каждом
    // результате. Товарная выдача — не тема для материала.
    const rawXml = `<?xml version="1.0"?><yandexsearch><response><results><grouping>${[
      shopDoc("Таро купить в интернет магазине"),
      shopDoc("Карты таро по низкой цене"),
      shopDoc("Таро с бесплатной доставкой"),
    ].join("")}</grouping></results></response></yandexsearch>`;
    const fetchImpl = jest.fn(async () => respond(rawXml));

    const trends = await serpTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["таро"],
      apiKey: "ключ",
      folderId: "папка",
      corePhrases: [],
      useCache: false,
    });

    expect(trends).toEqual([]);
  });

  it("без ключа в сеть не ходит", async () => {
    const fetchImpl = jest.fn();
    await expect(serpTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["тема"],
      apiKey: "",
      folderId: "",
      useCache: false,
    })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("отказ по одной фразе не отменяет остальные", async () => {
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: { queryText?: string } };
      if (body.query?.queryText === "падает") throw new Error("сеть");
      return respond(xml(
        "Детская травма взрослого человека",
        "Детская травма взрослого: что делать",
        "Про детская травма взрослого и границы",
      ));
    });

    const trends = await serpTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["падает", "живая"],
      apiKey: "ключ",
      folderId: "папка",
      corePhrases: [],
      useCache: false,
    });

    expect(trends.length).toBeGreaterThan(0);
  });
});
