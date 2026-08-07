/**
 * B698 — окно входа обязано открываться там, где вход возможен.
 *
 * ЧТО СЛОМАЛОСЬ. Адрес студии у Дзена содержит канал: `/profile/editor/<канал>`.
 * Мы ходили на `/profile/editor` без канала — такого адреса у площадки нет, она
 * отдаёт «Страница не найдена» с кодом 200. Один и тот же неверный адрес стоял
 * в двух местах: в проверке сессии (отсюда «студия не открылась») и в окне
 * входа — владелец открывал окно и получал 404-страницу Дзена, на которой нет
 * ни одной кнопки. Войти было физически нельзя.
 *
 * ПОЧЕМУ АДРЕСА СТРОИТ ПРИЛОЖЕНИЕ, А НЕ СЕРВИС. Браузерный сервис живёт в
 * отдельном образе весом с гигабайт и выкатывается своим темпом. Знание об
 * устройстве адресов Дзена меняется чаще, чем Chromium, поэтому оно держится
 * здесь, под тестами, и уезжает в сервис параметром запроса.
 */

const settings: Record<string, string | null> = {};

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformValue: async (key: string) => settings[key] ?? null,
  requiredMarketingPlatformValue: async (key: string) => {
    const value = settings[key];
    if (!value) throw new Error(`${key} is not configured`);
    return value;
  },
}));

import {
  dzenChannelUrlFrom,
  dzenLoginUrlFrom,
  dzenPlainText,
  dzenStudioUrlFrom,
} from "@/lib/marketing/dzen-studio";
import {
  dzenBrowserHealth,
  openDzenBrowserSession,
  publishToDzenBrowser,
} from "@/lib/marketing/browser-publisher";
import { isChannelLevelPublicationError } from "@/lib/marketing/publish-hold";

const fetchMock = jest.fn();

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  settings.DZEN_BROWSER_ENDPOINT = "http://10.77.0.2:7801";
  settings.DZEN_BROWSER_TOKEN = "secret";
  settings.DZEN_CHANNEL_URL = "https://dzen.ru/eterapy";
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, authorized: true, reason: null, account: "eterapy" }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("адрес студии", () => {
  it("по слагу студию НЕ строим: такой адрес уводит на публичную страницу", () => {
    // Снято живьём 2026-08-07: холодный переход на /profile/editor/<слаг> даёт
    // публичную страницу канала даже под владельцем. Вид со слагом появляется в
    // адресной строке только ПОСЛЕ загрузки студии, её SPA переписывает адрес.
    expect(dzenStudioUrlFrom("https://dzen.ru/eterapy")).toBeNull();
  });

  it("канал видом /id/<id> → студия видом /profile/editor/id/<id>", () => {
    expect(dzenStudioUrlFrom("https://dzen.ru/id/6a615eb7638cca4e9cf25c2a"))
      .toBe("https://dzen.ru/profile/editor/id/6a615eb7638cca4e9cf25c2a");
  });

  it("уже адрес студии с идентификатором — он же, без хвостов", () => {
    expect(dzenStudioUrlFrom("https://dzen.ru/profile/editor/id/6a615eb7638cca4e9cf25c2a/?x=1"))
      .toBe("https://dzen.ru/profile/editor/id/6a615eb7638cca4e9cf25c2a");
  });

  it("адрес БЕЗ канала не годится вовсе", () => {
    expect(() => dzenStudioUrlFrom("https://dzen.ru/")).toThrow(/канал/i);
  });

  it("чужой хост не берём: сервис ходит только на Дзен", () => {
    expect(() => dzenStudioUrlFrom("https://example.com/eterapy")).toThrow(/dzen\.ru/i);
  });
});

describe("публичный адрес канала", () => {
  it("чистится от хвостов запроса и слеша", () => {
    expect(dzenChannelUrlFrom("https://dzen.ru/eterapy/?utm_source=x#top")).toBe("https://dzen.ru/eterapy");
  });
});

describe("адрес входа ведёт на форму Яндекс ID", () => {
  it("паспорт с возвратом на канал", () => {
    expect(dzenLoginUrlFrom("https://dzen.ru/eterapy")).toBe(
      "https://passport.yandex.ru/auth?retpath=https%3A%2F%2Fdzen.ru%2Feterapy",
    );
  });

  it("никогда не ведёт на страницу Дзена: с неё войти нельзя", () => {
    expect(dzenLoginUrlFrom("https://dzen.ru/eterapy")).toMatch(/^https:\/\/passport\.yandex\.ru\//);
  });
});

describe("сервис получает адреса от приложения", () => {
  it("окно входа поднимается на форме входа, а не на странице площадки", async () => {
    await openDzenBrowserSession();

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("http://10.77.0.2:7801/session/open");
    expect(JSON.parse(init.body)).toEqual({
      channelUrl: "https://dzen.ru/eterapy",
      studioUrl: null,
      loginUrl: "https://passport.yandex.ru/auth?retpath=https%3A%2F%2Fdzen.ru%2Feterapy",
    });
  });

  it("проба сессии несёт канал, а студию — только когда та известна", async () => {
    await dzenBrowserHealth();
    const [slug] = fetchMock.mock.calls[0] as [string];
    expect(decodeURIComponent(slug)).toContain("channel=https://dzen.ru/eterapy");
    expect(slug).not.toContain("studio=");

    fetchMock.mockClear();
    settings.DZEN_CHANNEL_URL = "https://dzen.ru/id/6a615eb7638cca4e9cf25c2a";
    await dzenBrowserHealth();
    const [byId] = fetchMock.mock.calls[0] as [string];
    expect(decodeURIComponent(byId)).toContain("studio=https://dzen.ru/profile/editor/id/6a615eb7638cca4e9cf25c2a");
  });

  it("выпуск несёт те же адреса, что и проверка", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, externalPostId: "anPQ", publicUrl: "https://dzen.ru/a/anPQ" }),
    });

    await publishToDzenBrowser({ title: "Заголовок", body: "Текст", mediaUrl: null });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({
      channelUrl: "https://dzen.ru/eterapy",
      studioUrl: null,
    });
  });
});

describe("разметка не уезжает в статью", () => {
  // Первый живой заход напечатал в редакторе Дзена «**Что стоит проверить:**»
  // ровно так, со звёздочками: markdown там визуальный редактор не понимает.
  it("жирный и курсив снимаются", () => {
    expect(dzenPlainText("**Что стоит проверить:**")).toBe("Что стоит проверить:");
    expect(dzenPlainText("вопрос — *«Какое чувство сейчас?»* и всё")).toBe("вопрос — «Какое чувство сейчас?» и всё");
  });

  it("маркер списка становится тире, а не остаётся дефисом", () => {
    // С дефиса редактор Дзена сам заводит список, и следующая строка получает
    // второй маркер — в живой статье это выглядело как «– » внутри пункта.
    expect(dzenPlainText("- Какая вода в вашем сне?\n- Что именно вода угрожает?"))
      .toBe("— Какая вода в вашем сне?\n— Что именно вода угрожает?");
  });

  it("заголовки теряют решётки", () => {
    expect(dzenPlainText("## Практика\nТекст")).toBe("Практика\nТекст");
  });

  it("подчёркивания в адресах остаются нетронутыми", () => {
    const url = "https://eterapy.com/library/son?utm_source=dzen&utm_medium=social";
    expect(dzenPlainText(url)).toBe(url);
  });

  it("выпуск получает текст уже без разметки", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, externalPostId: "anPQ", publicUrl: "https://dzen.ru/a/anPQ" }),
    });

    await publishToDzenBrowser({
      title: "Вода во сне",
      body: "**Что стоит проверить:**\n- Какая вода?",
      mediaUrl: null,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).body).toBe("Что стоит проверить:\n— Какая вода?");
  });
});

describe("неисправная настройка не бракует материал", () => {
  it("отсутствующий адрес канала — отказ КАНАЛА: слот материала не сгорает", async () => {
    delete settings.DZEN_CHANNEL_URL;

    const error = await publishToDzenBrowser({ title: "Заголовок", body: "Текст", mediaUrl: null })
      .then(() => "", (reason: Error) => reason.message);

    expect(error).toMatch(/адрес канала/i);
    expect(isChannelLevelPublicationError(error)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "Редактор Дзена изменился: кнопка создания публикации не найдена",
    "Сессия Дзена истекла: владельцу нужно снова пройти подключение",
    "Дзен показал проверку безопасности: нужен вход владельца через кнопку подключения",
    "адрес студии ведёт на посторонний хост «example.com»",
  ])("отказ браузерной дороги «%s» — отказ канала", (message) => {
    // Все четыре — про нашу сторону или про площадку. Повтор тем же текстом
    // пройдёт, как только владелец войдёт или образ доедет.
    expect(isChannelLevelPublicationError(message)).toBe(true);
  });

  it("кривой адрес канала — тоже отказ канала, а не брак материала", async () => {
    settings.DZEN_CHANNEL_URL = "https://example.com/eterapy";

    const error = await publishToDzenBrowser({ title: "Заголовок", body: "Текст", mediaUrl: null })
      .then(() => "", (reason: Error) => reason.message);

    expect(isChannelLevelPublicationError(error)).toBe(true);
  });
});

describe("состояние сессии говорит правду", () => {
  it("называет аккаунт, под которым живёт сессия", async () => {
    await expect(dzenBrowserHealth()).resolves.toMatchObject({ authorized: true, account: "eterapy" });
  });

  it("без адреса канала не выдумывает адрес, а просит его задать", async () => {
    delete settings.DZEN_CHANNEL_URL;

    const health = await dzenBrowserHealth();
    expect(health.authorized).toBe(false);
    expect(health.reason).toMatch(/адрес канала/i);
    // Пробу площадки делать нечем, но живость сервиса спросить надо: окно входа
    // показывается по этому признаку, а без окна владельцу не войти.
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://10.77.0.2:7801/health");
    expect(health.reachable).toBe(true);
  });

  it("причину отказа передаёт словами сервиса, ничего не досочиняя", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, authorized: false, reason: "в браузере никто не вошёл", account: null }),
    });

    await expect(dzenBrowserHealth()).resolves.toMatchObject({
      authorized: false,
      reason: "в браузере никто не вошёл",
    });
  });
});
