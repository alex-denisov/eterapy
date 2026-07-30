/**
 * B631 — контур Meta.
 *
 * Замер с боевой ноды 2026-07-30: `graph.facebook.com` и `graph.instagram.com`
 * не отвечают вовсе, `graph.threads.net` отвечает за 0.16 с — при том, что два
 * последних имени резолвятся в ОДИН адрес. Значит фильтруется имя, а не сеть.
 * Обратное направление такое же: `eterapy.com` — российский IP напрямую, и
 * проверка вебхука со стороны Meta отваливалась по таймауту (`curl_errno = 28`).
 *
 * Здесь фиксируется поведение переключателя: без релея всё как было, с релеем
 * адреса и секрет появляются ровно там, где нужно, и нигде больше.
 */

import {
  META_DIRECT_HOSTS,
  metaEndpoint,
  metaProxyEnabled,
  metaRequestHeaders,
  metaWebhookCallbackUrl,
} from "@/lib/marketing/meta-endpoints";

const BASE = "https://eterapy-meta-proxy.890525.workers.dev";

describe("B631 · релей Meta", () => {
  beforeEach(() => {
    delete process.env.META_GRAPH_PROXY_BASE;
    delete process.env.META_GRAPH_PROXY_SECRET;
    delete process.env.META_WEBHOOK_HOST;
  });

  it("без релея вызовы идут напрямую и секрета в заголовках нет", () => {
    expect(metaProxyEnabled()).toBe(false);
    expect(metaEndpoint("instagram")).toBe(META_DIRECT_HOSTS.instagram);
    expect(metaEndpoint("threads")).toBe(META_DIRECT_HOSTS.threads);
    expect(metaRequestHeaders({ "Content-Type": "text/plain" }))
      .toEqual({ "Content-Type": "text/plain" });
  });

  it("с релеем каждая площадка получает свой маршрут", () => {
    process.env.META_GRAPH_PROXY_BASE = BASE;
    process.env.META_GRAPH_PROXY_SECRET = "secret";
    expect(metaProxyEnabled()).toBe(true);
    expect(metaEndpoint("instagram")).toBe(`${BASE}/graph/instagram`);
    expect(metaEndpoint("facebook")).toBe(`${BASE}/graph/facebook`);
    expect(metaEndpoint("instagram-oauth")).toBe(`${BASE}/graph/instagram-oauth`);
  });

  it("секрет добавляется только при включённом релее", () => {
    process.env.META_GRAPH_PROXY_BASE = BASE;
    process.env.META_GRAPH_PROXY_SECRET = "secret";
    expect(metaRequestHeaders({ Authorization: "Bearer x" })).toEqual({
      Authorization: "Bearer x",
      "x-eterapy-proxy": "secret",
    });
  });

  it("половина настройки не включает релей: иначе воркер ответит 403", () => {
    process.env.META_GRAPH_PROXY_BASE = BASE;
    expect(metaProxyEnabled()).toBe(false);
    expect(metaEndpoint("instagram")).toBe(META_DIRECT_HOSTS.instagram);
  });

  it("адрес вебхука ведёт на проксируемое имя, а не на российский IP", () => {
    // `hooks.` — единственная оранжевая запись зоны. Прямой адрес `eterapy.com`
    // здесь появиться не должен: именно на нём Meta и получала таймаут.
    expect(metaWebhookCallbackUrl("threads"))
      .toBe("https://hooks.eterapy.com/api/integrations/meta/threads/webhook");
    expect(metaWebhookCallbackUrl("instagram"))
      .toBe("https://hooks.eterapy.com/api/integrations/meta/instagram/webhook");
  });

  it("имя входа переопределяется переменной, если запись сменится", () => {
    process.env.META_WEBHOOK_HOST = "https://hooks2.eterapy.com/";
    expect(metaWebhookCallbackUrl("instagram"))
      .toBe("https://hooks2.eterapy.com/api/integrations/meta/instagram/webhook");
    delete process.env.META_WEBHOOK_HOST;
  });

  it("завершающий слэш в настройке не ломает склейку адреса", () => {
    process.env.META_GRAPH_PROXY_BASE = `${BASE}/`;
    process.env.META_GRAPH_PROXY_SECRET = "secret";
    expect(metaEndpoint("threads")).toBe(`${BASE}/graph/threads`);
  });
});
