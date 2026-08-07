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

import { dzenLoginUrlFrom, dzenStudioUrlFrom } from "@/lib/marketing/dzen-studio";
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

describe("адрес студии выводится из адреса канала", () => {
  it("канал со слагом → студия с тем же слагом", () => {
    expect(dzenStudioUrlFrom("https://dzen.ru/eterapy")).toBe("https://dzen.ru/profile/editor/eterapy");
  });

  it("канал видом /id/<id> → студия видом /profile/editor/id/<id>", () => {
    expect(dzenStudioUrlFrom("https://dzen.ru/id/60201eac4a559e72fca5340f"))
      .toBe("https://dzen.ru/profile/editor/id/60201eac4a559e72fca5340f");
  });

  it("уже адрес студии — оставляем как есть", () => {
    expect(dzenStudioUrlFrom("https://dzen.ru/profile/editor/eterapy/"))
      .toBe("https://dzen.ru/profile/editor/eterapy");
  });

  it("хвост запроса и слеш отбрасываются", () => {
    expect(dzenStudioUrlFrom("https://dzen.ru/eterapy/?utm_source=x#top"))
      .toBe("https://dzen.ru/profile/editor/eterapy");
  });

  it("адрес БЕЗ канала — это и была поломка: он не годится", () => {
    expect(() => dzenStudioUrlFrom("https://dzen.ru/profile/editor")).toThrow(/канал/i);
    expect(() => dzenStudioUrlFrom("https://dzen.ru/")).toThrow(/канал/i);
  });

  it("чужой хост не берём: сервис ходит только на Дзен", () => {
    expect(() => dzenStudioUrlFrom("https://example.com/eterapy")).toThrow(/dzen\.ru/i);
  });
});

describe("адрес входа ведёт на форму Яндекс ID", () => {
  it("паспорт с возвратом в студию", () => {
    expect(dzenLoginUrlFrom("https://dzen.ru/profile/editor/eterapy")).toBe(
      "https://passport.yandex.ru/auth?retpath=https%3A%2F%2Fdzen.ru%2Fprofile%2Feditor%2Feterapy",
    );
  });

  it("никогда не ведёт на страницу Дзена: с неё войти нельзя", () => {
    expect(dzenLoginUrlFrom("https://dzen.ru/profile/editor/eterapy")).toMatch(/^https:\/\/passport\.yandex\.ru\//);
  });
});

describe("сервис получает адреса от приложения", () => {
  it("окно входа поднимается на форме входа, а не на студии", async () => {
    await openDzenBrowserSession();

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("http://10.77.0.2:7801/session/open");
    expect(JSON.parse(init.body)).toEqual({
      studioUrl: "https://dzen.ru/profile/editor/eterapy",
      loginUrl: "https://passport.yandex.ru/auth?retpath=https%3A%2F%2Fdzen.ru%2Fprofile%2Feditor%2Feterapy",
    });
  });

  it("проба сессии идёт на студию с каналом", async () => {
    await dzenBrowserHealth();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/health?probe=1");
    expect(decodeURIComponent(url)).toContain("https://dzen.ru/profile/editor/eterapy");
  });

  it("выпуск идёт в ту же студию, что и проверка", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, externalPostId: "anPQ", publicUrl: "https://dzen.ru/a/anPQ" }),
    });

    await publishToDzenBrowser({ title: "Заголовок", body: "Текст", mediaUrl: null });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).studioUrl).toBe("https://dzen.ru/profile/editor/eterapy");
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
