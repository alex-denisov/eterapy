// B483 — провайдер автоматической проверки налогового статуса.
//
// Целевая интеграция (см. тикет B483):
//   • самозанятый (НПД) — ФНС «проверка статуса налогоплательщика НПД»
//     (npd.nalog.ru API);
//   • ИП / юр. лицо — выписка ЕГРЮЛ/ЕГРИП (api-fns/официальные сервисы).
//
// Выбор провайдера — env TAX_VERIFICATION_PROVIDER ("disabled" | "stub" |
// "fns"). Любой non-test runtime по умолчанию disabled: публичный API НПД
// подтверждает статус ИНН, но не связывает его с личностью практика. Стаб
// разрешён по умолчанию только в tests. Автоматическая интеграция ЕГРЮЛ/ЕГРИП
// требует отдельного абонентского доступа и до его настройки fail-closed.

import type { TaxIdentityLookup, TaxStatusKey } from "@/lib/practitioner-tax-verification";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";

export interface TaxIdentityQuery {
  inn: string;
  status: TaxStatusKey;
  /** Имя пользователя из профиля; публичный NPD API не возвращает ФИО. */
  fallbackDisplayName: string;
}

const FNS_NPD_STATUS_URL = "https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status";

function requestDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isNpdResponse(value: unknown): value is { status: boolean; message?: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.status === "boolean"
    && (candidate.message === undefined || typeof candidate.message === "string");
}

async function stubLookup(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  return {
    displayName: query.fallbackDisplayName,
    status: query.status,
    active: true,
    source: "stub",
  };
}

async function fnsNpdLookup(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  if (query.status !== "SELF_EMPLOYED") {
    throw new Error("FNS EGRUL/EGRIP subscriber access is not configured (B483)");
  }

  const rateLimit = checkAuthRateLimit("tax-verification:fns-npd:global", 2, 60_000);
  if (!rateLimit.allowed) throw new Error("FNS NPD request rate is temporarily exhausted");

  const response = await fetch(FNS_NPD_STATUS_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ inn: query.inn, requestDate: requestDate() }),
    cache: "no-store",
    // The official API contract requires a client timeout of at least 60 seconds.
    signal: AbortSignal.timeout(65_000),
  });
  if (!response.ok) throw new Error(`FNS NPD request failed (${response.status})`);

  const payload: unknown = await response.json();
  if (!isNpdResponse(payload)) throw new Error("FNS NPD returned an invalid response");
  return {
    displayName: query.fallbackDisplayName,
    status: query.status,
    active: payload.status,
    source: "fns-npd",
  };
}

export async function lookupTaxIdentity(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  const provider = process.env.TAX_VERIFICATION_PROVIDER
    ?? (process.env.NODE_ENV === "test" ? "stub" : "disabled");
  if (provider === "disabled") {
    throw new Error("Tax verification is disabled until INN ownership is verified (B483)");
  }
  if (provider === "stub") return stubLookup(query);
  if (provider === "fns") return fnsNpdLookup(query);
  throw new Error(`Unknown tax verification provider "${provider}"`);
}
