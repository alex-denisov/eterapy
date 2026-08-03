/**
 * B624 — адрес контура, с которого пришёл запрос.
 *
 * Приложение живёт в контейнере за прокси и своего внешнего имени не знает:
 * `request.url` внутри — это `http://localhost:3000`. Пока адрес возврата был
 * прописан строкой (`https://admin.eterapy.com`), кнопка подключения OAuth на
 * стенде уводила администратора в боевую админку, а браузер до этого ронял
 * запрос по CORS.
 *
 * Заголовки прокси — единственный источник, который знает настоящее имя. Их
 * ставит наш собственный nginx, а не клиент: до приложения запрос иначе не
 * доходит вовсе.
 */
export function requestOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host")?.trim();
  if (host) return `${proto || "https"}://${host}`;
  return new URL(request.url).origin;
}
