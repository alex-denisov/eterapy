// B483 — провайдер автоматической проверки налогового статуса.
//
// Источники (см. тикет B483):
//   • самозанятый (НПД) — официальный ФНС «проверка статуса налогоплательщика
//     НПД» (statusnpd.nalog.ru): подтверждает ТОЛЬКО активность ИНН, ФИО не
//     возвращает → личность остаётся непривязанной (identitySource="profile").
//   • ИП / юр. лицо — ЕГРЮЛ/ЕГРИП через официальный коммерческий API DaData
//     (`findById/party`, env DADATA_API_KEY): возвращает наименование/ФИО и
//     статус действующего → личность привязывается по данным реестра
//     (identitySource="registry").
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
const DADATA_FIND_PARTY_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party";

function requestDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isNpdResponse(value: unknown): value is { status: boolean; message?: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.status === "boolean"
    && (candidate.message === undefined || typeof candidate.message === "string");
}

interface DadataParty {
  displayName: string;
  personName: string | null;
  active: boolean;
  type: "LEGAL" | "INDIVIDUAL";
}

/** Строгая валидация ответа DaData findById/party (первый suggestion). */
export function parseDadataParty(payload: unknown): DadataParty | null {
  if (!payload || typeof payload !== "object") return null;
  const suggestions = (payload as Record<string, unknown>).suggestions;
  if (!Array.isArray(suggestions) || suggestions.length === 0) return null;
  const first = suggestions[0] as Record<string, unknown>;
  const data = first?.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") return null;

  const type = data.type === "LEGAL" || data.type === "INDIVIDUAL" ? data.type : null;
  if (!type) return null;

  const state = data.state as Record<string, unknown> | undefined;
  const active = state?.status === "ACTIVE";

  const name = data.name as Record<string, unknown> | undefined;
  const displayName =
    (typeof name?.short_with_opf === "string" && name.short_with_opf) ||
    (typeof name?.full_with_opf === "string" && name.full_with_opf) ||
    (typeof name?.full === "string" && name.full) ||
    null;
  if (!displayName) return null;

  // ФИО физлица: у ИП — data.fio, у юрлица — руководитель data.management.name.
  let personName: string | null = null;
  const fio = data.fio as Record<string, unknown> | undefined;
  if (fio && typeof fio === "object") {
    const parts = [fio.surname, fio.name, fio.patronymic]
      .filter((part): part is string => typeof part === "string" && part.length > 0);
    if (parts.length >= 2) personName = parts.join(" ");
  }
  if (!personName) {
    const management = data.management as Record<string, unknown> | undefined;
    if (typeof management?.name === "string" && management.name.length > 0) {
      personName = management.name;
    }
  }
  if (!personName && type === "INDIVIDUAL") {
    // У ИП name.full = «Иванов Иван Иванович» без ОПФ.
    personName = typeof name?.full === "string" ? name.full : null;
  }

  return { displayName, personName, active, type };
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

async function dadataEgrulLookup(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  const apiKey = process.env.DADATA_API_KEY;
  if (!apiKey) {
    throw new Error("EGRUL/EGRIP lookup requires DADATA_API_KEY (B483)");
  }

  const rateLimit = checkAuthRateLimit("tax-verification:dadata:global", 10, 60_000);
  if (!rateLimit.allowed) throw new Error("EGRUL/EGRIP request rate is temporarily exhausted");

  const response = await fetch(DADATA_FIND_PARTY_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({ query: query.inn, count: 1, branch_type: "MAIN" }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`DaData party request failed (${response.status})`);

  const payload: unknown = await response.json();
  const party = parseDadataParty(payload);
  if (!party) {
    // Пустой ответ = ИНН не найден в ЕГРЮЛ/ЕГРИП → статус не подтверждается.
    return {
      displayName: query.fallbackDisplayName,
      status: query.status,
      active: false,
      source: "egrul-dadata",
      identitySource: "registry",
      registryPersonName: null,
    };
  }

  const expectedType = query.status === "LEGAL_ENTITY" ? "LEGAL" : "INDIVIDUAL";
  return {
    displayName: party.displayName,
    status: query.status,
    active: party.active && party.type === expectedType,
    source: "egrul-dadata",
    identitySource: "registry",
    registryPersonName: party.personName,
  };
}

async function fnsLookup(query: TaxIdentityQuery): Promise<TaxIdentityLookup> {
  if (query.status === "SELF_EMPLOYED") return fnsNpdLookup(query);
  return dadataEgrulLookup(query);
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
