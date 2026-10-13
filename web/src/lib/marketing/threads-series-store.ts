/** B776 — чтение и запись состояния серии «День N/30» в `platform_settings`. */

import db from "@/lib/db";
import { SERIES_SETTING_KEY, parseSeriesConfig, type SeriesConfig } from "@/lib/marketing/threads-series";

/** Отказ чтения = серии нет: план без серии лучше упавшего плана. */
export async function loadSeriesConfig(): Promise<SeriesConfig | null> {
  try {
    const row = await db.platformSetting.findUnique({ where: { key: SERIES_SETTING_KEY }, select: { value: true } });
    return parseSeriesConfig(row?.value);
  } catch {
    return null;
  }
}

export async function saveSeriesConfig(config: SeriesConfig): Promise<void> {
  const value = JSON.stringify(config);
  await db.platformSetting.upsert({ where: { key: SERIES_SETTING_KEY }, create: { key: SERIES_SETTING_KEY, value }, update: { value } });
}
