export type AdminCurrencyRates = {
  source: "cbr";
  sourceUrl: string;
  asOf: string;
  usdRub: number | null;
  error?: string;
};

export const ADMIN_DISPLAY_CURRENCIES = ["RUB", "USD"] as const;
export type AdminDisplayCurrency = (typeof ADMIN_DISPLAY_CURRENCIES)[number];

const CBR_DAILY_URL = "https://www.cbr.ru/scripts/XML_daily.asp";

function formatCbrDate(value: Date) {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${value.getFullYear()}`;
}

function parseCbrValue(xml: string, charCode: string) {
  const block = xml.match(new RegExp(`<Valute[^>]*>[\\s\\S]*?<CharCode>${charCode}</CharCode>[\\s\\S]*?</Valute>`, "i"))?.[0];
  if (!block) return null;
  const nominalRaw = block.match(/<Nominal>([^<]+)<\/Nominal>/i)?.[1] ?? "1";
  const valueRaw = block.match(/<Value>([^<]+)<\/Value>/i)?.[1];
  const nominal = Number(nominalRaw.replace(",", "."));
  const value = Number(valueRaw?.replace(",", "."));
  if (!Number.isFinite(nominal) || !Number.isFinite(value) || nominal <= 0) return null;
  return value / nominal;
}

function parseCbrAsOf(xml: string, fallback: Date) {
  const raw = xml.match(/<ValCurs[^>]*Date="([^"]+)"/i)?.[1];
  if (raw && /^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return raw;
  return new Intl.DateTimeFormat("ru-RU").format(fallback);
}

export async function getAdminCurrencyRates(date = new Date()): Promise<AdminCurrencyRates> {
  const dateReq = formatCbrDate(date);
  const sourceUrl = `${CBR_DAILY_URL}?date_req=${dateReq}`;
  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
    });
    if (!response.ok) throw new Error(`CBR responded ${response.status}`);
    const xml = await response.text();
    return {
      source: "cbr",
      sourceUrl,
      asOf: parseCbrAsOf(xml, date),
      usdRub: parseCbrValue(xml, "USD"),
    };
  } catch (error) {
    return {
      source: "cbr",
      sourceUrl,
      asOf: new Intl.DateTimeFormat("ru-RU").format(date),
      usdRub: null,
      error: error instanceof Error ? error.message : "CBR rate fetch failed",
    };
  }
}

export function microsUsdToRub(value: number, rates: AdminCurrencyRates | null | undefined) {
  if (!rates?.usdRub) return null;
  return (value / 1_000_000) * rates.usdRub;
}

export function resolveAdminCurrency(params: Record<string, string | string[] | undefined> = {}): AdminDisplayCurrency {
  const raw = Array.isArray(params.currency) ? params.currency[0] : params.currency;
  return raw === "USD" ? "USD" : "RUB";
}

export function rubToDisplayCurrency(valueRub: number, currency: AdminDisplayCurrency, rates: AdminCurrencyRates | null | undefined) {
  if (currency === "RUB") return valueRub;
  if (!rates?.usdRub) return null;
  return valueRub / rates.usdRub;
}

export function microsUsdToDisplayCurrency(value: number, currency: AdminDisplayCurrency, rates: AdminCurrencyRates | null | undefined) {
  if (currency === "USD") return value / 1_000_000;
  return microsUsdToRub(value, rates);
}

export function formatAdminMoney(value: number | null, currency: AdminDisplayCurrency) {
  if (value === null) return "Курс ЦБ недоступен";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: value > 0 && value < 100 ? 2 : 0,
  }).format(value);
}

export function formatAdminRub(valueRub: number, currency: AdminDisplayCurrency, rates: AdminCurrencyRates | null | undefined) {
  return formatAdminMoney(rubToDisplayCurrency(valueRub, currency, rates), currency);
}

export function formatAdminAiCost(value: number, rates: AdminCurrencyRates | null | undefined, currency: AdminDisplayCurrency = "RUB") {
  return formatAdminMoney(microsUsdToDisplayCurrency(value, currency, rates), currency);
}

export function formatAdminAiCostRub(value: number, rates: AdminCurrencyRates | null | undefined) {
  return formatAdminAiCost(value, rates, "RUB");
}

export function adminCurrencyUnit(currency: AdminDisplayCurrency) {
  return currency === "USD" ? " $" : " ₽";
}

export function formatAdminCurrencyNumber(value: number, currency: AdminDisplayCurrency) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: value > 0 && value < 100 ? 2 : 0,
  }).format(value)}${adminCurrencyUnit(currency)}`;
}

export function formatCbrRateLabel(rates: AdminCurrencyRates | null | undefined) {
  if (!rates?.usdRub) return "$/₽ · курс недоступен";
  return `$/₽ · ${rates.asOf} · ${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rates.usdRub)}`;
}
