import type { NextRequest } from "next/server";
import { applyPaymentResult } from "@/lib/billing-credit";
import { sendTelegram } from "@/lib/telegram";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
} from "@/lib/webhook-idempotency";
import { POST as yookassaWebhook } from "@/app/api/billing/yookassa-webhook/route";
import { POST as telegramWebhook } from "@/app/api/telegram/webhook/route";

jest.mock("@/lib/billing-credit", () => ({
  __esModule: true,
  applyPaymentResult: jest.fn(),
}));

jest.mock("@/lib/telegram", () => ({
  __esModule: true,
  sendTelegram: jest.fn(),
}));

jest.mock("@/lib/webhook-idempotency", () => ({
  __esModule: true,
  claimWebhookEvent: jest.fn(),
  completeWebhookEvent: jest.fn(),
  failWebhookEvent: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    telegramLinkToken: { findUnique: jest.fn(), delete: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockApplyPaymentResult = applyPaymentResult as jest.MockedFunction<typeof applyPaymentResult>;
const mockSendTelegram = sendTelegram as jest.MockedFunction<typeof sendTelegram>;
const mockClaimWebhookEvent = claimWebhookEvent as jest.MockedFunction<typeof claimWebhookEvent>;
const mockCompleteWebhookEvent = completeWebhookEvent as jest.MockedFunction<typeof completeWebhookEvent>;
const mockFailWebhookEvent = failWebhookEvent as jest.MockedFunction<typeof failWebhookEvent>;

const ORIGINAL_ENV = { ...process.env };

function request(url: string, body: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function yookassaAuth(shopId = "shop", secret = "secret") {
  return `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`;
}

describe("webhook route hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = "test";
    mockClaimWebhookEvent.mockResolvedValue({
      claimed: true,
      event: {
        id: "webhook-1",
        provider: "yookassa",
        eventId: "event-1",
        eventType: "payment.succeeded",
        resourceId: "payment-1",
        status: "PROCESSING",
        payload: null,
        result: null,
        error: null,
        requestId: "req-1",
        receivedAt: new Date(),
        processedAt: null,
      },
    });
    mockCompleteWebhookEvent.mockResolvedValue(undefined);
    mockFailWebhookEvent.mockResolvedValue(undefined);
    mockApplyPaymentResult.mockResolvedValue("credited");
    mockSendTelegram.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("rejects YooKassa webhook requests without valid Basic auth", async () => {
    process.env.YUKASSA_SHOP_ID = "shop";
    process.env.YUKASSA_SECRET_KEY = "secret";

    const response = await yookassaWebhook(request("https://app.eterapy.com/api/billing/yookassa-webhook", {
      event: "payment.succeeded",
      object: { id: "payment-1", status: "succeeded" },
    }));

    expect(response.status).toBe(401);
    expect(mockClaimWebhookEvent).not.toHaveBeenCalled();
    expect(mockApplyPaymentResult).not.toHaveBeenCalled();
  });

  it("deduplicates replayed YooKassa events before applying credit logic", async () => {
    process.env.YUKASSA_SHOP_ID = "shop";
    process.env.YUKASSA_SECRET_KEY = "secret";
    mockClaimWebhookEvent.mockResolvedValueOnce({ claimed: false });

    const response = await yookassaWebhook(request(
      "https://app.eterapy.com/api/billing/yookassa-webhook",
      { event: "payment.succeeded", object: { id: "payment-1", status: "succeeded" } },
      { authorization: yookassaAuth() },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ ok: true, duplicate: true }));
    expect(mockApplyPaymentResult).not.toHaveBeenCalled();
  });

  it("records successful YooKassa webhook processing", async () => {
    process.env.YUKASSA_SHOP_ID = "shop";
    process.env.YUKASSA_SECRET_KEY = "secret";

    const response = await yookassaWebhook(request(
      "https://app.eterapy.com/api/billing/yookassa-webhook",
      { event: "payment.succeeded", object: { id: "payment-1", status: "succeeded", paid: true } },
      { authorization: yookassaAuth() },
    ));

    expect(response.status).toBe(200);
    expect(mockClaimWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: "yookassa",
      eventId: "payment.succeeded:payment-1:succeeded",
      resourceId: "payment-1",
    }));
    expect(mockApplyPaymentResult).toHaveBeenCalledWith(expect.objectContaining({
      id: "payment-1",
      status: "succeeded",
      paid: true,
    }));
    expect(mockCompleteWebhookEvent).toHaveBeenCalledWith("webhook-1", { result: "credited" });
  });

  it("fails closed when Telegram webhook secret is missing in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    const response = await telegramWebhook(request("https://app.eterapy.com/api/telegram/webhook", {
      update_id: 100,
      message: { text: "/status", date: 1, chat: { id: 10 } },
    }));

    expect(response.status).toBe(503);
    expect(mockClaimWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects Telegram webhook requests with a wrong secret token", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "secret";

    const response = await telegramWebhook(request(
      "https://app.eterapy.com/api/telegram/webhook",
      { update_id: 100, message: { text: "/status", date: 1, chat: { id: 10 } } },
      { "x-telegram-bot-api-secret-token": "wrong" },
    ));

    expect(response.status).toBe(401);
    expect(mockClaimWebhookEvent).not.toHaveBeenCalled();
  });

  it("deduplicates Telegram updates before command side effects", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "secret";
    mockClaimWebhookEvent.mockResolvedValueOnce({ claimed: false });

    const response = await telegramWebhook(request(
      "https://app.eterapy.com/api/telegram/webhook",
      { update_id: 100, message: { text: "/status", date: 1, chat: { id: 10 } } },
      { "x-telegram-bot-api-secret-token": "secret" },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, duplicate: true });
    expect(mockSendTelegram).not.toHaveBeenCalled();
    expect(mockCompleteWebhookEvent).not.toHaveBeenCalled();
  });
});
