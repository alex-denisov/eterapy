export type AdminCurrencyRates = {
  source: "cbr";
  sourceUrl: string;
  asOf: string;
  usdRub: number | null;
  error?: string;
};

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
      next: { revalidate: 60 * 60 * 6 },
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

export function formatAdminAiCostRub(value: number, rates: AdminCurrencyRates | null | undefined) {
  const rub = microsUsdToRub(value, rates);
  if (rub === null) return "Курс ЦБ недоступен";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: rub > 0 && rub < 100 ? 2 : 0,
  }).format(rub);
}

export function formatCbrRateLabel(rates: AdminCurrencyRates | null | undefined) {
  if (!rates?.usdRub) return "Курс ЦБ РФ: недоступен";
  return `Курс ЦБ РФ на ${rates.asOf}: 1 USD = ${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(rates.usdRub)} ₽`;
}
