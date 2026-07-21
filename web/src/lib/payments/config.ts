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
 * Provider currently handling checkouts.
 *
 * The default stays on the incumbent deliberately: the new rail only works once
 * its credentials are on the server, so switching must be an explicit act
 * (`PAYMENT_PROVIDER=robokassa`) rather than something a deploy does silently.
 * Go-live is that one env change plus a restart; rollback is the same change
 * back.
 */
export function activePaymentProvider(): PaymentProviderName {
  return process.env.PAYMENT_PROVIDER?.trim().toLowerCase() === "robokassa"
    ? "robokassa"
    : "yookassa";
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
 */
export function robokassaConfig(): RobokassaConfig {
  const isTest = process.env.ROBOKASSA_IS_TEST?.trim() === "1";
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
