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
import { ANALYTICS_EVENT, ANALYTICS_IDENTIFY_EVENT, SIGNUP_GOAL, identifyAnalyticsUser, reportAnalyticsGoal } from "@/lib/analytics-events";

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
