/**
 * B624 — кнопка подключения остаётся на своём контуре, а ненастроенный
 * коннектор не выдаётся за поломку.
 *
 * Обе находки одного класса: система называла состояние не своим именем.
 * Прописанный прод-хост уводил администратора со стенда в боевую админку, а
 * непройденный OAuth поднимал WARNING «не читается входящее» — владелец шёл
 * чинить то, чего никто не подключал.
 */

import { requestOrigin } from "@/lib/request-origin";
import { REDDIT_NOT_CONNECTED } from "@/lib/marketing/reddit-oauth";

const withHeaders = (headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/admin/marketing/meta/threads/connect", { headers });

describe("контур берётся из запроса, а не из строки в коде", () => {
  it("стенд остаётся стендом", () => {
    expect(requestOrigin(withHeaders({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "staging.admin.eterapy.com",
    }))).toBe("https://staging.admin.eterapy.com");
  });

  it("прод остаётся продом", () => {
    expect(requestOrigin(withHeaders({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "admin.eterapy.com",
    }))).toBe("https://admin.eterapy.com");
  });

  it("без заголовков прокси берём Host и считаем схему https", () => {
    expect(requestOrigin(withHeaders({ host: "admin.eterapy.com" })))
      .toBe("https://admin.eterapy.com");
  });

  it("список из нескольких прокси читается по первому значению", () => {
    expect(requestOrigin(withHeaders({
      "x-forwarded-proto": "https, http",
      "x-forwarded-host": "staging.admin.eterapy.com, internal",
    }))).toBe("https://staging.admin.eterapy.com");
  });
});

describe("«не подключено» это не «сломано»", () => {
  it("формулировка не подключённого OAuth задана одним местом", () => {
    // Опрос входящего сравнивается именно с этой строкой: разойдись они, и
    // ложный инцидент вернулся бы молча.
    expect(REDDIT_NOT_CONNECTED).toBe("Reddit OAuth is not connected");
  });
});
