import { cardPaymentAvailable } from "@/lib/payments/config";

/**
 * B554 (owner 2026-07-21): экраны оплаты в мини-аппе печатали «оплата картой
 * появится скоро» ЖЁСТКО, текстом в разметке. После подключения Robokassa эта
 * фраза становится ложью, но переписать её на «оплатить» тоже нельзя вслепую:
 * если на сервере нет кредов, кнопка увела бы человека в 500.
 *
 * Поэтому копия зависит от РЕАЛЬНОЙ готовности рельса, а не от даты релиза.
 */
describe("B423/B554 — доступность оплаты картой", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  function clearRobokassa() {
    delete process.env.ROBOKASSA_MERCHANT_LOGIN;
    delete process.env.ROBOKASSA_PASSWORD_1;
    delete process.env.ROBOKASSA_PASSWORD_2;
    delete process.env.ROBOKASSA_TEST_PASSWORD_1;
    delete process.env.ROBOKASSA_TEST_PASSWORD_2;
    delete process.env.ROBOKASSA_IS_TEST;
  }

  it("выключена, пока провайдер robokassa, но кредов на сервере нет", () => {
    clearRobokassa();
    process.env.PAYMENT_PROVIDER = "robokassa";
    expect(cardPaymentAvailable()).toBe(false);
  });

  it("включается, когда у боевого robokassa есть логин и оба пароля", () => {
    clearRobokassa();
    process.env.PAYMENT_PROVIDER = "robokassa";
    process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
    process.env.ROBOKASSA_PASSWORD_1 = "p1";
    process.env.ROBOKASSA_PASSWORD_2 = "p2";
    expect(cardPaymentAvailable()).toBe(true);
  });

  it("в тестовом режиме смотрит на ТЕСТОВУЮ пару паролей", () => {
    clearRobokassa();
    process.env.PAYMENT_PROVIDER = "robokassa";
    process.env.ROBOKASSA_IS_TEST = "1";
    process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
    // Боевые пароли в тестовом режиме не годятся — Robokassa вернёт ошибку 29.
    process.env.ROBOKASSA_PASSWORD_1 = "p1";
    process.env.ROBOKASSA_PASSWORD_2 = "p2";
    expect(cardPaymentAvailable()).toBe(false);

    process.env.ROBOKASSA_TEST_PASSWORD_1 = "t1";
    process.env.ROBOKASSA_TEST_PASSWORD_2 = "t2";
    expect(cardPaymentAvailable()).toBe(true);
  });

  it("на YooKassa зависит от её собственных кредов", () => {
    clearRobokassa();
    process.env.PAYMENT_PROVIDER = "yookassa";
    delete process.env.YUKASSA_SHOP_ID;
    delete process.env.YUKASSA_SECRET_KEY;
    expect(cardPaymentAvailable()).toBe(false);

    process.env.YUKASSA_SHOP_ID = "shop";
    process.env.YUKASSA_SECRET_KEY = "secret";
    expect(cardPaymentAvailable()).toBe(true);
  });

  it("никогда не бросает исключение — это опрос, а не требование", () => {
    clearRobokassa();
    delete process.env.PAYMENT_PROVIDER;
    expect(() => cardPaymentAvailable()).not.toThrow();
  });
});
