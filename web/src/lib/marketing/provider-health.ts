/**
 * B616 / INC-092 — unattended health probe for the free marketing model pool.
 *
 * The superadmin panel derives "ready" from `lastSuccessAt` vs `lastErrorAt`.
 * Before this probe those timestamps only moved when a human pressed the
 * healthcheck button, so a provider that recovered upstream stayed red, and a
 * provider whose key the owner had just replaced stayed red until someone
 * noticed. The worker now re-probes on a schedule, which means:
 *
 *  - a connector comes back on its own once the upstream issue is over;
 *  - a freshly entered key starts being used without a deploy or a click;
 *  - a genuinely blocked account is reported with the upstream reason instead
 *    of a generic failure.
 */

import { AIProvider } from "@prisma/client";
import db from "@/lib/db";
import { checkCredentialHealth } from "@/lib/ai-gateway/credentials";
import { log, serializeError } from "@/lib/logger";
import { resolveMarketingSignal, upsertMarketingSignal } from "@/lib/marketing/agent";
import { MARKETING_FREE_PROVIDERS } from "@/lib/marketing/model-pool";

const PROBE_ACTOR = "marketing-worker";

/**
 * B635 — единый шаг обхода и выравнивание по сетке.
 *
 * ЧТО ВИДЕЛ ВЛАДЕЛЕЦ (2026-07-31): «проверка идёт не каждые 15 минут, а
 * хаотично — в колонке „проверено“ время у каждого провайдера разное».
 * Наблюдение верное, и причина была в коде: шаг зависел от состояния
 * провайдера — час у здорового, полчаса у решения уровня аккаунта, пятнадцать
 * минут у упавшего. Три разных шага дают три разные отметки времени, и колонка
 * перестаёт читаться как «состояние на сейчас».
 *
 * ДВА ИЗМЕНЕНИЯ.
 *
 * 1. Шаг один для всех — пятнадцать минут. Экономия квоты, ради которой
 *    здоровый проверялся реже, стоила дороже, чем экономила: панель показывала
 *    отметку часовой давности и по ней принимали решения.
 * 2. Момент пробы выровнен по сетке четверти часа, а не отсчитывается от
 *    времени прошлой проверки. Без выравнивания каждая проба сдвигает
 *    следующую на длительность самой пробы, отметки расползаются за сутки на
 *    минуты, и «хаотично» вернулось бы даже при одинаковом шаге.
 */
export const PROBE_INTERVAL_MS = 15 * 60_000;

/** Номер пятнадцатиминутного слота с начала эпохи. */
function probeSlot(at: Date): number {
  return Math.floor(at.getTime() / PROBE_INTERVAL_MS);
}

export function providerProbeDue(input: {
  now: Date;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  /** Оставлен в сигнатуре: код последней ошибки показывается рядом в кокпите. */
  lastErrorCode?: string | null;
}): boolean {
  const lastChecked = [input.lastSuccessAt, input.lastErrorAt]
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  if (!lastChecked) return true;
  // Строгое неравенство слотов, а не разница во времени: проба, занявшая
  // сорок секунд, не должна отодвигать следующую на сорок секунд.
  return probeSlot(input.now) > probeSlot(lastChecked);
}

export interface ProviderProbeOutcome {
  provider: AIProvider;
  label: string;
  status: "ok" | "missing_config" | "down" | "skipped";
  code?: string;
  message?: string;
}

export async function probeMarketingProviders(
  input: { now?: Date } = {},
): Promise<ProviderProbeOutcome[]> {
  const now = input.now ?? new Date();
  const credentials = await db.aIProviderCredential.findMany({
    where: { provider: { in: [...MARKETING_FREE_PROVIDERS] }, enabled: true },
    select: {
      id: true,
      provider: true,
      label: true,
      lastSuccessAt: true,
      lastErrorAt: true,
      lastErrorCode: true,
    },
    orderBy: [{ provider: "asc" }, { priority: "asc" }],
  });

  const outcomes: ProviderProbeOutcome[] = [];
  for (const credential of credentials) {
    if (!providerProbeDue({ now, ...credential })) {
      outcomes.push({
        provider: credential.provider,
        label: credential.label,
        status: "skipped",
      });
      continue;
    }
    try {
      const result = await checkCredentialHealth(PROBE_ACTOR, credential.id);
      outcomes.push({
        provider: credential.provider,
        label: credential.label,
        status: result.health.status,
        code: result.health.code,
        message: result.health.message,
      });
      if (result.health.status === "ok") {
        await resolveMarketingSignal(`provider:${credential.provider}`).catch(() => undefined);
      } else {
        await upsertMarketingSignal({
          key: `provider:${credential.provider}`,
          kind: "CONNECTOR",
          // A provider being unavailable degrades the pool, it does not stop
          // the agent: the router simply routes around it.
          severity: "WARNING",
          title: `Бесплатная модель недоступна: ${credential.provider}`,
          summary: result.health.message
            ?? `Проверка вернула статус ${result.health.status}`,
          evidence: {
            provider: credential.provider,
            code: result.health.code ?? null,
            checkedAt: now.toISOString(),
          },
        }).catch(() => undefined);
      }
    } catch (error) {
      log.error("marketing-provider-health.failed", {
        provider: credential.provider,
        error: serializeError(error),
      });
      outcomes.push({
        provider: credential.provider,
        label: credential.label,
        status: "down",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcomes;
}
