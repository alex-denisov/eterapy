import { JOB_HANDLERS } from "@/lib/job-worker";
import { notify } from "@/lib/notifications";
import {
  handleNotificationDeliveryJob,
  NOTIFICATION_DELIVERY_JOB_TYPE,
  NOTIFICATION_DELIVERY_MAX_ATTEMPTS,
  queueNotificationDelivery,
} from "@/lib/notification-delivery";
import { enqueueJob } from "@/lib/job-queue";
import { sendEmail } from "@/lib/email-send";
import { getTelegramRuntimeConfig, sendTelegram } from "@/lib/telegram";
import { log } from "@/lib/logger";
import db from "@/lib/db";

jest.mock("@/lib/job-queue", () => ({
  __esModule: true,
  enqueueJob: jest.fn(),
  claimNextJob: jest.fn(),
  completeJob: jest.fn(),
  failJob: jest.fn(),
  releaseStaleJobs: jest.fn(),
}));

jest.mock("@/lib/email-send", () => ({
  __esModule: true,
  sendEmail: jest.fn(),
}));

jest.mock("@/lib/telegram", () => ({
  __esModule: true,
  getTelegramRuntimeConfig: jest.fn(() => ({
    configured: true,
    apiBaseHost: "tg-relay.example.com",
    usingRelay: true,
  })),
  sendTelegram: jest.fn(),
}));

// `db` экспортируется и по умолчанию, и по имени: журнал отправок (B599)
// импортирует именованный. Один объект на оба экспорта — иначе тест проверял
// бы не тот клиент, которым пользуется код.
jest.mock("@/lib/db", () => {
  const client = {
    notification: { create: jest.fn() },
    notificationDispatch: { create: jest.fn() },
    notificationPreference: { findUnique: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  return { __esModule: true, default: client, db: client };
});

jest.mock("@/lib/platform-settings", () => ({
  __esModule: true,
  getSetting: jest.fn().mockResolvedValue(""),
  setSetting: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  serializeError: jest.fn((err) => ({ message: err instanceof Error ? err.message : String(err) })),
}));

const mockEnqueueJob = enqueueJob as jest.MockedFunction<typeof enqueueJob>;
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockSendTelegram = sendTelegram as jest.MockedFunction<typeof sendTelegram>;
const mockGetTelegramRuntimeConfig = getTelegramRuntimeConfig as jest.MockedFunction<typeof getTelegramRuntimeConfig>;

function job(payload: unknown) {
  return {
    id: "job-1",
    payload,
    queue: "default",
    type: NOTIFICATION_DELIVERY_JOB_TYPE,
    attempts: 1,
    maxAttempts: 3,
  } as never;
}

describe("notification delivery jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnqueueJob.mockResolvedValue({ id: "job-1" } as never);
    mockSendEmail.mockResolvedValue({ subject: "тема", html: "<p>тело</p>", delivered: true });
    mockSendTelegram.mockResolvedValue(null);
    (db.notification.create as jest.Mock).mockResolvedValue({});
    (db.notificationDispatch.create as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("registers a durable worker handler for notification deliveries", () => {
    expect(JOB_HANDLERS[NOTIFICATION_DELIVERY_JOB_TYPE]).toBe(handleNotificationDeliveryJob);
  });

  it("queues notification delivery attempts as durable jobs", async () => {
    await queueNotificationDelivery({
      userId: "user-1",
      event: "BOOKING_CONFIRMED",
      channel: "EMAIL",
      data: { date: "29.04", time: "10:00" },
      recipient: { email: "user@example.com", name: "User" },
      requestId: "req-1",
    });

    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      type: NOTIFICATION_DELIVERY_JOB_TYPE,
      queue: "default",
      maxAttempts: NOTIFICATION_DELIVERY_MAX_ATTEMPTS,
      requestId: "req-1",
      payload: expect.objectContaining({
        userId: "user-1",
        event: "BOOKING_CONFIRMED",
        channel: "EMAIL",
      }),
    }));
  });

  it("sends email delivery jobs through the email adapter", async () => {
    await handleNotificationDeliveryJob(job({
      userId: "user-1",
      event: "BOOKING_CONFIRMED",
      channel: "EMAIL",
      data: { date: "29.04", time: "10:00" },
      recipient: { email: "user@example.com", name: "User" },
    }));

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "user@example.com",
      event: "BOOKING_CONFIRMED",
      data: { date: "29.04", time: "10:00" },
    }));
  });

  it("lets email adapter failures bubble to the worker retry policy", async () => {
    mockSendEmail.mockRejectedValueOnce(new Error("resend unavailable"));

    await expect(handleNotificationDeliveryJob(job({
      userId: "user-1",
      event: "BOOKING_CONFIRMED",
      channel: "EMAIL",
      data: { date: "29.04", time: "10:00" },
      recipient: { email: "user@example.com", name: "User" },
    }))).rejects.toThrow("resend unavailable");
  });

  it("persists web delivery jobs as in-cabinet notifications", async () => {
    await handleNotificationDeliveryJob(job({
      userId: "user-1",
      event: "BOOKING_CONFIRMED",
      channel: "WEB",
      data: { date: "29.04", time: "10:00" },
      recipient: { email: "user@example.com", name: "User" },
    }));

    expect(db.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        event: "BOOKING_CONFIRMED",
        title: "Запись подтверждена",
      }),
    });
  });

  it("logs Telegram relay diagnostics and retries through the worker policy on outage", async () => {
    mockSendTelegram.mockRejectedValueOnce(new Error("Telegram relay timeout"));

    await expect(handleNotificationDeliveryJob(job({
      userId: "user-1",
      event: "BOOKING_CONFIRMED",
      channel: "TELEGRAM",
      data: { date: "29.04", time: "10:00" },
      recipient: { email: "user@example.com", name: "User", telegramId: "tg-1" },
      requestId: "req-1",
    }))).rejects.toThrow("Telegram relay timeout");

    expect(mockGetTelegramRuntimeConfig).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith("notification-telegram-delivery-failed", expect.objectContaining({
      requestId: "req-1",
      jobId: "job-1",
      event: "BOOKING_CONFIRMED",
      userId: "user-1",
      telegram: {
        configured: true,
        apiBaseHost: "tg-relay.example.com",
        usingRelay: true,
      },
    }));
  });

  it("queues enabled channels from notify instead of sending inline", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      email: "user@example.com",
      name: "User",
      telegramId: "tg-1",
      timezone: "Europe/Moscow",
    });
    (db.notificationPreference.findUnique as jest.Mock).mockImplementation(({ where }) => {
      const channel = where.userId_event_channel.channel;
      return Promise.resolve({ enabled: channel !== "TELEGRAM" });
    });

    await notify({
      userId: "user-1",
      event: "BOOKING_CONFIRMED",
      data: { date: "29.04", time: "10:00" },
      requestId: "req-1",
    });

    expect(mockEnqueueJob).toHaveBeenCalledTimes(2);
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ channel: "EMAIL" }),
    }));
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ channel: "WEB" }),
    }));
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  it("does not queue email delivery when the user disabled the email preference", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      email: "user@example.com",
      name: "User",
      telegramId: null,
      timezone: "Europe/Moscow",
    });
    (db.notificationPreference.findUnique as jest.Mock).mockImplementation(({ where }) => {
      const channel = where.userId_event_channel.channel;
      return Promise.resolve({ enabled: channel === "WEB" });
    });

    await notify({
      userId: "user-1",
      event: "BOOKING_CONFIRMED",
      data: { date: "29.04", time: "10:00" },
      requestId: "req-1",
    });

    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ channel: "WEB" }),
    }));
  });

  it("passes notification dedupe keys through to durable delivery jobs per channel", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      email: "user@example.com",
      name: "User",
      telegramId: null,
      timezone: "Europe/Moscow",
    });
    (db.notificationPreference.findUnique as jest.Mock).mockImplementation(({ where }) => {
      const channel = where.userId_event_channel.channel;
      return Promise.resolve({ enabled: channel !== "TELEGRAM" });
    });

    await notify({
      userId: "user-1",
      event: "CREDITS_EXPIRING",
      data: { credits: "3", days: "2" },
      dedupeKey: "reactivation:CREDITS_EXPIRING:user-1:2026-06-06",
    });

    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "reactivation:CREDITS_EXPIRING:user-1:2026-06-06:EMAIL",
      payload: expect.objectContaining({ channel: "EMAIL" }),
    }));
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "reactivation:CREDITS_EXPIRING:user-1:2026-06-06:WEB",
      payload: expect.objectContaining({ channel: "WEB" }),
    }));
  });

  it("delays email and Telegram jobs during quiet hours while keeping web immediate", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-28T20:30:00.000Z").getTime());
    const { getSetting } = await import("@/lib/platform-settings");
    (getSetting as jest.Mock).mockResolvedValueOnce(JSON.stringify({
      enabled: true,
      from: "22:00",
      to: "09:00",
      timezone: "Europe/Moscow",
    }));
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      email: "user@example.com",
      name: "User",
      telegramId: "tg-1",
      timezone: "Europe/Moscow",
    });
    (db.notificationPreference.findUnique as jest.Mock).mockResolvedValue({ enabled: true });

    await notify({
      userId: "user-1",
      event: "BOOKING_CONFIRMED",
      data: { date: "29.04", time: "10:00" },
      requestId: "req-1",
    });

    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ channel: "EMAIL" }),
      runAfter: new Date("2026-04-29T06:00:00.000Z"),
    }));
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ channel: "TELEGRAM" }),
      runAfter: new Date("2026-04-29T06:00:00.000Z"),
    }));
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ channel: "WEB" }),
      runAfter: undefined,
    }));
  });
});
