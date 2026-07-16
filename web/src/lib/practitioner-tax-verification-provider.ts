// B483 — провайдер автоматической проверки налогового статуса.
//
// Источники (см. тикет B483):
//   • самозанятый (НПД) — официальный ФНС «проверка статуса налогоплательщика
//     НПД» (statusnpd.nalog.ru): подтверждает ТОЛЬКО активность ИНН, ФИО не
//     возвращает → личность остаётся непривязанной (identitySource="profile").
//   • ИП / юр. лицо — ЕГРЮЛ/ЕГРИП через API Офдата (ofdata.ru, env
//     OFDATA_API_KEY): `/v2/entrepreneur` (ИП → ФИО) и `/v2/company`
//     (юрлицо → наименование); статус «Действует» → личность привязывается по
//     данным реестра (identitySource="registry"). Позже, при появлении юрлица,
//     ИНН можно проверять напрямую через сервис ФНС (см. отдельный тикет).
//
// Выбор провайдера — env TAX_VERIFICATION_PROVIDER ("disabled" | "stub" |
// "fns"). Любой non-test runtime по умолчанию disabled; стаб разрешён по
// умолчанию только в tests. Security-ревью B483 (2026-07-15): результат без
// привязки личности НЕ должен автоматически давать VERIFIED — маршрут обязан
// отправлять такие случаи на ручную модерацию (см. tax-status route).

import type { TaxIdentityLookup, TaxStatusKey } from "@/lib/practitioner-tax-verification";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";

export interface TaxIdentityQuery {
  inn: string;
  status: TaxStatusKey;
  /** Имя пользователя из профиля; публичный NPD API не возвращает ФИО. */
  fallbackDisplayName: string;
}

const FNS_NPD_STATUS_URL = "https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status";
const OFDATA_BASE_URL = "https://api.ofdata.ru/v2";

function requestDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isNpdResponse(value: unknown): value is { status: boolean; message?: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.status === "boolean"
    && (candidate.message === undefined || typeof candidate.message === "string");
}

interface OfdataParty {
  displayName: string;
  personName: string | null;
  active: boolean;
  type: "LEGAL" | "INDIVIDUAL";
}

/** Извлекает строку статуса из `data.Статус` (объект `{Наим}` или строка). */
function ofdataStatusText(status: unknown): string {
  if (typeof status === "string") return status;
  if (status && typeof status === "object") {
    const naim = (status as Record<string, unknown>).Наим;
    if (typeof naim === "string") return naim;
  }
  return "";
}

/** «Действует» / «Действующее» → активно (не ликвидировано/прекращено). */
function ofdataActive(status: unknown): boolean {
  return /действ/i.test(ofdataStatusText(status));
}

/**
 * Строгая валидация ответа Офдата `/v2/company` или `/v2/entrepreneur`.
 * `data` пуст/без имени (не найдено) → null.
 */
export function parseOfdataParty(payload: unknown, type: "LEGAL" | "INDIVIDUAL"): OfdataParty | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") return null;

  if (type === "INDIVIDUAL") {
    const fio = typeof data.ФИО === "string" && data.ФИО.trim() ? data.ФИО.trim() : null;
    if (!fio) return null;
    return { displayName: fio, personName: fio, active: ofdataActive(data.Статус), type };
  }

  const displayName =
    (typeof data.НаимСокр === "string" && data.НаимСокр.trim()) ||
    (typeof data.НаимПолн === "string" && data.НаимПолн.trim()) ||
    null;
  if (!displayName) return null;
  // Юрлицо: имя = наименование организации, ФИО практика не сверяется.
  return { displayName, personName: null, active: ofdataActive(data.Статус), type };
}

async function stubLookup(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  // Стаб моделирует ПОЛНУЮ проверку (реестр + совпадение личности), чтобы
  // локальный/тестовый flow доходил до VERIFIED.
  return {
    displayName: query.fallbackDisplayName,
    status: query.status,
    active: true,
    source: "stub",
    identitySource: "registry",
    registryPersonName: query.fallbackDisplayName,
  };
}

async function fnsNpdLookup(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
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
    // NPD API не возвращает ФИО — личность НЕ привязана к реестру.
    identitySource: "profile",
    registryPersonName: null,
  };
}

async function ofdataEgrulLookup(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  const apiKey = process.env.OFDATA_API_KEY;
  if (!apiKey) {
    throw new Error("EGRUL/EGRIP lookup requires OFDATA_API_KEY (B483)");
  }

  const rateLimit = checkAuthRateLimit("tax-verification:ofdata:global", 10, 60_000);
  if (!rateLimit.allowed) throw new Error("EGRUL/EGRIP request rate is temporarily exhausted");

  const expectedType = query.status === "LEGAL_ENTITY" ? "LEGAL" : "INDIVIDUAL";
  const endpoint = expectedType === "LEGAL" ? "company" : "entrepreneur";
  const url = `${OFDATA_BASE_URL}/${endpoint}?key=${encodeURIComponent(apiKey)}&inn=${encodeURIComponent(query.inn)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Ofdata request failed (${response.status})`);

  const payload: unknown = await response.json();
  const party = parseOfdataParty(payload, expectedType);
  if (!party) {
    // Пустой data = ИНН не найден в ЕГРЮЛ/ЕГРИП → статус не подтверждается.
    return {
      displayName: query.fallbackDisplayName,
      status: query.status,
      active: false,
      source: "egrul-ofdata",
      identitySource: "registry",
      registryPersonName: null,
    };
  }

  return {
    displayName: party.displayName,
    status: query.status,
    active: party.active,
    source: "egrul-ofdata",
    identitySource: "registry",
    registryPersonName: party.personName,
  };
}

async function fnsLookup(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  if (query.status === "SELF_EMPLOYED") return fnsNpdLookup(query);
  return ofdataEgrulLookup(query);
}

export async function lookupTaxIdentity(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  const provider = process.env.TAX_VERIFICATION_PROVIDER
    ?? (process.env.NODE_ENV === "test" ? "stub" : "disabled");
  if (provider === "disabled") {
    throw new Error("Tax verification is disabled until INN ownership is verified (B483)");
  }
  if (provider === "stub") return stubLookup(query);
  if (provider === "fns") return fnsLookup(query);
  throw new Error(`Unknown tax verification provider "${provider}"`);
}
