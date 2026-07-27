/**
 * B599 · Отправка: журнал пишется ВСЕГДА, выключатель по умолчанию закрыт.
 *
 * Приёмка тикета: «Ни одно маркетинговое сообщение не уходит без согласия и без
 * ссылки на отписку» и «в журнале видно… что именно ушло». Оба утверждения
 * проверяются здесь поведением, а не чтением исходника.
 */

import {
  marketingNotificationsEnabled,
  renderTemplate,
  sendMarketingMessage,
  timezoneOffsetMinutes,
} from "@/lib/marketing/dispatch";

const created: Array<Record<string, unknown>> = [];
const state = {
  user: {
    marketingConsentAt: new Date("2026-01-01T00:00:00Z") as Date | null,
    marketingOptOutAt: null as Date | null,
    timezone: "Europe/Moscow",
  } as Record<string, unknown> | null,
  safetyLevel: null as string | null,
  touches: 0,
  lastForEvent: null as { sentAt: Date } | null,
};

jest.mock("@/lib/db", () => {
  const db = {
    user: { findUnique: async () => state.user },
    dialogue: { findFirst: async () => (state.safetyLevel ? { safetyLevel: state.safetyLevel } : null) },
    marketingDispatch: {
      count: async () => state.touches,
      findFirst: async () => state.lastForEvent,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
    },
  };
  return { __esModule: true, db, default: db };
});

const NOON = new Date("2026-07-27T12:00:00Z"); // 15:00 МСК

beforeEach(() => {
  created.length = 0;
  state.user = {
    marketingConsentAt: new Date("2026-01-01T00:00:00Z"),
    marketingOptOutAt: null,
    timezone: "Europe/Moscow",
  };
  state.safetyLevel = null;
  state.touches = 0;
  state.lastForEvent = null;
  delete process.env.MARKETING_NOTIFICATIONS;
});

describe("B599 · выключатель", () => {
  it("по умолчанию выключен — матрица едет на прод раньше приёмки", () => {
    expect(marketingNotificationsEnabled({})).toBe(false);
    expect(marketingNotificationsEnabled({ MARKETING_NOTIFICATIONS: "0" })).toBe(false);
    expect(marketingNotificationsEnabled({ MARKETING_NOTIFICATIONS: "1" })).toBe(true);
    expect(marketingNotificationsEnabled({ MARKETING_NOTIFICATIONS: "true" })).toBe(true);
  });
});

describe("B599 · отправка", () => {
  it("при выключенной рассылке НЕ доставляет, но пишет отказ в журнал", async () => {
    const deliver = jest.fn();
    const result = await sendMarketingMessage({
      userId: "u1",
      eventKey: "POINTS_EXPIRING",
      values: { name: "Алексей", points: "500 баллов", date: "10 августа", cta: "Открыть" },
      now: NOON,
      deliver,
    });

    expect(result).toEqual({ status: "blocked", reason: "feature_disabled" });
    expect(deliver).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: "blocked", blockedBy: "feature_disabled" });
    // Тела у незаоправленного сообщения нет — иначе журнал показывал бы текст,
    // которого человек не получал.
    expect(created[0].body).toBeUndefined();
  });

  it("человеку в кризисе не уходит ничего, и это видно в журнале", async () => {
    process.env.MARKETING_NOTIFICATIONS = "1";
    state.safetyLevel = "crisis";
    const deliver = jest.fn();

    const result = await sendMarketingMessage({
      userId: "u1",
      eventKey: "RESULT_READY_NO_DEEPENING",
      values: { name: "Алексей", service: "Разбор", cta: "Открыть" },
      now: NOON,
      deliver,
    });

    expect(result).toEqual({ status: "blocked", reason: "crisis_guard" });
    expect(deliver).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({ blockedBy: "crisis_guard" });
  });

  it("при включённой рассылке доставляет и сохраняет ТЕКСТ, который ушёл", async () => {
    process.env.MARKETING_NOTIFICATIONS = "1";
    const deliver = jest.fn(async () => undefined);

    const result = await sendMarketingMessage({
      userId: "u1",
      eventKey: "POINTS_EXPIRING",
      values: { name: "Алексей", points: "500 баллов", date: "10 августа", cta: "Открыть кабинет" },
      now: NOON,
      deliver,
    });

    expect(result).toEqual({ status: "sent" });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(created[0]).toMatchObject({ status: "sent", channel: "telegram", category: "points" });
    expect(created[0].subject).toBe("500 баллов сгорают 10 августа");
    expect(String(created[0].body)).toContain("Алексей");
    expect(String(created[0].body)).toContain("Открыть кабинет");
    expect(String(created[0].body)).not.toContain("{");
  });

  it("падение доставки не теряется — статус failed и текст ошибки в журнале", async () => {
    process.env.MARKETING_NOTIFICATIONS = "1";
    const result = await sendMarketingMessage({
      userId: "u1",
      eventKey: "POINTS_EXPIRING",
      values: { name: "Алексей", points: "500 баллов", date: "10 августа", cta: "Открыть" },
      now: NOON,
      deliver: async () => {
        throw new Error("telegram 429");
      },
    });

    expect(result).toMatchObject({ status: "failed" });
    expect(created[0]).toMatchObject({ status: "failed", error: "telegram 429" });
  });

  it("неизвестное событие не создаёт записи и не шлёт ничего", async () => {
    process.env.MARKETING_NOTIFICATIONS = "1";
    const result = await sendMarketingMessage({
      userId: "u1",
      eventKey: "НЕТ_ТАКОГО",
      values: {},
      now: NOON,
    });
    expect(result).toMatchObject({ status: "failed", reason: "unknown_event" });
    expect(created).toHaveLength(0);
  });
});

describe("B599 · вспомогательное", () => {
  it("подстановка не оставляет мусора, а незаполненный плейсхолдер видно", () => {
    expect(renderTemplate("Привет, {name}!", { name: "Алексей" })).toBe("Привет, Алексей!");
    expect(renderTemplate("Привет, {name}!", {})).toBe("Привет, {name}!");
  });

  it("пояс считается по имени зоны, без пояса — МСК", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    expect(timezoneOffsetMinutes("Europe/Moscow", now)).toBe(180);
    expect(timezoneOffsetMinutes("Asia/Vladivostok", now)).toBe(600);
    expect(timezoneOffsetMinutes(null, now)).toBe(180);
    expect(timezoneOffsetMinutes("Не/Зона", now)).toBe(180);
  });
});
