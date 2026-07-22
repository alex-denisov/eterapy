import {
  activePaymentProvider,
  cardPaymentAvailable,
  isRobokassaTestPayer,
  robokassaConfig,
} from "@/lib/payments/config";

/**
 * B570 (owner 2026-07-22): «Переключай всё полностью на robokassa и отключай
 * Юкассу навсегда. Не забудь, что я хочу протестировать платёжный флоу
 * полностью на проде, но с тестовыми платежами.»
 *
 * Два требования конфликтуют, если делать их в лоб. Глобальный
 * `ROBOKASSA_IS_TEST=1` на проде означает, что ЛЮБОЙ посетитель попадает на
 * тестовую кассу и получает товар, не заплатив. На проде за 14 дней
 * зарегистрировались 11 живых людей — окно открыто ровно столько, сколько идёт
 * проверка.
 *
 * Поэтому тестовый режим адресный: он включается для перечисленных плательщиков
 * (владелец и тестовые аккаунты), а всем остальным выставляется боевая касса.
 * Глобальный флаг остаётся — им переводится в тест ЦЕЛЫЙ контур (стейдж).
 */
describe("B570 — рельс только Robokassa + адресный тестовый режим", () => {
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
      "ROBOKASSA_TEST_EMAILS",
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
    it("никого, пока список пуст и глобальный флаг снят", () => {
      clean();
      expect(isRobokassaTestPayer("alexey_s_denisov@vk.com")).toBe(false);
      expect(isRobokassaTestPayer(undefined)).toBe(false);
    });

    it("перечисленного в ROBOKASSA_TEST_EMAILS", () => {
      clean();
      process.env.ROBOKASSA_TEST_EMAILS = "owner@vk.com, admin@test.eterapy.com";
      expect(isRobokassaTestPayer("owner@vk.com")).toBe(true);
      expect(isRobokassaTestPayer("admin@test.eterapy.com")).toBe(true);
    });

    it("сверяет почту без учёта регистра и краевых пробелов", () => {
      clean();
      process.env.ROBOKASSA_TEST_EMAILS = "Owner@VK.com";
      expect(isRobokassaTestPayer("  owner@vk.COM ")).toBe(true);
    });

    it("НЕ распространяет тестовый режим на постороннего", () => {
      clean();
      process.env.ROBOKASSA_TEST_EMAILS = "owner@vk.com";
      expect(isRobokassaTestPayer("stranger@example.com")).toBe(false);
      // Аноним платит боевыми: подставить чужую почту в форму нельзя, она
      // приходит из сессии, но пустая почта не должна открывать тестовую кассу.
      expect(isRobokassaTestPayer(null)).toBe(false);
    });

    it("глобальный флаг переводит в тест ВЕСЬ контур — это про стейдж", () => {
      clean();
      process.env.ROBOKASSA_IS_TEST = "1";
      expect(isRobokassaTestPayer("stranger@example.com")).toBe(true);
      expect(isRobokassaTestPayer(undefined)).toBe(true);
    });
  });

  describe("подпись идёт паролями своего режима", () => {
    it("боевой плательщик — боевая пара", () => {
      clean();
      withBothPairs();
      process.env.ROBOKASSA_TEST_EMAILS = "owner@vk.com";
      const config = robokassaConfig({ payerEmail: "stranger@example.com" });
      expect(config.isTest).toBe(false);
      expect(config.password1).toBe("prod1");
      expect(config.password2).toBe("prod2");
    });

    it("тестовый плательщик — тестовая пара (боевые дают ошибку 29)", () => {
      clean();
      withBothPairs();
      process.env.ROBOKASSA_TEST_EMAILS = "owner@vk.com";
      const config = robokassaConfig({ payerEmail: "owner@vk.com" });
      expect(config.isTest).toBe(true);
      expect(config.password1).toBe("test1");
      expect(config.password2).toBe("test2");
    });

    it("без аргумента — боевой режим: умолчание не должно быть тестовым", () => {
      clean();
      withBothPairs();
      process.env.ROBOKASSA_TEST_EMAILS = "owner@vk.com";
      expect(robokassaConfig().isTest).toBe(false);
    });
  });

  describe("готовность рельса считается для режима плательщика", () => {
    it("боевой готов от боевой пары, даже когда тестовой нет", () => {
      clean();
      process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
      process.env.ROBOKASSA_PASSWORD_1 = "prod1";
      process.env.ROBOKASSA_PASSWORD_2 = "prod2";
      expect(cardPaymentAvailable()).toBe(true);
    });

    it("тестовый плательщик без тестовой пары рельс не получает", () => {
      clean();
      process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
      process.env.ROBOKASSA_PASSWORD_1 = "prod1";
      process.env.ROBOKASSA_PASSWORD_2 = "prod2";
      process.env.ROBOKASSA_TEST_EMAILS = "owner@vk.com";
      expect(cardPaymentAvailable({ payerEmail: "owner@vk.com" })).toBe(false);

      process.env.ROBOKASSA_TEST_PASSWORD_1 = "test1";
      process.env.ROBOKASSA_TEST_PASSWORD_2 = "test2";
      expect(cardPaymentAvailable({ payerEmail: "owner@vk.com" })).toBe(true);
    });
  });
});
