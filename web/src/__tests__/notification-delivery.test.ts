import { JOB_HANDLERS } from "@/lib/job-worker";
import { notify } from "@/lib/notifications";
import {
  handleNotificationDeliveryJob,
  queueNotificationDelivery,
} from "@/lib/notification-delivery";
import { enqueueJob } from "@/lib/job-queue";
import { sendEmail } from "@/lib/email-send";
import { sendTelegram } from "@/lib/telegram";
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
  sendTelegram: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    notification: { create: jest.fn() },
    notificationPreference: { findUnique: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
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

function job(payload: unknown) {
  return {
    id: "job-1",
    payload,
    queue: "default",
    type: "notification.delivery",
    attempts: 1,
    maxAttempts: 3,
  } as never;
}

describe("notification delivery jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnqueueJob.mockResolvedValue({ id: "job-1" } as never);
    mockSendEmail.mockResolvedValue(undefined);
    mockSendTelegram.mockResolvedValue(undefined);
    (db.notification.create as jest.Mock).mockResolvedValue({});
  });

  it("registers a durable worker handler for notification deliveries", () => {
    expect(JOB_HANDLERS["notification.delivery"]).toBe(handleNotificationDeliveryJob);
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
      type: "notification.delivery",
      queue: "default",
      maxAttempts: 3,
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

  it("queues enabled channels from notify instead of sending inline", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      email: "user@example.com",
      name: "User",
      telegramId: "tg-1",
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
});
