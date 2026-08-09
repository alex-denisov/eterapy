/**
 * B650 — Google в панели маркетинга.
 *
 * Владелец 2026-08-04: «где на странице данные по гугл поисковику». Ответ был —
 * их нет и не было: все четыре источника панели яндексовые. Доступ к Google при
 * этом существовал, но жил в агентском CLI (B639) и в админку не отдавал ничего.
 *
 * Прогон держит три обещания: ненастроенный источник НЕ выдаётся за ноль;
 * доля Google приводится к процентам ровно один раз; пустая разбивка по
 * запросам называет причину, а причин у неё две и они разные.
 */

import fs from "node:fs";
import path from "node:path";

import {
  EMPTY_SEARCH_CONSOLE_TOTALS,
  explainEmptyQueries,
  searchConsoleConfig,
} from "@/lib/search-console";

describe("B650 · настройка источника", () => {
  it("без секретов источник не настроен — и это не ноль показов", () => {
    expect(searchConsoleConfig({})).toBeNull();
    expect(searchConsoleConfig({ GOOGLE_OAUTH_CLIENT_ID: "id" })).toBeNull();
    expect(searchConsoleConfig({ GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "s" })).toBeNull();
  });

  it("полный набор секретов даёт конфигурацию с доменным свойством по умолчанию", () => {
    const config = searchConsoleConfig({
      GOOGLE_OAUTH_CLIENT_ID: "id",
      GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      GOOGLE_OAUTH_REFRESH_TOKEN: "refresh",
    });
    // Доменное свойство покрывает все поддомены разом, префиксное — нет.
    expect(config?.property).toBe("sc-domain:eterapy.com");
  });

  it("свойство переопределяется переменной — у нас подтверждены оба вида", () => {
    const config = searchConsoleConfig({
      GOOGLE_OAUTH_CLIENT_ID: "id",
      GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      GOOGLE_OAUTH_REFRESH_TOKEN: "refresh",
      GSC_PROPERTY: "https://eterapy.com/",
    });
    expect(config?.property).toBe("https://eterapy.com/");
  });

  it("пробелы вокруг секрета не создают «настроенный» источник из пустоты", () => {
    expect(searchConsoleConfig({
      GOOGLE_OAUTH_CLIENT_ID: "  ",
      GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      GOOGLE_OAUTH_REFRESH_TOKEN: "refresh",
    })).toBeNull();
  });
});

describe("B650 · пустая разбивка по запросам называет ПРИЧИНУ", () => {
  it("показы есть, запросов нет — это анонимизация Google, а не сбой", () => {
    // Живой замер 2026-08-04 за 30 дней: 3 показа, 0 кликов, и НИ ОДНОГО
    // запроса в разбивке. Google не раскрывает редкие запросы.
    const reason = explainEmptyQueries({ ...EMPTY_SEARCH_CONSOLE_TOTALS, impressions: 3 }, 0);
    expect(reason).toContain("не раскрывает редкие запросы");
  });

  it("показов нет вовсе — причина другая, и формулировка обязана отличаться", () => {
    const reason = explainEmptyQueries(EMPTY_SEARCH_CONSOLE_TOTALS, 0);
    expect(reason).toContain("ни одного показа");
    expect(reason).not.toContain("не раскрывает редкие запросы");
  });

  it("когда запросы есть, объяснять нечего", () => {
    expect(explainEmptyQueries({ ...EMPTY_SEARCH_CONSOLE_TOTALS, impressions: 100 }, 5)).toBeNull();
  });
});

describe("B650 · панель", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("Google — пятый источник в списке состояния", () => {
    const data = read("src/lib/search-marketing-data.ts");
    expect(data).toContain("searchConsoleValue.source");
    expect(data).toContain('"Google Search Console"');
  });

  it("ненастроенный источник на экране говорит, что не спрашивал, а не показывает ноль", () => {
    const page = read("src/app/admin/marketing/page.tsx");
    expect(page).toContain("не показывает по Google ноль");
    expect(page).toContain("GOOGLE_OAUTH_REFRESH_TOKEN");
  });

  it("итоги Google и Яндекса не складываются в одну цифру", () => {
    // У источников разные окна выгрузки и разное определение показа. Сумма
    // выглядела бы точнее, чем она есть.
    const page = read("src/app/admin/marketing/page.tsx");
    expect(page).toContain("data.searchConsole.totals.impressions");
    expect(page).not.toContain("data.totals.impressions + data.searchConsole");
  });

  it("сетка источников рассчитана на пять карточек, а не на четыре", () => {
    expect(read("src/app/admin/marketing/page.tsx")).toContain("xl:grid-cols-5");
  });
});

describe("B650 · секреты не утекают в интерфейс", () => {
  it("модуль не отдаёт наружу тело ответа токен-эндпоинта", () => {
    const lib = fs.readFileSync(path.join(process.cwd(), "src/lib/search-console.ts"), "utf8");
    // В теле отказа лежит эхо запроса вместе с client_secret.
    expect(lib).toContain("HTTP ${response.status}");
    expect(lib).not.toContain("await response.text()");
  });
});
