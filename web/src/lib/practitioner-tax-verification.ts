// B466/B483 — налоговый статус практика: валидация ИНН + модель авто-проверки.
// Owner-требования (2026-07-06): ИНН обязателен, вводится ТОЛЬКО на экране
// «Налоговый статус» (не в реквизитах выплат); 12 цифр для самозанятого/ИП,
// 10 — для юр. лица; показывается ПОЛНОСТЬЮ (не маскируется); статус
// сохраняется как «подтверждён» только после явного «Это действительно Вы?».
//
// Pure logic (unit-tested). Провайдер реальной проверки (ФНС НПД /
// ЕГРЮЛ-ЕГРИП) живёт в practitioner-tax-verification-provider.ts.

export type TaxStatusKey = "SELF_EMPLOYED" | "INDIVIDUAL_ENTREPRENEUR" | "LEGAL_ENTITY";

export const TAX_STATUS_LABELS: Record<TaxStatusKey, string> = {
  SELF_EMPLOYED: "Самозанятый (НПД)",
  INDIVIDUAL_ENTREPRENEUR: "ИП",
  LEGAL_ENTITY: "Юр. лицо",
};

/** Длина ИНН: 12 цифр — физлицо (самозанятый/ИП), 10 — юр. лицо. */
export function expectedInnLength(status: TaxStatusKey): number {
  return status === "LEGAL_ENTITY" ? 10 : 12;
}

function checksumDigit(digits: number[], coefficients: number[]): number {
  const sum = coefficients.reduce((acc, coef, i) => acc + coef * digits[i], 0);
  return (sum % 11) % 10;
}

/** Контрольные цифры ИНН по алгоритму ФНС (10- и 12-значные). */
export function isValidInnChecksum(inn: string): boolean {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;
  const digits = inn.split("").map(Number);
  if (inn.length === 10) {
    return checksumDigit(digits, [2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[9];
  }
  const d11ok = checksumDigit(digits, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[10];
  const d12ok = checksumDigit(digits, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[11];
  return d11ok && d12ok;
}

export interface InnValidationResult {
  ok: boolean;
  /** Нормализованный ИНН (только цифры) — заполняется и при ошибке. */
  inn: string;
  error?: string;
}

/** Полная валидация: только цифры, длина по статусу, контрольная сумма. */
export function validateInn(rawInn: string, status: TaxStatusKey): InnValidationResult {
  const inn = (rawInn ?? "").replace(/\s+/g, "");
  if (!/^\d*$/.test(inn)) {
    return { ok: false, inn: inn.replace(/\D/g, ""), error: "ИНН — только цифры" };
  }
  const expected = expectedInnLength(status);
  if (inn.length !== expected) {
    return {
      ok: false,
      inn,
      error: `Для статуса «${TAX_STATUS_LABELS[status]}» ИНН — ${expected} цифр`,
    };
  }
  if (!isValidInnChecksum(inn)) {
    return { ok: false, inn, error: "ИНН не проходит проверку контрольных цифр — проверьте номер" };
  }
  return { ok: true, inn };
}

/** Результат авто-проверки статуса (провайдер: ФНС НПД / ЕГРЮЛ-ЕГРИП / стаб). */
export interface TaxIdentityLookup {
  /** ФИО (самозанятый/ИП) или наименование (юр. лицо). */
  displayName: string;
  status: TaxStatusKey;
  /** Статус действителен/активен на момент проверки. */
  active: boolean;
  /** Источник данных: "fns" | "egrul" | "stub". */
  source: string;
}
