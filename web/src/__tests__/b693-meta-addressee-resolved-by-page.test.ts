/**
 * B693 — адресат Meta берётся страницей, а не аккаунтом пользователя.
 *
 * Владелец 2026-08-06: «ты должен был выбирать не userID, а pageID … даже об
 * этом говорит Graph API, что нужно взять токены и получить id страниц».
 *
 * Так и есть. Instagram сейчас подключается через Instagram Login: маркер
 * выдаётся ТОМУ аккаунту, под которым открыт браузер, и экрана выбора в этом
 * потоке нет вовсе. Поэтому `INSTAGRAM_USER_ID` оказался id личного профиля
 * владельца, а не брендовой страницы, и никакой правкой ссылки это не лечится.
 *
 * Документированный Meta обход — `/me/accounts` → `instagram_business_account`.
 * Здесь адресат не выбирается человеком в чужом окне, а ВЫЧИСЛЯЕТСЯ нами из
 * графа, и потому доказуем.
 */

import {
  fetchMetaPageInventory,
  resolveMetaBrandPage,
} from "@/lib/marketing/meta-page-resolver";

const TOKEN = "EAAB-test-token";

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function mockGraph(routes: Record<string, unknown>) {
  return jest.fn(async (url: string | URL) => {
    const href = String(url);
    const match = Object.keys(routes).find((path) => href.includes(path));
    if (!match) throw new Error(`unexpected call: ${href}`);
    return jsonResponse(routes[match]);
  });
}

describe("B693 — опись «Страница ↔ Instagram» строится обходом графа", () => {
  afterEach(() => jest.restoreAllMocks());

  it("собирает страницы и привязанные к ним бизнес-аккаунты Instagram", async () => {
    const fetchMock = mockGraph({
      "/me/accounts": {
        data: [
          {
            id: "102938475610293",
            name: "Личная страница",
            access_token: "PAGE-TOKEN-personal",
          },
          {
            id: "884477441122336",
            name: "ETerapy",
            access_token: "PAGE-TOKEN-brand",
            instagram_business_account: { id: "17841400000000001", username: "eterapy_official" },
          },
        ],
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const inventory = await fetchMetaPageInventory(TOKEN);

    expect(inventory.source).toBe("me/accounts");
    expect(inventory.entries).toEqual([
      {
        pageId: "102938475610293",
        pageName: "Личная страница",
        pageToken: "PAGE-TOKEN-personal",
        igUserId: null,
        igUsername: null,
      },
      {
        pageId: "884477441122336",
        pageName: "ETerapy",
        pageToken: "PAGE-TOKEN-brand",
        igUserId: "17841400000000001",
        igUsername: "eterapy_official",
      },
    ]);
  });

  it("id страницы не портится о точность числа JavaScript", async () => {
    // B689 тем же дефектом испортил id аккаунта: `JSON.parse` округляет всё,
    // что длиннее Number.MAX_SAFE_INTEGER, и порча молчаливая — тип верный,
    // длина верная, расходятся последние разряды. У id страниц и у
    // instagram_business_account ровно тот же диапазон.
    // Тело задаётся СТРОКОЙ, а не объектом: пройди оно через JSON.stringify —
    // округление случилось бы в самом прогоне, и прогон проверял бы себя.
    const body = '{"data":[{"id":884477441122336677,"name":"ETerapy",'
      + '"access_token":"PAGE-TOKEN-brand",'
      + '"instagram_business_account":{"id":17841400000000001,"username":"eterapy_official"}}]}';
    // Наивный разбор здесь и портит id — сравниваем строками, потому что
    // числовой литерал в самом прогоне округлился бы точно так же.
    expect(String(JSON.parse(body).data[0].id)).not.toBe("884477441122336677");

    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    } as unknown as Response));
    global.fetch = fetchMock as unknown as typeof fetch;

    const inventory = await fetchMetaPageInventory(TOKEN);

    expect(inventory.entries[0]?.pageId).toBe("884477441122336677");
    expect(inventory.entries[0]?.igUserId).toBe("17841400000000001");
  });

  it("у маркера системного пользователя личных страниц нет — идём через портфель", async () => {
    // Маркер системного пользователя не «управляет страницами» как человек:
    // `/me/accounts` у него пуст. Это документированный Meta способ работать
    // без участия человека, и он обязан находить страницу так же.
    const fetchMock = mockGraph({
      "/me/accounts": { data: [] },
      "/me/businesses": { data: [{ id: "550055005500550", name: "ETerapy Business" }] },
      "/owned_pages": {
        data: [{
          id: "884477441122336",
          name: "ETerapy",
          access_token: "PAGE-TOKEN-brand",
          instagram_business_account: { id: "17841400000000001", username: "eterapy_official" },
        }],
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const inventory = await fetchMetaPageInventory(TOKEN);

    expect(inventory.source).toBe("business/owned_pages");
    expect(inventory.entries[0]?.igUsername).toBe("eterapy_official");
  });

  it("отказ площадки не выдаётся за пустую опись", async () => {
    // Молчание сети НЕ засчитывается за «страниц нет»: иначе достаточно
    // отвалиться релею, чтобы решить, что бренда не существует.
    global.fetch = jest.fn(async () => jsonResponse(
      { error: { message: "Invalid OAuth access token" } },
      false,
    )) as unknown as typeof fetch;

    await expect(fetchMetaPageInventory(TOKEN)).rejects.toThrow(/Invalid OAuth access token/);
  });
});

describe("B693 — брендовая страница выбирается из описи, а не со слов", () => {
  const inventory = {
    source: "me/accounts" as const,
    entries: [
      { pageId: "1", pageName: "Личная", pageToken: "t1", igUserId: "10", igUsername: "alexey_s_denisov" },
      { pageId: "2", pageName: "ETerapy", pageToken: "t2", igUserId: "20", igUsername: "eterapy_official" },
    ],
  };

  it("находит страницу бренда по имени аккаунта Instagram", () => {
    expect(resolveMetaBrandPage(inventory)).toEqual(inventory.entries[1]);
  });

  it("сравнение нечувствительно к «@» и регистру", () => {
    expect(resolveMetaBrandPage({
      ...inventory,
      entries: [{ ...inventory.entries[1], igUsername: "@ETerapy_Official" }],
    })?.pageId).toBe("2");
  });

  it("страница без привязанного Instagram брендовой не считается", () => {
    // Публиковать в Instagram через страницу без `instagram_business_account`
    // нельзя — совпадение по имени самой Страницы здесь ничего не значит.
    expect(resolveMetaBrandPage({
      ...inventory,
      entries: [{ pageId: "9", pageName: "eterapy_official", pageToken: "t9", igUserId: null, igUsername: null }],
    })).toBeNull();
  });

  it("нет брендовой страницы — возвращается null, а не первая попавшаяся", () => {
    expect(resolveMetaBrandPage({ ...inventory, entries: [inventory.entries[0]] })).toBeNull();
  });
});
