/**
 * B631 — адреса Meta и релей вокруг блокировки.
 *
 * Замер с боевой ноды 2026-07-30 (cloud.ru, AS208677):
 *
 * | Имя                  | Ответ                     |
 * |----------------------|---------------------------|
 * | `graph.facebook.com` | таймаут                   |
 * | `graph.instagram.com`| таймаут                   |
 * | `graph.threads.net`  | 500 за 0.16 с             |
 *
 * Два последних имени резолвятся в ОДИН адрес `157.240.205.63`. Значит режется
 * не сеть и не маршрут, а имя на пути из РФ — и «Instagram не публикуется»
 * оказывается не дефектом коннектора, а границей периметра.
 *
 * Поэтому адрес каждого вызова считается здесь, а не пишется по месту: включение
 * релея — одна переменная окружения, а не правка семи файлов. Без переменной
 * поведение прежнее (прямой вызов), поэтому стенд и тесты не зависят от наличия
 * воркера.
 */

export type MetaUpstream = "instagram" | "facebook" | "threads" | "instagram-oauth";

export const META_DIRECT_HOSTS: Record<MetaUpstream, string> = {
  instagram: "https://graph.instagram.com",
  facebook: "https://graph.facebook.com",
  threads: "https://graph.threads.net",
  "instagram-oauth": "https://api.instagram.com",
};

/**
 * База исходящего шлюза. Это НАША зарубежная нода из `fleet-matrix.json`
 * (`eterapy-3`/`eterapy-4`), а не сторонний прокси: маршрут
 * `/api/integrations/meta/relay` живёт в том же образе и приезжает той же
 * выкаткой.
 */
function proxyBase() {
  return process.env.META_GRAPH_PROXY_BASE?.trim().replace(/\/+$/, "") || "";
}

export function metaProxyEnabled(): boolean {
  return Boolean(proxyBase() && process.env.META_GRAPH_PROXY_SECRET?.trim());
}

/**
 * Базовый адрес площадки: сам хост или его отражение в релее. Возвращается без
 * завершающего слэша, чтобы вызовы складывали путь одинаково.
 */
export function metaEndpoint(upstream: MetaUpstream): string {
  const base = proxyBase();
  if (!base || !process.env.META_GRAPH_PROXY_SECRET?.trim()) {
    return META_DIRECT_HOSTS[upstream];
  }
  return `${base}/graph/${upstream}`;
}

/**
 * Заголовки запроса к площадке. Секрет уходит ТОЛЬКО в релей: при прямом вызове
 * его в запросе нет вовсе, иначе мы бы отправляли свой внутренний секрет в Meta.
 */
export function metaRequestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const secret = process.env.META_GRAPH_PROXY_SECRET?.trim();
  if (!proxyBase() || !secret) return extra;
  return { ...extra, "x-eterapy-proxy": secret };
}

/**
 * Адрес вебхука, который владелец вписывает в кабинете Meta.
 *
 * `hooks.eterapy.com` — единственная проксируемая Cloudflare запись зоны:
 * проверка Meta приходит на край Cloudflare, а не на российский адрес ноды.
 * Остальные имена (`eterapy.com`, `app.`, `admin.`) остаются серыми — липкость
 * балансировщика и кеш публичных страниц не затрагиваются.
 *
 * Значение переопределяется переменной на случай смены имени входа; менять
 * адрес в кабинете Meta при этом придётся руками — это внешняя настройка.
 */
export const META_WEBHOOK_HOST = "https://hooks.eterapy.com";

export function metaWebhookCallbackUrl(platform: "threads" | "instagram"): string {
  const host = process.env.META_WEBHOOK_HOST?.trim().replace(/\/+$/, "") || META_WEBHOOK_HOST;
  return `${host}/api/integrations/meta/${platform}/webhook`;
}
