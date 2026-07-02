import type { AdminDisplayCurrency } from "./admin-currency";

export const ADMIN_PERIOD_STORAGE_KEY = "eterapy.admin.analytics.period";
export const ADMIN_CURRENCY_STORAGE_KEY = "eterapy.admin.analytics.currency";

export type AdminPeriodPreference = {
  start: string;
  end: string;
  period?: string;
};

const PERIOD_KEYS = ["start", "end", "period"] as const;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function saveAdminPeriodPreference(value: AdminPeriodPreference) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(ADMIN_PERIOD_STORAGE_KEY, JSON.stringify(value));
  notifyAdminPreferencesChanged();
}

export function restoreAdminPeriodPreference(): AdminPeriodPreference | null {
  if (!canUseStorage()) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ADMIN_PERIOD_STORAGE_KEY) ?? "null") as Partial<AdminPeriodPreference> | null;
    if (!parsed || !validIso(parsed.start) || !validIso(parsed.end)) return null;
    return { start: parsed.start, end: parsed.end, period: typeof parsed.period === "string" ? parsed.period : undefined };
  } catch {
    return null;
  }
}

export function saveAdminCurrencyPreference(value: AdminDisplayCurrency) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(ADMIN_CURRENCY_STORAGE_KEY, value);
  notifyAdminPreferencesChanged();
}

export function restoreAdminCurrencyPreference(): AdminDisplayCurrency | null {
  if (!canUseStorage()) return null;
  const value = window.localStorage.getItem(ADMIN_CURRENCY_STORAGE_KEY);
  return value === "USD" || value === "RUB" ? value : null;
}

export function adminNavigationPreferenceParams(
  currentParams: URLSearchParams,
  storedPeriod: AdminPeriodPreference | null,
  storedCurrency: AdminDisplayCurrency | null,
) {
  const params: Record<string, string> = {};
  for (const key of PERIOD_KEYS) {
    const current = currentParams.get(key);
    const stored = storedPeriod?.[key];
    if (current) params[key] = current;
    else if (stored) params[key] = stored;
  }

  const currentCurrency = currentParams.get("currency");
  const currency = currentCurrency === "USD" || currentCurrency === "RUB" ? currentCurrency : storedCurrency;
  if (currency === "USD") params.currency = currency;
  return params;
}

export function appendAdminNavigationParams(href: string, params: Record<string, string>) {
  const hashIndex = href.indexOf("#");
  const hrefWithoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const queryIndex = hrefWithoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? hrefWithoutHash.slice(0, queryIndex) : hrefWithoutHash;
  const query = queryIndex >= 0 ? hrefWithoutHash.slice(queryIndex + 1) : "";
  const next = new URLSearchParams(query);

  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }

  const nextQuery = next.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ""}${hash}`;
}

function notifyAdminPreferencesChanged() {
  window.dispatchEvent(new Event("eterapy-admin-preferences"));
}
