/**
 * B599 · Гейты маркетинговой отправки.
 *
 * Приёмка тикета дословно: «Кризисный гейт закрыт тестом, а не соглашением».
 * Поэтому здесь проверяется не наличие условия в коде, а поведение — включая
 * случаи, где два запрета сталкиваются и важно, какой сильнее.
 */

import { MARKETING_EVENTS, findMarketingEvent } from "@/lib/marketing/events";
import {
  WEEKLY_TOUCH_CAP,
  isQuietHour,
  localHour,
  marketingDecision,
  nextMorning,
  type MarketingRecipientState,
} from "@/lib/marketing/gates";

const MSK = 180;

const allowed: MarketingRecipientState = {
  marketingConsentAt: new Date("2026-01-01T00:00:00Z"),
  marketingOptOutAt: null,
  crisisGuard: false,
  timezoneOffsetMinutes: MSK,
  touchesLast7Days: 0,
  lastSentForEventAt: null,
};

// 2026-07-27 12:00 UTC = 15:00 МСК — заведомо не ночь.
const NOON = new Date("2026-07-27T12:00:00Z");
const EVENT = { minDaysBetween: 14 };

const decide = (recipient: Partial<MarketingRecipientState>, now = NOON, featureEnabled = true) =>
  marketingDecision({ featureEnabled, event: EVENT, recipient: { ...allowed, ...recipient }, now });

describe("B599 · кому и когда уходит маркетинг", () => {
  it("при всех выполненных условиях — уходит", () => {
    expect(decide({})).toEqual({ allowed: true });
  });

  it("выключатель закрывает всё, даже полностью согласного человека", () => {
    expect(decide({}, NOON, false)).toEqual({ allowed: false, reason: "feature_disabled" });
  });

  it("кризис сильнее согласия — согласившийся в кризисе НЕ получает ничего", () => {
    expect(decide({ crisisGuard: true })).toEqual({ allowed: false, reason: "crisis_guard" });
  });

  it("отписка сильнее согласия, даже если согласие свежее", () => {
    expect(
      decide({
        marketingConsentAt: new Date("2026-07-20T00:00:00Z"),
        marketingOptOutAt: new Date("2026-07-01T00:00:00Z"),
      }),
    ).toEqual({ allowed: false, reason: "opted_out" });
  });

  it("без согласия не уходит ничего", () => {
    expect(decide({ marketingConsentAt: null })).toEqual({ allowed: false, reason: "no_consent" });
  });

  it("потолок недели считается по всем каналам разом", () => {
    expect(decide({ touchesLast7Days: WEEKLY_TOUCH_CAP })).toEqual({
      allowed: false,
      reason: "weekly_cap",
    });
    expect(decide({ touchesLast7Days: WEEKLY_TOUCH_CAP - 1 })).toEqual({ allowed: true });
  });

  it("повтор того же события ждёт своего срока и говорит, до какого момента", () => {
    const lastSentForEventAt = new Date("2026-07-20T12:00:00Z");
    const decision = decide({ lastSentForEventAt });
    expect(decision).toMatchObject({ allowed: false, reason: "event_cooldown" });
    expect((decision as { retryAfter: Date }).retryAfter.toISOString()).toBe(
      "2026-08-03T12:00:00.000Z",
    );
  });

  it("по истечении срока то же событие уходит снова", () => {
    expect(decide({ lastSentForEventAt: new Date("2026-07-01T12:00:00Z") })).toEqual({
      allowed: true,
    });
  });
});

describe("B599 · ночное окно считается по поясу человека, а не сервера", () => {
  it("23:00 и 05:59 по месту — ночь, 06:00 и 22:59 — нет", () => {
    expect(isQuietHour(new Date("2026-07-27T20:00:00Z"), MSK)).toBe(true); // 23:00 МСК
    expect(isQuietHour(new Date("2026-07-27T02:59:00Z"), MSK)).toBe(true); // 05:59 МСК
    expect(isQuietHour(new Date("2026-07-27T03:00:00Z"), MSK)).toBe(false); // 06:00 МСК
    expect(isQuietHour(new Date("2026-07-27T19:59:00Z"), MSK)).toBe(false); // 22:59 МСК
  });

  it("одно и то же мгновение — ночь во Владивостоке и день в Москве", () => {
    const moment = new Date("2026-07-27T14:00:00Z"); // 17:00 МСК, 00:00 VLAT
    expect(isQuietHour(moment, MSK)).toBe(false);
    expect(isQuietHour(moment, 600)).toBe(true);
    expect(localHour(moment, 600)).toBe(0);
  });

  it("ночью отправка откладывается до ближайших 06:00 по месту", () => {
    const night = new Date("2026-07-27T21:30:00Z"); // 00:30 МСК следующего дня
    const decision = decide({}, night);
    expect(decision).toMatchObject({ allowed: false, reason: "quiet_hours" });
    expect(nextMorning(night, MSK).toISOString()).toBe("2026-07-28T03:00:00.000Z");
  });
});

describe("B599 · матрица событий", () => {
  it("ключи уникальны — иначе журнал и потолок считали бы разные события одним", () => {
    const keys = MARKETING_EVENTS.map((event) => event.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("у каждого события есть канал, текст и объяснение, зачем оно человеку", () => {
    for (const event of MARKETING_EVENTS) {
      expect(event.channels.length).toBeGreaterThan(0);
      expect(event.subject.trim().length).toBeGreaterThan(0);
      expect(event.body.trim().length).toBeGreaterThan(0);
      expect(event.rationale.trim().length).toBeGreaterThan(20);
      expect(event.minDaysBetween).toBeGreaterThan(0);
    }
  });

  it("каждое тело письма ведёт куда-то — плейсхолдер действия обязателен", () => {
    for (const event of MARKETING_EVENTS) expect(event.body).toContain("{cta}");
  });

  it("findMarketingEvent находит по ключу и молчит на неизвестном", () => {
    expect(findMarketingEvent("POINTS_EXPIRING")?.category).toBe("points");
    expect(findMarketingEvent("НЕТ_ТАКОГО")).toBeUndefined();
  });
});
