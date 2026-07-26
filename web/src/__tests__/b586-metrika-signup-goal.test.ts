/**
 * B586 (владелец 2026-07-26): «мне кажется что метрика не очень работает, потому
 * что у меня есть новый пользователь и даже регистрация от него, но нет ничего
 * по нему в метрике».
 *
 * Счётчик работает: за 15 дней в отчётах 14 визитов и 5 посетителей, `tag.js`
 * отдаётся, `mc.yandex.ru/watch/<id>` отвечает 302 (сам `/watch` без id — 404
 * всегда, это не признак поломки). Не работало ДРУГОЕ:
 *
 * 1. регистрации в счётчике не существовало как события — цели под неё не было,
 *    а автоцели Метрики ловят разметку форм, не наш клиентский submit;
 * 2. визит не был связан с человеком — без `setUserID` Метрика знает браузер, а
 *    не пользователя, поэтому «нет ничего по нему» было буквально верно.
 *
 * Тест держит оба конца: событие отправляется на регистрации (веб и мини-апп) и
 * счётчик умеет принять идентификатор пользователя.
 */
import fs from "node:fs";
import path from "node:path";
import { ANALYTICS_EVENT, ANALYTICS_IDENTIFY_EVENT, ANALYTICS_USER_ID_KEY, SIGNUP_GOAL, identifyAnalyticsUser, readAnalyticsUserId, reportAnalyticsGoal } from "@/lib/analytics-events";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("B586 — цель регистрации и идентификатор пользователя", () => {
  it("цель регистрации отправляется событием, которое слушает счётчик", () => {
    const detail: Array<Record<string, unknown>> = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) detail.push(event.detail);
    };
    window.addEventListener(ANALYTICS_EVENT, listener);
    reportAnalyticsGoal(SIGNUP_GOAL, { channel: "web" });
    window.removeEventListener(ANALYTICS_EVENT, listener);

    expect(detail).toEqual([{ event: "signup", channel: "web" }]);
  });

  it("идентификатор уходит отдельным событием и только как наш внутренний id", () => {
    const detail: Array<Record<string, unknown>> = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) detail.push(event.detail);
    };
    window.addEventListener(ANALYTICS_IDENTIFY_EVENT, listener);
    identifyAnalyticsUser("cms1lpzsm00040kt76vcj4dbp");
    identifyAnalyticsUser("");
    window.removeEventListener(ANALYTICS_IDENTIFY_EVENT, listener);

    expect(detail).toEqual([{ userId: "cms1lpzsm00040kt76vcj4dbp" }]);
  });

  it("личность не зависит от порядка подписки: значение лежит на window", () => {
    // ⚠ Найдено на живом проде: эффекты React идут снизу вверх, поэтому
    // <AnalyticsIdentity> (ребёнок) отправляет событие ДО того, как счётчик
    // (родитель в корневом layout) на него подпишется. Первая версия правки
    // из-за этого не вызывала setUserID ни разу. Событие осталось, но
    // источником истины стало значение.
    identifyAnalyticsUser("cms1lpzsm00040kt76vcj4dbp");
    expect(readAnalyticsUserId()).toBe("cms1lpzsm00040kt76vcj4dbp");
    expect((window as unknown as Record<string, string>)[ANALYTICS_USER_ID_KEY])
      .toBe("cms1lpzsm00040kt76vcj4dbp");
  });

  it("счётчик читает личность значением, а не только событием", () => {
    const analytics = read("src/components/analytics.tsx");
    expect(analytics).toContain("readAnalyticsUserId()");
  });

  it("личность уходит в счётчик из загрузчика, а не из эффекта компонента", () => {
    // ⚠ Вторая находка на живом проде: в момент, когда согласие получено,
    // `window.ym` ещё не существует (тег только начал грузиться), и
    // необязательный вызов `win.ym?.("setUserID", …)` молча ничего не делает —
    // в очереди `ym.a` были только `init` и `hit`. Поэтому личность передаётся
    // загрузчику атрибутом, и `setUserID` вызывается сразу после `init`.
    const analytics = read("src/components/analytics.tsx");
    expect(analytics).toContain("data-eterapy-user-id=");

    const loader = read("public/analytics/metrika.js");
    expect(loader).toContain('getAttribute("data-eterapy-user-id")');
    // Порядок обязателен: init → setUserID → hit.
    expect(loader.indexOf('"init"')).toBeLessThan(loader.indexOf('"setUserID"'));
    expect(loader.indexOf('"setUserID"')).toBeLessThan(loader.indexOf("function sendHit"));
  });

  it("счётчик вызывает setUserID и помнит id, пришедший до согласия на cookies", () => {
    const analytics = read("src/components/analytics.tsx");
    expect(analytics).toContain('"setUserID"');
    // Слушатель, который помнит id, обязан жить ВНЕ ветки согласия: до согласия
    // счётчика нет, и без запоминания идентификатор терялся бы навсегда.
    const rememberAt = analytics.indexOf("identifiedUserId.current = detail.userId");
    const consentGuardAt = analytics.indexOf("if (!consented) return;");
    expect(rememberAt).toBeGreaterThanOrEqual(0);
    expect(rememberAt).toBeLessThan(consentGuardAt);
  });

  it("обе точки регистрации — веб и мини-апп — отправляют цель", () => {
    expect(read("src/app/(auth)/register/page.tsx")).toContain("reportAnalyticsGoal(SIGNUP_GOAL");
    expect(read("src/components/miniapp/journey-screens.tsx")).toContain("reportAnalyticsGoal(SIGNUP_GOAL");
  });

  it("кабинет сообщает счётчику, чья это сессия", () => {
    expect(read("src/app/cabinet/layout.tsx")).toContain("<AnalyticsIdentity userId={session.user.id} />");
  });
});

describe("B586 — хит не уходит без вычищенного адреса", () => {
  const loader = read("public/analytics/metrika.js");

  it("ждёт загрузки правила вычистки, а не отправляет голый origin", () => {
    // Оба тега стоят afterInteractive, порядок не гарантирован. Когда загрузчик
    // выполнялся первым, адрес терял путь целиком: 6 просмотров из 37 за
    // 19–26 июля записаны на голый https://eterapy.com.
    expect(loader).toContain('script[src="/analytics/scrub.js"]');
    expect(loader).toContain('addEventListener("load", sendHit');
    expect(loader).toContain('addEventListener("error", sendHit');
  });

  it("резервный вариант — origin, а не настоящий адрес: в нём идентификаторы", () => {
    expect(loader).toContain("window.location.origin");
    // Прямая отправка window.location.href мимо вычистки — то, чего быть не должно.
    expect(loader).not.toMatch(/"hit",\s*window\.location\.href/);
  });
});
