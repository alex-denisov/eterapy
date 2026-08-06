/**
 * B682 — публикация Meta только от брендовых страниц.
 *
 * Ловушка, ради которой написан модуль: при входе не тем профилем публикация
 * УСПЕШНА — площадка отвечает 200, пост выходит, ссылка выглядит нормально.
 * Отличить это можно только сверкой адресата, поэтому прогон проверяет саму
 * сверку, а не форму запроса.
 */
jest.mock("@/lib/marketing/meta-endpoints", () => ({
  metaEndpoint: (upstream: string) => `https://graph.${upstream}.test`,
  metaRequestHeaders: (extra: Record<string, string> = {}) => extra,
}));

import {
  META_BRAND_HANDLES,
  assertMetaBrandAccount,
  resetMetaBrandAccountCache,
} from "@/lib/marketing/meta-brand-account";

const fetchMock = jest.fn();

beforeEach(() => {
  resetMetaBrandAccountCache();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function reply(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

describe("адресат публикации", () => {
  it("страницы бренда названы явно и одинаково на обеих площадках", () => {
    expect(META_BRAND_HANDLES.instagram).toBe("eterapy_official");
    expect(META_BRAND_HANDLES.threads).toBe("eterapy_official");
  });

  it("пропускает публикацию от брендовой страницы", async () => {
    fetchMock.mockReturnValue(reply({ id: "1", username: "eterapy_official" }));
    await expect(
      assertMetaBrandAccount({ platform: "threads", token: "t", userId: "u" }),
    ).resolves.toBeUndefined();
  });

  it("терпит @ и регистр в имени аккаунта", async () => {
    fetchMock.mockReturnValue(reply({ id: "1", username: "@ETerapy_Official" }));
    await expect(
      assertMetaBrandAccount({ platform: "instagram", token: "t", userId: "u" }),
    ).resolves.toBeUndefined();
  });

  it("останавливает публикацию с ЛИЧНОГО аккаунта владельца", async () => {
    // Ровно тот случай, из-за которого модуль написан: маркеры тестировщика
    // Meta владелец получал личным аккаунтом (B655).
    fetchMock.mockReturnValue(reply({ id: "9", username: "alexey_personal" }));
    await expect(
      assertMetaBrandAccount({ platform: "instagram", token: "t", userId: "u" }),
    ).rejects.toThrow(/alexey_personal[\s\S]*eterapy_official/);
  });

  it("не публикует, если имя аккаунта выяснить не удалось", async () => {
    fetchMock.mockReturnValue(reply({ error: { message: "Invalid OAuth token" } }, false, 401));
    await expect(
      assertMetaBrandAccount({ platform: "threads", token: "t", userId: "u" }),
    ).rejects.toThrow(/Invalid OAuth token/);
  });

  it("сверяет один раз на аккаунт, а не на каждую публикацию", async () => {
    fetchMock.mockReturnValue(reply({ id: "1", username: "eterapy_official" }));
    await assertMetaBrandAccount({ platform: "threads", token: "t", userId: "u" });
    await assertMetaBrandAccount({ platform: "threads", token: "t", userId: "u" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("после смены аккаунта сверяет заново", async () => {
    fetchMock.mockReturnValue(reply({ id: "1", username: "eterapy_official" }));
    await assertMetaBrandAccount({ platform: "threads", token: "t", userId: "u" });
    fetchMock.mockReturnValue(reply({ id: "2", username: "alexey_personal" }));
    await expect(
      assertMetaBrandAccount({ platform: "threads", token: "t2", userId: "other" }),
    ).rejects.toThrow(/eterapy_official/);
  });
});
