import db from "./db";

export const DEFAULT_SETTINGS: Record<string, string> = {
  // Тарифные планы
  "plan.free.sessions":      "3",
  "plan.free.price":         "0",
  "plan.starter.sessions":   "10",
  "plan.starter.price":      "299",
  "plan.standard.sessions":  "30",
  "plan.standard.price":     "699",
  "plan.unlimited.price":    "1299",

  // Комиссия платформы
  "platform.commission_pct": "15",

  // Видеосессия — тестовый режим (0 = бесплатно для теста)
  "session.test_mode":       "false",
  "session.min_price":       "0",

  // Лимит бесплатных инструментов по умолчанию
  "tools.default_limit":     "3",

  // Цены цифровых продуктов (копейки/рубли)
  "product.reframe.price":   "299",
  "product.deep-report.price":    "890",
  "product.chat-analysis.price":  "590",
  "product.tarot.price":          "590",
  "product.natal-chart.price":    "590",
  "product.synastry.price":       "890",
  "product.numerology.price":     "890",
  "product.horary.price":         "590",
  "product.tarot-numerology.price": "890",
  "product.family-scenarios.price": "1090",
  "product.human-design.price":   "590",
  "product.surname-story.price":  "590",
  "product.tarot.credits":        "2",
  "product.natal-chart.credits":  "2",
  "product.synastry.credits":     "3",
  "product.numerology.credits":   "3",
  "product.horary.credits":       "2",
  "product.tarot-numerology.credits": "3",
  "product.family-scenarios.credits": "4",
  "product.human-design.credits": "2",
  "product.surname-story.credits": "2",
  "product.compatibility.price":  "890",
  "product.circle.price":         "890",
  "product.pair.price":           "890",

  // Подписки (v5)
  "subscription.plus.price":      "590",
  "subscription.premium.price":   "1490",
  "subscription.pro.price":       "1490",
};

export async function getSetting(key: string): Promise<string> {
  try {
    const row = await db.platformSetting?.findUnique({ where: { key } });
    return row?.value ?? DEFAULT_SETTINGS[key] ?? "";
  } catch {
    // Public product pages and checkout keep a server-owned safe fallback if
    // settings storage is temporarily unavailable; client amounts are ignored.
    return DEFAULT_SETTINGS[key] ?? "";
  }
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await db.platformSetting.findMany({ where: { key: { in: keys } } });
  const result: Record<string, string> = {};
  for (const key of keys) {
    const row = rows.find(r => r.key === key);
    result[key] = row?.value ?? DEFAULT_SETTINGS[key] ?? "";
  }
  return result;
}

export async function setSetting(key: string, value: string, updatedBy?: string): Promise<void> {
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value, updatedBy: updatedBy ?? null },
    update: { value, updatedBy: updatedBy ?? null },
  });
}

export async function setSettings(settings: Record<string, string>, updatedBy?: string): Promise<void> {
  await Promise.all(
    Object.entries(settings).map(([key, value]) => setSetting(key, value, updatedBy))
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.platformSetting.findMany();
  const result = { ...DEFAULT_SETTINGS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}
