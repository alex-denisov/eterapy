/**
 * B699 — можно ли вообще начинать материал.
 *
 * Один вопрос, который задаётся ДО вызова автора: остались ли в пуле две
 * независимые модели. Живёт отдельным файлом, потому что соединяет две вещи
 * разной природы — состояние ключей в базе и чистую таблицу предпочтений
 * `model-pool.ts`, которая ни о какой базе знать не должна.
 */

import { listProvidersWithActiveCredentials } from "@/lib/ai-gateway/credentials";
import { marketingPoolCanSeparateRoles } from "@/lib/marketing/model-pool";
import type { AIProvider } from "@prisma/client";

export interface MarketingPoolAvailability {
  /** Провайдеры, чьи ключи прямо сейчас не остывают. */
  providers: AIProvider[];
  /** Хватает ли их, чтобы редактор получил модель, отличную от модели автора. */
  canSeparateRoles: boolean;
}

export async function marketingPoolAvailability(now?: Date): Promise<MarketingPoolAvailability> {
  const providers = await listProvidersWithActiveCredentials({ now });
  return { providers, canSeparateRoles: marketingPoolCanSeparateRoles(providers) };
}
