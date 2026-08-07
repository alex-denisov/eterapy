/**
 * B649 / B650 / B651 / B652 — панель маркетинга обязана показывать то, что
 * обещает подписью.
 *
 * Все четыре претензии владельца от 2026-08-04 сводились к одному классу
 * ошибки: интерфейс утверждал больше, чем знал. Фильтр стоял, но до Вебмастера
 * не доходил; CTR печатался в другой шкале, чем считался; прочерк у позиции
 * означал «не умеем посмотреть», а читался как «позиции нет»; рабочий канал
 * Дзена числился ненастроенным из-за необязательных полей.
 */

import fs from "node:fs";
import path from "node:path";
import { buildQueryFamilyMatcher, matchQueryFamily, parseWebmasterQueries, parseWebmasterWindow } from "@/lib/search-marketing-parsers";
import { MARKETING_PLATFORM_FIELDS } from "@/lib/marketing/platform-settings";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), "src", relativePath), "utf8");

describe("B649 — период и шкала CTR", () => {
  it("период доезжает до Вебмастера", () => {
    const data = source("lib/search-marketing-data.ts");
    expect(data).toContain("getWebmaster(period)");
    expect(data).toContain("date_from: period.startInput");
    expect(data).toContain("date_to: period.endInput");
  });

  it("показывает окно, которое вернул Яндекс, а не запрошенное", () => {
    // Выгрузка отстаёт на пару суток: запрос по 2026-08-04 приходит с данными
    // по 2026-08-01. Без этого «фильтр не работает» и «данные не доехали»
    // выглядят одинаково.
    expect(parseWebmasterWindow({ date_from: "2026-07-05", date_to: "2026-08-01" }))
      .toEqual({ from: "2026-07-05", to: "2026-08-01" });
    expect(parseWebmasterWindow({})).toBeNull();
  });

  it("суточные срезы рисуются графиком, а не только таблицей", () => {
    const page = source("app/admin/marketing/page.tsx");
    expect(page).toContain("<VerticalBarChart");
    // B697: подпись говорит «ЗА сутки», а не «по дням» — раньше в столбце лежал
    // итог за 28 суток, и «по дням» было неправдой.
    expect(page).toContain("Показы, клики и визиты ЗА сутки");
    // График читается слева направо по времени, таблица — сверху от свежего.
    expect(page).toContain("left.dayKey.localeCompare(right.dayKey)");
    // Средняя позиция на общей оси с показами читалась бы наоборот: у неё
    // меньше = лучше. Сознательно не рисуем.
    expect(page).not.toContain("value: row.averagePosition");
  });

  it("CTR печатается ровно один раз, а не умножается вторично", () => {
    const table = source("app/admin/marketing/observed-queries-table.tsx");
    // Форматтер умножал уже посчитанные проценты ещё на 100 — так честные
    // 200 % превращались в 20 000 %. Проверяем объявление, а не файл целиком:
    // в комментарии рядом эта строка обязана остаться, она объясняет причину.
    const declaration = table.match(/const percentFormat = new Intl\.NumberFormat\([^)]*\)/)?.[0] ?? "";
    expect(declaration).not.toBe("");
    expect(declaration).not.toContain("style:");
    expect(table).toContain("ctrPercent");

    // Живая строка прода: один показ, два клика. CTR у Яндекса действительно
    // бывает больше 100 % — клики и показы попадают в окно по-разному, — но
    // 200 это данные площадки, а 20 000 были нашей арифметикой.
    const [row] = parseWebmasterQueries({
      queries: [{
        query_text: "ии психолог онлайн бесплатно без регистрации",
        indicators: { TOTAL_SHOWS: 1, TOTAL_CLICKS: 2, AVG_SHOW_POSITION: 3 },
      }],
    });
    expect(row.ctr).toBe(200);
  });
});

describe("B651 — ядро встречается с наблюдаемыми запросами", () => {
  const queries = parseWebmasterQueries({
    queries: [
      { query_text: "расклад таро онлайн бесплатно", indicators: { TOTAL_SHOWS: 10, TOTAL_CLICKS: 1, AVG_SHOW_POSITION: 12 } },
      { query_text: "таро", indicators: { TOTAL_SHOWS: 3, TOTAL_CLICKS: 0, AVG_SHOW_POSITION: 40 } },
      { query_text: "рассчитать матрицу судьбы по дате рождения", indicators: { TOTAL_SHOWS: 7, TOTAL_CLICKS: 2, AVG_SHOW_POSITION: 8 } },
      { query_text: "к чему снится дом", indicators: { TOTAL_SHOWS: 5, TOTAL_CLICKS: 0, AVG_SHOW_POSITION: 30 } },
    ],
  });

  it("головная фраза собирает семью живых запросов", () => {
    const family = matchQueryFamily("таро", queries);
    expect(family.map((item) => item.query)).toEqual([
      "расклад таро онлайн бесплатно",
      "таро",
    ]);
  });

  it("сводит словоформы: «матрица судьбы» ловит «матрицу судьбы»", () => {
    // Границы слов регулярками здесь не берутся вовсе: `\b` в JS не видит
    // кириллицу, и паттерн молча не совпал бы ни разу.
    const family = matchQueryFamily("матрица судьбы", queries);
    expect(family).toHaveLength(1);
    expect(family[0].impressions).toBe(7);
  });

  it("не подтягивает чужие запросы по короткому совпадению", () => {
    expect(matchQueryFamily("сон", queries)).toHaveLength(0);
    expect(matchQueryFamily("натальная карта", queries)).toHaveLength(0);
  });

  it("сшивка ядра с запросами не квадратична по токенизации", () => {
    // Ядро — 1750 фраз, Вебмастер отдаёт до 500 запросов. Разбор строки запроса
    // внутри цикла по фразам стоил бы 875 000 токенизаций на один рендер
    // страницы: сегодня незаметно (запросов 23), на полной выдаче — секунды.
    const data = source("lib/search-marketing-data.ts");
    expect(data).toContain("buildQueryFamilyMatcher(webmasterValue.data.queries)");
    expect(data).not.toContain("matchQueryFamily(keyword.phrase");

    const many = Array.from({ length: 500 }, (_, index) => ({
      query: `расклад таро онлайн бесплатно вариант ${index}`,
      impressions: 1,
      clicks: 0,
      ctr: 0,
      averagePosition: 10,
      opportunity: "Быстрый рост" as const,
    }));
    const match = buildQueryFamilyMatcher(many);
    const started = Date.now();
    for (let index = 0; index < 1750; index += 1) match("таро");
    expect(Date.now() - started).toBeLessThan(4000);
    expect(match("таро")).toHaveLength(500);
  });

  it("в строке ядра видно, по скольким запросам считалась позиция", () => {
    const table = source("app/admin/marketing/semantic-core-table.tsx");
    expect(table).toContain("matchedQueries");
    expect(table).toContain("exactPosition");
    expect(table).toContain("нет показов");
  });
});

describe("B650 — пустой блок обязан назвать причину", () => {
  it("«Поисковые системы» без данных объясняет, чей это ответ", () => {
    const page = source("app/admin/marketing/page.tsx");
    expect(page).toContain("data.metrika.searchEngines.length === 0");
    expect(page).toContain("не увидела ни одного перехода из поиска");
  });
});

describe("B652 — обязательность поля площадки", () => {
  const requirementOf = (key: string) => {
    const field = MARKETING_PLATFORM_FIELDS.find((item) => item.key === key);
    if (!field) throw new Error(`нет поля ${key}`);
    return "requirement" in field ? field.requirement : "required";
  };

  it("адрес канала и браузерный сервис Дзена обязательны, признаки ленты — нет", () => {
    // Именно из-за отметок ленты рабочий канал показывался как «не задано: 2».
    // B698: слепок сессии заменён адресом сервиса и маркером — они обязательны,
    // потому что без них выпускать нечем.
    expect(requirementOf("DZEN_CHANNEL_URL")).toBe("required");
    expect(requirementOf("DZEN_BROWSER_ENDPOINT")).toBe("required");
    expect(requirementOf("DZEN_BROWSER_TOKEN")).toBe("required");
    expect(requirementOf("DZEN_FEED_CONFIRMED")).toBe("optional");
    expect(requirementOf("DZEN_FEED_PUBLISHING_ENABLED")).toBe("optional");
  });

  it("токены, которые заполняет OAuth, не выдаются за недоделку владельца", () => {
    expect(requirementOf("INSTAGRAM_ACCESS_TOKEN")).toBe("oauth");
    expect(requirementOf("THREADS_ACCESS_TOKEN")).toBe("oauth");
    expect(requirementOf("INSTAGRAM_APP_ID")).toBe("required");
    expect(requirementOf("THREADS_APP_SECRET")).toBe("required");
  });

  it("статус площадки считается по обязательным полям", () => {
    const ui = source("app/admin/marketing/agent/platform-settings.tsx");
    expect(ui).toContain("missingRequired");
    expect(ui).toContain("awaitingOauth");
    expect(ui).toContain("ждёт OAuth");
    expect(ui).not.toContain("`не задано: ${missing.length}`");
  });
});
