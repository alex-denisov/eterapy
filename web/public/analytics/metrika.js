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

  // B586: кто это. Вызов стоит здесь, а не в компоненте, по простой причине:
  // компонент выполняет свой эффект, когда этого файла ещё нет, и `window.ym`
  // не определён — необязательный вызов `win.ym?.(…)` в этот момент молча
  // ничего не делает (проверено на проде: в очереди `ym.a` были только `init` и
  // `hit`). Здесь очередь уже создана, порядок гарантирован.
  //
  // Уходит только внутренний cuid — ни почты, ни имени.
  var userId = script.getAttribute("data-eterapy-user-id");
  if (userId) window.ym(counterId, "setUserID", userId);

  // B586: правило вычистки грузится отдельным файлом, и оба тега стоят
  // `afterInteractive` — то есть порядок их выполнения НЕ гарантирован. Когда
  // этот файл выполнялся первым, `eterapyScrubAnalyticsUrl` ещё не было, и хит
  // уходил на резервный `window.location.origin`, теряя путь целиком: в отчётах
  // за 19–26 июля 6 просмотров из 37 записаны на голый `https://eterapy.com`
  // без страницы. Данные не утекали, но и не считались.
  //
  // Поэтому ждём загрузки правила и только потом отправляем хит. Резервный
  // вариант остаётся ровно для того, для чего он и нужен: правило не загрузилось
  // вообще. Отправить настоящий адрес без вычистки нельзя — в нём
  // идентификаторы.
  function sendHit() {
    var scrub = window.eterapyScrubAnalyticsUrl;
    window.ym(counterId, "hit", scrub ? scrub(window.location.href) : window.location.origin);
  }

  if (window.eterapyScrubAnalyticsUrl) {
    sendHit();
  } else {
    var scrubTag = document.querySelector('script[src="/analytics/scrub.js"]');
    if (!scrubTag) {
      sendHit();
    } else {
      scrubTag.addEventListener("load", sendHit, { once: true });
      scrubTag.addEventListener("error", sendHit, { once: true });
    }
  }
})();
