/**
 * B568 — загрузчик Яндекс.Метрики без инлайнового тела.
 *
 * Раньше этот код жил инлайновым `<Script>` внутри компонента. Next добавляет
 * такой тег на клиенте после гидратации, серверный nonce до него не доходит, и
 * под nonce-политикой (кабинет, админка) браузер его резал — то есть в
 * кабинете счётчик не поднимался вовсе. Внешний файл со своего origin проходит
 * и nonce-политику (`'self'`), и публичную.
 *
 * Настройки приезжают data-атрибутами: файл статический, до `NEXT_PUBLIC_*`
 * ему не дотянуться.
 */
(function () {
  var script =
    document.currentScript || document.querySelector("script[data-eterapy-metrika-id]");
  var counterId = script && script.getAttribute("data-eterapy-metrika-id");
  if (!counterId) return;

  // Вебвизор пишет сам документ. На авторизованных поверхностях это дневник,
  // разборы и переписка — их отправлять наружу нельзя, поэтому запись
  // включается только там, где страница публичная.
  var webvisor = script.getAttribute("data-eterapy-webvisor") === "1";

  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) {
      if (document.scripts[j].src === r) return;
    }
    k = e.createElement(t);
    a = e.getElementsByTagName(t)[0];
    k.async = 1;
    k.src = r;
    a.parentNode.insertBefore(k, a);
  })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

  window.ym(counterId, "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: webvisor,
    ecommerce: "dataLayer",
    // Автоматический хит ушёл бы с настоящим адресом, включая идентификаторы.
    // Отправляем его сами — вычищенным.
    defer: true,
  });

  var scrub = window.eterapyScrubAnalyticsUrl;
  window.ym(counterId, "hit", scrub ? scrub(window.location.href) : window.location.origin);
})();
