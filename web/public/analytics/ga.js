/**
 * B568 — загрузчик Google Analytics 4 без инлайнового тела.
 *
 * Причина та же, что у `metrika.js`: инлайновый скрипт не получает nonce и
 * режется на авторизованных поверхностях. Сам `gtag/js` грузится с
 * googletagmanager.com — этот хост уже разрешён в `script-src`.
 */
(function () {
  var script = document.currentScript || document.querySelector("script[data-eterapy-ga-id]");
  var measurementId = script && script.getAttribute("data-eterapy-ga-id");
  if (!measurementId) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  gtag("js", new Date());

  var scrub = window.eterapyScrubAnalyticsUrl;
  // `page_location` задаётся явно: по умолчанию GA берёт настоящий адрес, а в
  // кабинете он несёт идентификаторы пользователя и разбора.
  gtag("config", measurementId, {
    page_location: scrub ? scrub(window.location.href) : window.location.origin,
    send_page_view: true,
  });
})();
