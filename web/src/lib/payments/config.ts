/**
 * Payment-provider selection and credentials.
 *
 * The active provider is chosen by `PAYMENT_PROVIDER`; the legacy YooKassa path
 * stays in the repository and can be restored with a single env change and a
 * restart — no code deploy.
 *
 * Credentials are read at CALL TIME (not module load) so that a container
 * restart with new env picks them up, and so importing this module never
 * requires the secrets to be present (tests, build, unrelated routes).
 */
import type { RobokassaConfig, RobokassaHashAlgorithm, RobokassaTaxSystem } from "./robokassa";

export type PaymentProviderName = "robokassa" | "yookassa";

/**
 * Provider handling checkouts.
 *
 * B570 (owner 2026-07-22): «отключай Юкассу навсегда». Возврата по переменной
 * больше нет — функция всегда отвечает `robokassa`. ЮKassa мерчантом так и не
 * подключалась (на проде стоят ключи ТЕСТОВОГО кабинета), так что выключать
 * было нечего: рельс всё это время вёл в песочницу.
 *
 * Тип оставлен двузначным: на нём ещё стоят вебхук, сверка и выплаты, которые
 * разбираются отдельно (B562). Здесь важно одно — новый платёж уходит только в
 * Robokassa.
 */
export function activePaymentProvider(): PaymentProviderName {
  return "robokassa";
}

/** Весь контур переведён в тест — так живёт стейдж (`ROBOKASSA_IS_TEST=1`). */
export function contourForcesTestPayments(): boolean {
  return process.env.ROBOKASSA_IS_TEST?.trim() === "1";
}

/**
 * Платит ли этот человек по ТЕСТОВОЙ кассе?
 *
 * Решает признак у пользователя (B571): суперадмин выдаёт «тестовые платежи» в
 * карточке пользователя, и тот проверяет рельс, не тратя денег, — платформа при
 * этом обрабатывает платёж как настоящий и начисляет купленное. Снятие признака
 * возвращает на боевые ключи со следующего платежа.
 *
 * Глобальный флаг контура перекрывает признак: на стейдже боевых ключей нет
 * вовсе.
 *
 * Умолчание — БОЕВОЙ режим: не знать про пользователя должно означать «взять
 * настоящие деньги», а не «отдать даром».
 */
export function isRobokassaTestPayer(
  user?: { testPaymentsEnabled?: boolean | null } | null,
): boolean {
  if (contourForcesTestPayments()) return true;
  return user?.testPaymentsEnabled === true;
}

/**
 * Can we actually take a card payment right now?
 *
 * B554 (owner): the Mini App used to print «оплата картой появится скоро» as a
 * literal string. Once the rail is live that sentence is a lie — but flipping it
 * to «оплатить» unconditionally is worse: without credentials on the server the
 * button would walk the user into a 500. So the copy follows this probe, and
 * go-live is the same single env change that switches the provider.
 *
 * Deliberately never throws: callers are asking a question, not demanding the
 * secrets exist.
 */
export function cardPaymentAvailable(options: { testMode?: boolean } = {}): boolean {
  const present = (name: string) => Boolean(process.env[name]?.trim());

  // В тестовом режиме Robokassa подписывает ОТДЕЛЬНОЙ парой паролей — боевые
  // там дают ошибку 29. Готовность считается для режима ЭТОГО плательщика:
  // тестировщик может платить по тестовой кассе, пока боевая пара едет, и
  // наоборот.
  const isTest = options.testMode ?? contourForcesTestPayments();
  return (
    present("ROBOKASSA_MERCHANT_LOGIN")
    && present(isTest ? "ROBOKASSA_TEST_PASSWORD_1" : "ROBOKASSA_PASSWORD_1")
    && present(isTest ? "ROBOKASSA_TEST_PASSWORD_2" : "ROBOKASSA_PASSWORD_2")
  );
}

/**
 * Taxation system printed on fiscal receipts. ИП на УСН «доходы» → `usn_income`,
 * which also means every line is billed without VAT (`none`).
 */
export function receiptTaxSystem(): RobokassaTaxSystem {
  const configured = process.env.ROBOKASSA_TAX_SYSTEM?.trim();
  const allowed: readonly RobokassaTaxSystem[] = [
    "osn",
    "usn_income",
    "usn_income_outcome",
    "envd",
    "esn",
    "patent",
  ];
  return allowed.includes(configured as RobokassaTaxSystem)
    ? (configured as RobokassaTaxSystem)
    : "usn_income";
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set to accept payments`);
  }
  return value;
}

/**
 * Builds the Robokassa config from env.
 *
 * In test mode Robokassa signs with a SEPARATE pair of passwords — using the
 * production ones there fails with error 29, so the two sets never mix.
 *
 * Режим выбирается по плательщику (B570). Умолчание — БОЕВОЙ: забыть передать
 * почту должно означать «взять настоящие деньги», а не «отдать даром».
 */
export function robokassaConfig(
  options: { testMode?: boolean } = {},
): RobokassaConfig {
  const isTest = options.testMode ?? contourForcesTestPayments();
  const algorithm = process.env.ROBOKASSA_HASH_ALGORITHM?.trim().toUpperCase();
  const allowed: readonly RobokassaHashAlgorithm[] = ["MD5", "SHA1", "SHA256", "SHA384", "SHA512"];

  return {
    merchantLogin: requireEnv("ROBOKASSA_MERCHANT_LOGIN"),
    password1: requireEnv(isTest ? "ROBOKASSA_TEST_PASSWORD_1" : "ROBOKASSA_PASSWORD_1"),
    password2: requireEnv(isTest ? "ROBOKASSA_TEST_PASSWORD_2" : "ROBOKASSA_PASSWORD_2"),
    hashAlgorithm: allowed.includes(algorithm as RobokassaHashAlgorithm)
      ? (algorithm as RobokassaHashAlgorithm)
      : "SHA256",
    isTest,
  };
}
