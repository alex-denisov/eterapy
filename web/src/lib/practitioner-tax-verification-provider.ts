// B483 — провайдер автоматической проверки налогового статуса.
//
// Целевая интеграция (см. тикет B483):
//   • самозанятый (НПД) — ФНС «проверка статуса налогоплательщика НПД»
//     (npd.nalog.ru API);
//   • ИП / юр. лицо — выписка ЕГРЮЛ/ЕГРИП (api-fns/официальные сервисы).
//
// Пока ключей интеграции нет, работает детерминированный СТАБ: подтверждает
// заявленный статус на имя пользователя. Выбор провайдера — env
// TAX_VERIFICATION_PROVIDER ("stub" | "fns"); "fns" без реализации падает
// явно, чтобы стаб не притворялся боевой проверкой.

import type { TaxIdentityLookup, TaxStatusKey } from "@/lib/practitioner-tax-verification";

export interface TaxIdentityQuery {
  inn: string;
  status: TaxStatusKey;
  /** Имя пользователя из профиля — стаб возвращает его как данные «ФНС». */
  fallbackDisplayName: string;
}

async function stubLookup(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  return {
    displayName: query.fallbackDisplayName,
    status: query.status,
    active: true,
    source: "stub",
  };
}

export async function lookupTaxIdentity(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  const provider = process.env.TAX_VERIFICATION_PROVIDER ?? "stub";
  if (provider === "stub") return stubLookup(query);
  // B483: сюда встаёт реальная ФНС/ЕГРЮЛ интеграция.
  throw new Error(`Tax verification provider "${provider}" is not implemented yet (B483)`);
}
