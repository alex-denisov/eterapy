/**
 * B599 (батч №20) · Каталог событий целиком.
 *
 * Владелец просил не «дописать пару строк», а закрыть перечень: все рекламные
 * события платного контура плюс весь служебный список из кабинета, включая
 * письма, которых в кабинете нет вовсе (регистрация, сброс пароля, удаление
 * аккаунта).
 *
 * Прогон сторожит ровно те вещи, которые ломаются молча и наружу:
 *   — событие в матрице без обязательного поля уедет с дырой в тексте;
 *   — служебное событие, случайно попавшее в рекламную матрицу, начнёт
 *     спрашивать согласие и молчать у тех, кто рекламу не разрешал;
 *   — новое `NotifEvent` без описания момента отправки попадёт на экран
 *     приёмки без ответа на вопрос «когда это уходит».
 */

import {
  MARKETING_CATEGORY_LABELS,
  MARKETING_EVENTS,
  MARKETING_FIRE_LABELS,
  findMarketingEvent,
} from "@/lib/marketing/events";
import { ALL_EVENTS } from "@/lib/notification-events";
import {
  ACCOUNT_EVENTS,
  systemEventCatalog,
} from "@/lib/notifications/system-catalog";

describe("B599 · маркетинговая матрица", () => {
  it("закрывает платный контур, который просил владелец", () => {
    const keys = MARKETING_EVENTS.map((event) => event.key);
    for (const required of [
      "POINTS_DEPLETED_TOPUP", // апселл на покупку баллов
      "SUBSCRIPTION_OFFER_AFTER_PACKS", // покупка подписки
      "SUBSCRIPTION_UPGRADE_OFFER", // апселл на другую подписку
      "SUBSCRIPTION_RENEWAL_NUDGE", // продление подписки
      "SUBSCRIPTION_LAPSED_WINBACK",
      "PROMO_CAMPAIGN", // акции
      "NEW_SERVICE_ANNOUNCE",
      "LIBRARY_DIGEST",
      "REFERRAL_INVITE_NUDGE",
    ]) {
      expect(keys).toContain(required);
    }
  });

  it("у каждого события заполнены все поля приёмки", () => {
    for (const event of MARKETING_EVENTS) {
      expect(event.key).toMatch(/^[A-Z0-9_]+$/);
      expect(MARKETING_CATEGORY_LABELS[event.category]).toBeTruthy();
      expect(MARKETING_FIRE_LABELS[event.fire]).toBeTruthy();
      expect(event.audience.length).toBeGreaterThan(5);
      expect(event.trigger.length).toBeGreaterThan(10);
      expect(event.channels.length).toBeGreaterThan(0);
      expect(event.minDaysBetween).toBeGreaterThan(0);
      expect(event.subject.length).toBeGreaterThan(0);
      expect(event.body.length).toBeGreaterThan(20);
      // Обоснование — не украшение: на этом вопросе отсеялись кандидаты.
      expect(event.rationale.length).toBeGreaterThan(40);
    }
  });

  it("ключи уникальны и находятся по ключу", () => {
    const keys = MARKETING_EVENTS.map((event) => event.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(findMarketingEvent(key)?.key).toBe(key);
  });

  it("плейсхолдер в теме есть и в теле, если он несёт значение", () => {
    // Тема с `{points}` и тело без него означает письмо, где сумма названа в
    // заголовке и потеряна внутри.
    for (const event of MARKETING_EVENTS) {
      const subjectVars = [...event.subject.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const variable of subjectVars) {
        if (variable === "promoSubject") continue; // тема кампании целиком подставная
        expect(`${event.body}`).toContain(`{${variable}}`);
      }
    }
  });

  it("транзакционные события НЕ попали в рекламную матрицу", () => {
    // Реклама требует согласия и выключается отпиской. Чек об оплате — нет.
    const marketingKeys = new Set(MARKETING_EVENTS.map((event) => event.key));
    for (const transactional of [
      "SUBSCRIPTION_STARTED",
      "SUBSCRIPTION_RENEWAL",
      "PAYMENT_RECEIVED",
      "BALANCE_TOPUP",
      "PRODUCT_UNLOCKED",
      "BOOKING_CONFIRMED",
      "BOOKING_REMINDER",
    ]) {
      expect(marketingKeys.has(transactional)).toBe(false);
    }
  });
});

describe("B599 · служебный каталог", () => {
  it("содержит все события кабинета и все аккаунтные письма", () => {
    const catalog = systemEventCatalog();
    expect(catalog).toHaveLength(ALL_EVENTS.length + ACCOUNT_EVENTS.length);

    const keys = catalog.map((row) => row.key);
    for (const event of ALL_EVENTS) expect(keys).toContain(event.event);
    for (const required of [
      "ACCOUNT_EMAIL_VERIFY", // регистрация
      "ACCOUNT_PASSWORD_RESET", // запрос сброса пароля
      "ACCOUNT_DELETION_REQUESTED", // запрос удаления аккаунта
      "BOOKING_REQUESTED", // запись к практику
      "BOOKING_REMINDER", // приближающаяся запись
    ]) {
      expect(keys).toContain(required);
    }
  });

  it("у каждого события описан момент отправки, а не только название", () => {
    for (const row of systemEventCatalog()) {
      expect(row.trigger.length).toBeGreaterThan(10);
      expect(row.audience.length).toBeGreaterThan(3);
      expect(row.channels.length).toBeGreaterThan(0);
    }
  });

  it("аккаунтные письма не помечены отключаемыми", () => {
    // Выключить себе письмо сброса пароля — значит потерять доступ к аккаунту.
    for (const row of ACCOUNT_EVENTS) {
      expect(row.optional).toBe(false);
      expect(row.kind).toBe("account");
    }
    for (const row of systemEventCatalog().filter((r) => r.kind === "notify")) {
      expect(row.optional).toBe(true);
    }
  });

  it("ключи каталога уникальны", () => {
    const keys = systemEventCatalog().map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
