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
 * Codes that describe an account-level decision by the provider. Re-probing
 * them constantly is pointless traffic, so they are checked far less often —
 * but they are still checked, because the owner may fix billing or swap the
 * account at any moment and nothing should require a redeploy afterwards.
 */
const ACCOUNT_LEVEL_CODES = new Set([
  "INSUFFICIENT_CREDITS",
  "PROVIDER_RESTRICTED",
  "INVALID_KEY",
  "MISSING_CONFIG",
]);

/**
 * Владелец 2026-07-30: «нужно чтобы какой-то скрипт обходил все модели с
 * периодичностью раз в 15 минут». Прежние интервалы (6 ч у здорового, 45 мин у
 * упавшего) означали, что панель показывала не текущее состояние, а отметку
 * многочасовой давности: провайдер, который восстановился, оставался красным
 * почти до конца рабочего дня.
 *
 * Здоровый провайдер проверяется реже упавшего не ради экономии, а потому что
 * проба — это настоящий запрос к модели и он тратит ту же бесплатную квоту,
 * которую агент использует для генерации. Час у здорового и пятнадцать минут у
 * упавшего — компромисс, при котором панель актуальна там, где это важно.
 */
const HEALTHY_INTERVAL_MS = 60 * 60_000;
const FAILING_INTERVAL_MS = 15 * 60_000;
/**
 * Решение уровня аккаунта (кончились кредиты, ключ отозван) провайдер меняет не
 * сам, а владелец. Но проверять его всё равно надо чаще, чем раз в полсуток:
 * подставленный новый ключ должен начать работать без выкатки и без клика.
 */
const ACCOUNT_LEVEL_INTERVAL_MS = 30 * 60_000;

export function providerProbeDue(input: {
  now: Date;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCode: string | null;
}): boolean {
  const healthy = Boolean(
    input.lastSuccessAt
    && (!input.lastErrorAt || input.lastSuccessAt > input.lastErrorAt),
  );
  const lastChecked = [input.lastSuccessAt, input.lastErrorAt]
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  if (!lastChecked) return true;
  const interval = healthy
    ? HEALTHY_INTERVAL_MS
    : ACCOUNT_LEVEL_CODES.has(input.lastErrorCode ?? "")
      ? ACCOUNT_LEVEL_INTERVAL_MS
      : FAILING_INTERVAL_MS;
  return input.now.getTime() - lastChecked.getTime() >= interval;
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
