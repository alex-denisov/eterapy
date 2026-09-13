/**
 * B624 — кнопка подключения остаётся на своём контуре.
 *
 * Прописанный прод-хост уводил администратора со стенда в боевую админку:
 * система называла состояние не своим именем.
 *
 * ⚠ B742 — ВТОРАЯ ПОЛОВИНА ЭТОГО ПРОГОНА УДАЛЕНА ВМЕСТЕ С ПРЕДМЕТОМ. Она
 * сторожила формулировку «Reddit OAuth is not connected», по которой опрос
 * входящего отличал незаконченную настройку от поломки. Reddit убран из
 * контура решением владельца 2026-09-12, опрашивать стало нечего, и цикл
 * опроса удалён — сторожить больше нечего.
 */

import { requestOrigin } from "@/lib/request-origin";

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
