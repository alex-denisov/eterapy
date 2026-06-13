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
  "product.perspectives.price":   "299",
  "product.deep-report.price":    "590",
  "product.chat-analysis.price":  "390",
  "product.circle.price":         "790",
  "product.pair.price":           "790",

  // Подписки (v5)
  "subscription.plus.price":      "490",
  "subscription.premium.price":   "1290",
  "subscription.pro.price":       "1490",
};

export async function getSetting(key: string): Promise<string> {
  const row = await db.platformSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULT_SETTINGS[key] ?? "";
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
