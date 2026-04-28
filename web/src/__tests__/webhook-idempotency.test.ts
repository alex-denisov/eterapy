import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/webhook-idempotency";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    webhookEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

function uniqueError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("webhook idempotency ledger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("claims a new provider event before business logic runs", async () => {
    mockDb.webhookEvent.create.mockResolvedValue({
      id: "webhook-1",
      provider: "yookassa",
      eventId: "payment.succeeded:pay-1:succeeded",
      eventType: "payment.succeeded",
      resourceId: "pay-1",
      status: "PROCESSING",
      payload: null,
      result: null,
      error: null,
      requestId: "req-1",
      receivedAt: new Date("2026-04-28T09:00:00.000Z"),
      processedAt: null,
    });

    const result = await claimWebhookEvent({
      provider: "yookassa",
      eventId: "payment.succeeded:pay-1:succeeded",
      eventType: "payment.succeeded",
      resourceId: "pay-1",
      payload: { event: "payment.succeeded" },
      requestId: "req-1",
    });

    expect(result.claimed).toBe(true);
    expect(mockDb.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "yookassa",
        eventId: "payment.succeeded:pay-1:succeeded",
        status: "PROCESSING",
      }),
    });
  });

  it("deduplicates replayed provider events on unique constraint", async () => {
    mockDb.webhookEvent.create.mockRejectedValue(uniqueError());
    mockDb.webhookEvent.findUnique.mockResolvedValue({
      id: "webhook-1",
      provider: "telegram",
      eventId: "123",
      eventType: "/start",
      resourceId: "456",
      status: "PROCESSED",
      payload: null,
      result: null,
      error: null,
      requestId: null,
      receivedAt: new Date("2026-04-28T09:00:00.000Z"),
      processedAt: new Date("2026-04-28T09:00:01.000Z"),
    });

    const result = await claimWebhookEvent({
      provider: "telegram",
      eventId: "123",
      eventType: "/start",
      resourceId: "456",
    });

    expect(result).toEqual({ claimed: false });
  });

  it("reclaims failed provider events so provider retries can process again", async () => {
    mockDb.webhookEvent.create.mockRejectedValue(uniqueError());
    mockDb.webhookEvent.findUnique.mockResolvedValue({
      id: "webhook-failed",
      provider: "yookassa",
      eventId: "payment.succeeded:pay-1:succeeded",
      eventType: "payment.succeeded",
      resourceId: "pay-1",
      status: "FAILED",
      payload: null,
      result: null,
      error: "{\"message\":\"temporary failure\"}",
      requestId: "req-old",
      receivedAt: new Date("2026-04-28T09:00:00.000Z"),
      processedAt: new Date("2026-04-28T09:00:01.000Z"),
    });
    mockDb.webhookEvent.update.mockResolvedValue({
      id: "webhook-failed",
      provider: "yookassa",
      eventId: "payment.succeeded:pay-1:succeeded",
      eventType: "payment.succeeded",
      resourceId: "pay-1",
      status: "PROCESSING",
      payload: { event: "payment.succeeded" },
      result: null,
      error: null,
      requestId: "req-new",
      receivedAt: new Date("2026-04-28T09:00:00.000Z"),
      processedAt: null,
    });

    const result = await claimWebhookEvent({
      provider: "yookassa",
      eventId: "payment.succeeded:pay-1:succeeded",
      eventType: "payment.succeeded",
      resourceId: "pay-1",
      payload: { event: "payment.succeeded" },
      requestId: "req-new",
    });

    expect(result.claimed).toBe(true);
    expect(mockDb.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: "webhook-failed" },
      data: expect.objectContaining({
        status: "PROCESSING",
        error: null,
        result: Prisma.DbNull,
        requestId: "req-new",
        processedAt: null,
      }),
    });
  });

  it("marks webhook events processed or failed", async () => {
    mockDb.webhookEvent.update.mockResolvedValue({} as never);

    await completeWebhookEvent("webhook-1", { result: "credited" });
    await failWebhookEvent("webhook-2", new Error("provider down"));

    expect(mockDb.webhookEvent.update).toHaveBeenNthCalledWith(1, {
      where: { id: "webhook-1" },
      data: expect.objectContaining({
        status: "PROCESSED",
        result: { result: "credited" },
        processedAt: expect.any(Date),
      }),
    });
    expect(mockDb.webhookEvent.update).toHaveBeenNthCalledWith(2, {
      where: { id: "webhook-2" },
      data: expect.objectContaining({
        status: "FAILED",
        error: expect.stringContaining("provider down"),
        processedAt: expect.any(Date),
      }),
    });
  });
});
