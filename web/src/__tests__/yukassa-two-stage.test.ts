/**
 * Z1a — YooKassa two-stage (hold / capture / cancel) primitives.
 * The yukassa module reads creds at import time, so env must be set before the
 * dynamic import; fetch is mocked to assert the exact request shape.
 */
process.env.YUKASSA_SHOP_ID = "shop";
process.env.YUKASSA_SECRET_KEY = "secret";

type YK = typeof import("@/lib/yukassa");
let yk: YK;

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => body,
  text: async () => "",
});

function lastCall() {
  const calls = (global.fetch as jest.Mock).mock.calls;
  const [url, init] = calls[calls.length - 1];
  return { url: String(url), init, body: init?.body ? JSON.parse(init.body) : undefined };
}

beforeAll(async () => {
  yk = await import("@/lib/yukassa");
});

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("Z1a YooKassa two-stage primitives", () => {
  it("createTwoStagePayment holds funds (capture:false, redirect, hold-{bookingId})", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okJson({ id: "p1", status: "waiting_for_capture", paid: false, amount: { value: "9500.00", currency: "RUB" } }),
    );

    const res = await yk.createTwoStagePayment({
      amountKopecks: 950_000,
      bookingId: "b1",
      returnUrl: "https://app.example/return",
      description: "Сессия",
    });

    expect(res.status).toBe("waiting_for_capture");
    const { url, init, body } = lastCall();
    expect(url).toContain("/payments");
    expect(init.method).toBe("POST");
    expect(body.capture).toBe(false);
    expect(body.confirmation).toEqual({ type: "redirect", return_url: "https://app.example/return" });
    expect(body.amount).toEqual({ value: "9500.00", currency: "RUB" });
    expect(body.metadata).toEqual({ bookingId: "b1", kind: "session_hold" });
    expect(init.headers["Idempotence-Key"]).toBe("hold-b1");
  });

  it("createTwoStagePaymentFromSavedMethod holds on a saved card (no redirect)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okJson({ id: "p2", status: "waiting_for_capture", paid: false, amount: { value: "9500.00", currency: "RUB" } }),
    );

    await yk.createTwoStagePaymentFromSavedMethod({
      amountKopecks: 950_000,
      bookingId: "b2",
      paymentMethodId: "pm-1",
      customerId: "user-1",
      description: "Сессия",
    });

    const { body, init } = lastCall();
    expect(body.capture).toBe(false);
    expect(body.payment_method_id).toBe("pm-1");
    expect(body.customer_id).toBe("user-1");
    expect(body.confirmation).toBeUndefined();
    expect(init.headers["Idempotence-Key"]).toBe("hold-b2");
  });

  it("capturePayment captures full amount by default", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okJson({ id: "p1", status: "succeeded", paid: true, amount: { value: "9500.00", currency: "RUB" } }),
    );

    const res = await yk.capturePayment("p1");

    expect(res.status).toBe("succeeded");
    const { url, init, body } = lastCall();
    expect(url).toContain("/payments/p1/capture");
    expect(init.method).toBe("POST");
    expect(body).toEqual({}); // full capture → no amount
    expect(init.headers["Idempotence-Key"]).toBe("capture-p1");
  });

  it("capturePayment supports partial capture", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okJson({ id: "p1", status: "succeeded", paid: true, amount: { value: "5000.00", currency: "RUB" } }),
    );

    await yk.capturePayment("p1", 500_000);

    const { body } = lastCall();
    expect(body.amount).toEqual({ value: "5000.00", currency: "RUB" });
  });

  it("cancelPayment releases the hold (no charge)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okJson({ id: "p1", status: "canceled", paid: false, amount: { value: "9500.00", currency: "RUB" } }),
    );

    const res = await yk.cancelPayment("p1");

    expect(res.status).toBe("canceled");
    const { url, init } = lastCall();
    expect(url).toContain("/payments/p1/cancel");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotence-Key"]).toBe("cancel-p1");
  });
});
