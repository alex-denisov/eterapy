import {
  activePaymentProvider,
  cardPaymentAvailable,
  contourForcesTestPayments,
  isRobokassaTestPayer,
  robokassaConfig,
} from "@/lib/payments/config";

/**
 * B570/B571 (owner 2026-07-22): «Переключай всё полностью на robokassa и
 * отключай Юкассу навсегда» + «в суперадминке я хочу назначать конкретным
 * пользователям признак „тестовые платежи“, чтобы они тестировали на тестовых
 * ключах, но платформа отрабатывала эти платежи и зачисляла баллы/подписки».
 *
 * Глобальный `ROBOKASSA_IS_TEST=1` на проде не годится: тестовую кассу увидел бы
 * любой посетитель и забрал товар, не заплатив (на проде за 14 дней 11 живых
 * регистраций). Поэтому режим — признак у пользователя, снимаемый суперадмином.
 */
describe("B570/B571 — рельс только Robokassa + признак «тестовые платежи»", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  function clean() {
    for (const key of [
      "ROBOKASSA_MERCHANT_LOGIN",
      "ROBOKASSA_PASSWORD_1",
      "ROBOKASSA_PASSWORD_2",
      "ROBOKASSA_TEST_PASSWORD_1",
      "ROBOKASSA_TEST_PASSWORD_2",
      "ROBOKASSA_IS_TEST",
      "PAYMENT_PROVIDER",
    ]) {
      delete process.env[key];
    }
  }

  function withBothPairs() {
    process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
    process.env.ROBOKASSA_PASSWORD_1 = "prod1";
    process.env.ROBOKASSA_PASSWORD_2 = "prod2";
    process.env.ROBOKASSA_TEST_PASSWORD_1 = "test1";
    process.env.ROBOKASSA_TEST_PASSWORD_2 = "test2";
  }

  describe("ЮKassa отключена навсегда", () => {
    it("провайдер — robokassa, даже когда переменная не выставлена", () => {
      clean();
      expect(activePaymentProvider()).toBe("robokassa");
    });

    it("PAYMENT_PROVIDER=yookassa больше не возвращает нас на старый рельс", () => {
      clean();
      process.env.PAYMENT_PROVIDER = "yookassa";
      expect(activePaymentProvider()).toBe("robokassa");
    });
  });

  describe("кого считать тестовым плательщиком", () => {
    it("обычный пользователь платит боевыми", () => {
      clean();
      expect(isRobokassaTestPayer({ testPaymentsEnabled: false })).toBe(false);
    });

    it("пользователь с признаком — тестовыми", () => {
      clean();
      expect(isRobokassaTestPayer({ testPaymentsEnabled: true })).toBe(true);
    });

    it("нет пользователя — БОЕВОЙ режим, а не тестовый", () => {
      // Умолчание решает, кто платит настоящими деньгами. Ошибиться здесь в
      // сторону «тест» значит раздать товар даром.
      clean();
      expect(isRobokassaTestPayer(null)).toBe(false);
      expect(isRobokassaTestPayer(undefined)).toBe(false);
      expect(isRobokassaTestPayer({})).toBe(false);
      expect(isRobokassaTestPayer({ testPaymentsEnabled: null })).toBe(false);
    });

    it("глобальный флаг переводит в тест ВЕСЬ контур — это про стейдж", () => {
      clean();
      process.env.ROBOKASSA_IS_TEST = "1";
      expect(contourForcesTestPayments()).toBe(true);
      expect(isRobokassaTestPayer({ testPaymentsEnabled: false })).toBe(true);
      expect(isRobokassaTestPayer(null)).toBe(true);
    });
  });

  describe("подпись идёт паролями своего режима", () => {
    it("боевой плательщик — боевая пара", () => {
      clean();
      withBothPairs();
      const config = robokassaConfig({ testMode: false });
      expect(config.isTest).toBe(false);
      expect(config.password1).toBe("prod1");
      expect(config.password2).toBe("prod2");
    });

    it("тестовый плательщик — тестовая пара (боевые дают ошибку 29)", () => {
      clean();
      withBothPairs();
      const config = robokassaConfig({ testMode: true });
      expect(config.isTest).toBe(true);
      expect(config.password1).toBe("test1");
      expect(config.password2).toBe("test2");
    });

    it("без аргумента — боевой режим", () => {
      clean();
      withBothPairs();
      expect(robokassaConfig().isTest).toBe(false);
    });

    it("на стейдже без аргумента — тестовый, так велит контур", () => {
      clean();
      withBothPairs();
      process.env.ROBOKASSA_IS_TEST = "1";
      expect(robokassaConfig().isTest).toBe(true);
    });
  });

  describe("готовность рельса считается для режима плательщика", () => {
    it("боевой готов от боевой пары, даже когда тестовой нет", () => {
      clean();
      process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
      process.env.ROBOKASSA_PASSWORD_1 = "prod1";
      process.env.ROBOKASSA_PASSWORD_2 = "prod2";
      expect(cardPaymentAvailable()).toBe(true);
      expect(cardPaymentAvailable({ testMode: false })).toBe(true);
    });

    it("тестовый плательщик без тестовой пары рельс не получает", () => {
      clean();
      process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
      process.env.ROBOKASSA_PASSWORD_1 = "prod1";
      process.env.ROBOKASSA_PASSWORD_2 = "prod2";
      expect(cardPaymentAvailable({ testMode: true })).toBe(false);

      process.env.ROBOKASSA_TEST_PASSWORD_1 = "test1";
      process.env.ROBOKASSA_TEST_PASSWORD_2 = "test2";
      expect(cardPaymentAvailable({ testMode: true })).toBe(true);
    });
  });
});
