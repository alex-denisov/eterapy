/**
 * B700 фаза 3 — линия спит до дедлайна пула, а не плоские 30 минут.
 *
 * Что было. По сигналу `agent:capacity` плановая генерация замирала ровно на
 * `MARKETING_CAPACITY_COOLDOWN_MS` = 30 минут, кто бы и почему бы ни отказал.
 * Провайдер при этом называет свой срок прямо в теле отказа, и сроки разные на
 * четыре порядка — `cooldown.ts` (B699) их уже читает и хранит в `cooldownUntil`.
 *
 * Живой замер прода 2026-08-09 23:57 МСК, дословно из тела отказа Groq:
 *
 *   429 Rate limit reached … on tokens per day (TPD): Limit 200000,
 *   Used 199995 … Please try again in 59m14.928s
 *
 * Суточный потолок выжжен. Плоские 30 минут означают, что через полчаса линия
 * пойдёт ломиться в тот же исчерпанный ключ — и так дважды за каждый час
 * ожидания. Ровный расход при нуле публикаций — подпись именно этого
 * (`reference_flat_cooldown_feeds_the_shortage`).
 *
 * Требование владельца дословно: «Если какой-то провайдер выдает 429, то значит
 * что провайдеру или его конкретной модели нужно "остыть"».
 *
 * Границы, которые держит этот тест:
 *   1. дедлайн пула известен → линия ждёт ЕГО, даже если это дольше 30 минут;
 *   2. дедлайна нет → прежнее поведение, плоский срок;
 *   3. сигнала нет → паузы нет вовсе;
 *   4. просроченная пауза не держит линию;
 *   5. чужая дата не может усыпить линию навсегда.
 */

import {
  MARKETING_MAX_LINE_PAUSE_MS,
  marketingLinePauseUntil,
} from "@/lib/marketing/conveyor-tact";

const now = new Date("2026-08-09T21:00:00.000Z");
const flatCooldownMs = 30 * 60_000;

describe("B700 фаза 3 — пауза линии до дедлайна пула", () => {
  it("дедлайн пула известен — линия ждёт его, а не полчаса", () => {
    // Groq назвал 59m14s: возвращаться через 30 минут не к кому.
    const poolResumeAt = new Date("2026-08-09T21:59:14.000Z");

    const until = marketingLinePauseUntil({
      now,
      signalLastSeenAt: new Date("2026-08-09T20:57:24.000Z"),
      poolResumeAt,
      flatCooldownMs,
    });

    expect(until?.toISOString()).toBe(poolResumeAt.toISOString());
  });

  it("все ключи остывают до завтра — линия честно спит до завтра", () => {
    const poolResumeAt = new Date("2026-08-10T18:00:00.000Z");

    const until = marketingLinePauseUntil({
      now,
      signalLastSeenAt: new Date("2026-08-09T20:57:24.000Z"),
      poolResumeAt,
      flatCooldownMs,
    });

    expect(until?.toISOString()).toBe(poolResumeAt.toISOString());
    expect(until!.getTime() - now.getTime()).toBeGreaterThan(20 * 60 * 60_000);
  });

  it("дедлайн пула ближе плоского срока — линия просыпается раньше", () => {
    // Минутная квота Gemini: «retry in 49s». Ждать полчаса было бы простоем.
    const poolResumeAt = new Date("2026-08-09T21:00:49.000Z");

    const until = marketingLinePauseUntil({
      now,
      signalLastSeenAt: new Date("2026-08-09T21:00:00.000Z"),
      poolResumeAt,
      flatCooldownMs,
    });

    expect(until?.toISOString()).toBe(poolResumeAt.toISOString());
  });

  it("дедлайна пула нет — остаётся прежний плоский срок от сигнала", () => {
    const signalLastSeenAt = new Date("2026-08-09T20:50:00.000Z");

    const until = marketingLinePauseUntil({
      now,
      signalLastSeenAt,
      poolResumeAt: null,
      flatCooldownMs,
    });

    expect(until?.toISOString()).toBe(new Date("2026-08-09T21:20:00.000Z").toISOString());
  });

  it("сигнала нет — паузы нет, даже если ключи остывают", () => {
    const until = marketingLinePauseUntil({
      now,
      signalLastSeenAt: null,
      poolResumeAt: new Date("2026-08-10T18:00:00.000Z"),
      flatCooldownMs,
    });

    expect(until).toBeNull();
  });

  it("просроченный плоский срок не держит линию", () => {
    const until = marketingLinePauseUntil({
      now,
      signalLastSeenAt: new Date("2026-08-09T20:00:00.000Z"),
      poolResumeAt: null,
      flatCooldownMs,
    });

    expect(until).toBeNull();
  });

  it("прошедший дедлайн пула не держит линию", () => {
    const until = marketingLinePauseUntil({
      now,
      signalLastSeenAt: new Date("2026-08-09T20:58:00.000Z"),
      poolResumeAt: new Date("2026-08-09T20:59:00.000Z"),
      flatCooldownMs,
    });

    expect(until).toBeNull();
  });

  it("чужая дата не усыпляет линию дольше суток от отказа", () => {
    const signalLastSeenAt = new Date("2026-08-09T20:57:00.000Z");

    const until = marketingLinePauseUntil({
      now,
      signalLastSeenAt,
      poolResumeAt: new Date("2027-01-01T00:00:00.000Z"),
      flatCooldownMs,
    });

    expect(until!.getTime()).toBe(signalLastSeenAt.getTime() + MARKETING_MAX_LINE_PAUSE_MS);
  });
});
