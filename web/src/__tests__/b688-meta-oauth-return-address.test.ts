/**
 * B688 — возврат из OAuth Meta приходил на несуществующий адрес.
 *
 * Заход владельца 2026-08-06: «Threads ссылка даёт
 * `https://0.0.0.0:3000/admin/marketing/agent?threads=connected#_`». Подключение
 * при этом ПРОШЛО — в журнале аудита есть `MARKETING_META_CONNECT` от 09:32:46,
 * — но владелец видел мёртвую страницу и считал, что не получилось.
 *
 * Причина: обработчик возврата строил адрес от `request.url`. Приложение живёт
 * в контейнере и слушает `0.0.0.0:3000`; своего внешнего имени оно не знает.
 * Ровно эта же ошибка уже разбиралась в B624 — и тогда же появился
 * `requestOrigin(request)`, который спрашивает имя у заголовков прокси. В
 * обработчиках Meta его просто не применили.
 *
 * Вторая половина той же дороги: `eterapy.com/admin/...` прокси перебрасывает
 * на `admin.eterapy.com`, и переброс терял строку запроса. Значит даже с
 * верным происхождением метка `?threads=connected` до админки не доезжала, и
 * владелец опять не узнал бы исход.
 */

import { requestOrigin } from "@/lib/request-origin";

function callbackRequest(headers: Record<string, string>) {
  // Ровно то, что видит обработчик внутри контейнера: адрес привязки, а не
  // публичное имя.
  return new Request("http://0.0.0.0:3000/api/integrations/meta/threads/oauth/callback?code=x&state=y", {
    headers,
  });
}

describe("B688 · возврат из OAuth ведёт на живой контур", () => {
  it("происхождение берётся у прокси, а не из адреса привязки", () => {
    expect(requestOrigin(callbackRequest({ "x-forwarded-proto": "https", "x-forwarded-host": "eterapy.com" })))
      .toBe("https://eterapy.com");
  });

  it("адрес возврата в админку не содержит 0.0.0.0", () => {
    const origin = requestOrigin(callbackRequest({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "eterapy.com",
    }));
    const target = new URL("/admin/marketing/agent?threads=connected", origin);
    expect(target.hostname).not.toBe("0.0.0.0");
    expect(target.toString()).toBe("https://eterapy.com/admin/marketing/agent?threads=connected");
  });

  it("на стенде возврат остаётся на стенде", () => {
    const origin = requestOrigin(callbackRequest({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "staging.eterapy.com",
    }));
    expect(new URL("/admin/marketing/agent?threads=connected", origin).toString())
      .toBe("https://staging.eterapy.com/admin/marketing/agent?threads=connected");
  });
});
