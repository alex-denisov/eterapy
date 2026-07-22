/**
 * B568 — вычистка адреса перед отправкой во внешние счётчики.
 *
 * В URL кабинета лежат идентификаторы пользователей, клиентов и разборов
 * (`/cabinet/clients/<id>`, `?dialogueId=…`). Метрика и GA отправляют адрес
 * страницы как есть, поэтому включить их на авторизованных поверхностях без
 * вычистки значит выгрузить эти идентификаторы наружу.
 *
 * Файл лежит в `public/`, а не в бандле, намеренно: он грузится обычным
 * `<script src>` со своего origin и проходит nonce-политику по `'self'`, тогда
 * как инлайновый скрипт под ней режется (это и был дефект B568).
 *
 * ⚠ Правило живёт ЗДЕСЬ в единственном экземпляре: `metrika.js` и `ga.js`
 * зовут `eterapyScrubAnalyticsUrl`, а не копируют regexp. Тест грузит именно
 * этот файл и проверяет его поведение — то есть проверяется то, что уходит в
 * прод, а не его копия.
 */

/** Метки источника: на них держится атрибуция, идентификаторов они не несут. */
var ETERAPY_ANALYTICS_KEEP_QUERY = /^(?:utm_[a-z_]+|yclid|ysclid|gclid|fbclid|from|ref)$/;

/**
 * Сегмент пути похож на идентификатор?
 *
 * Осторожно с последним правилом: человекочитаемый слаг («kak-vybrat-
 * specialista») длиннее любого id, поэтому длины недостаточно. Отличительный
 * признак — отсутствие дефисов-разделителей слов вместе с цифрой внутри.
 */
function eterapyIsIdSegment(segment) {
  if (!segment) return false;
  if (/^\d+$/.test(segment)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
  if (/^c[a-z0-9]{20,}$/.test(segment)) return true;
  return /^(?=.*\d)[A-Za-z0-9_]{16,}$/.test(segment);
}

/** Возвращает адрес без идентификаторов, query (кроме меток) и фрагмента. */
function eterapyScrubAnalyticsUrl(rawUrl) {
  var url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    // Мусор вместо адреса не должен ронять счётчик и не должен уходить наружу.
    return "";
  }

  var path = url.pathname
    .split("/")
    .map(function (segment) {
      return eterapyIsIdSegment(segment) ? ":id" : segment;
    })
    .join("/");

  var kept = [];
  url.searchParams.forEach(function (value, key) {
    if (ETERAPY_ANALYTICS_KEEP_QUERY.test(key)) {
      kept.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    }
  });

  return url.origin + path + (kept.length ? "?" + kept.join("&") : "");
}

if (typeof window !== "undefined") {
  window.eterapyScrubAnalyticsUrl = eterapyScrubAnalyticsUrl;
}
