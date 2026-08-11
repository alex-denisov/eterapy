/**
 * B703 — ключи бесплатных коннекторов доезжают ВЫКАТКОЙ, а не рукой в панели.
 *
 * Правило владельца: «механизм с ручным шагом = невыполненный». Коннектор,
 * который работает только после того, как человек откроет `/admin/ai` и
 * вставит ключ, — это не механизм: он развалится на следующей же чистой базе,
 * на стенде и на новой ноде флота, и каждый раз это будет выглядеть как
 * «провайдеры опять не работают».
 *
 * Поэтому источник истины — оверлей `.env`, который приезжает выкаткой, а не
 * строка в базе. Бутстрап приводит базу к оверлею и делает это идемпотентно:
 * повторный заход при неизменном ключе не пишет ничего.
 *
 * ЧЕГО ОН НАМЕРЕННО НЕ ДЕЛАЕТ:
 *  • не трогает провайдера, ключ которого в оверлее не задан — иначе выкатка с
 *    неполным оверлеем гасила бы живой коннектор;
 *  • не перезаписывает ключ, заведённый человеком под другой меткой — у
 *    провайдера может быть несколько ключей, и наш здесь ровно один, свой;
 *  • не включает провайдера повторно. `enabled` ставится ТОЛЬКО при создании
 *    строки; при обновлении поле не трогается вовсе. Иначе оператор, выключивший
 *    сбоящий коннектор, получал бы его обратно на ближайшем заходе воркера —
 *    и выключатель в панели перестал бы что-либо значить.
 */

import { AIProvider } from "@prisma/client";
import db from "@/lib/db";
import { encryptSecret, isAICredentialEncryptionConfigured } from "@/lib/ai-gateway/credentials-crypto";
import { AI_PROVIDER_LABELS } from "@/lib/ai-gateway/domain";
import {
  DEFAULT_PROVIDER_MODELS,
  DIRECT_PROVIDER_BASE_URLS,
  FREE_TIER_LLM_PROVIDERS,
} from "@/lib/ai-gateway/provider-runtime";
import { log, serializeError } from "@/lib/logger";

/** Метка строки, которой владеет бутстрап. Чужие метки он не трогает. */
export const FREE_TIER_CREDENTIAL_LABEL = "env:b703";

/**
 * Имя переменной окружения — то самое, что владелец назвал в
 * `infra-credentials.env`. Переименовывать его «для единообразия» нельзя:
 * оверлей собирается по этим именам, и расхождение читалось бы как «ключа
 * нет», хотя ключ есть.
 */
export const FREE_TIER_ENV_KEYS: Record<string, string> = {
  [AIProvider.KILOCODE]: "KILO_CODE_AI_API_KEY",
  [AIProvider.NVIDIA]: "NVIDIA_NIM_API_KEY",
  [AIProvider.OPENCODE_ZEN]: "OPENCODE_ZEN_AI_API_KEY",
  [AIProvider.TOKENROUTER]: "TOKENROUTER_API_KEY",
  [AIProvider.SAMBANOVA]: "SAMBANOVA_CLOUD_API_KEY",
  [AIProvider.POLLINATIONS]: "POLLINATIONS_AI_API_KEY",
  [AIProvider.HUGGINGFACE]: "HUGGINGFACE_HUB_API_KEY",
};

export interface FreeTierBootstrapResult {
  configured: AIProvider[];
  missingKey: AIProvider[];
  skipped: "encryption-not-configured" | null;
}

function envKeyFor(provider: AIProvider): string | null {
  const name = FREE_TIER_ENV_KEYS[provider];
  if (!name) return null;
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Приводит строки провайдера и ключа к оверлею.
 *
 * Ключ шифруется при каждом заходе заново, поэтому сравнивать шифротекст со
 * старым бессмысленно — соль у него своя. Признак «ничего не изменилось»
 * поэтому не вычисляется: `update` с тем же значением стоит один запрос раз в
 * заход воркера и не стоит хитрости, которая однажды не заметит смену ключа.
 */
export async function bootstrapFreeTierLLMProviders(): Promise<FreeTierBootstrapResult> {
  if (!isAICredentialEncryptionConfigured()) {
    // Без ключа шифрования запись секрета невозможна. Это не повод падать:
    // остальной контур работает, а коннекторы просто не поднимутся.
    log.warn("ai-free-tier-bootstrap.skipped", { reason: "encryption-not-configured" });
    return { configured: [], missingKey: [], skipped: "encryption-not-configured" };
  }

  const configured: AIProvider[] = [];
  const missingKey: AIProvider[] = [];

  for (const provider of FREE_TIER_LLM_PROVIDERS) {
    const apiKey = envKeyFor(provider);
    if (!apiKey) {
      missingKey.push(provider);
      continue;
    }

    try {
      await db.aIProviderConfig.upsert({
        where: { provider },
        create: {
          provider,
          displayName: AI_PROVIDER_LABELS[provider],
          enabled: true,
          priority: 90,
          baseUrl: DIRECT_PROVIDER_BASE_URLS[provider],
          defaultModel: DEFAULT_PROVIDER_MODELS[provider],
          // Бесплатные тарифы отвечают заметно медленнее платных: у части
          // моделей первый ответ идёт десятки секунд. Тридцати секунд по
          // умолчанию им не хватает, и обрыв по сроку выглядел бы как отказ
          // провайдера.
          timeoutMs: 60_000,
          inputTokenCostMicros: 0,
          outputTokenCostMicros: 0,
          metadata: { source: FREE_TIER_CREDENTIAL_LABEL },
        },
        update: {
          // Адрес и модель по умолчанию — наши, и они обязаны догонять код:
          // именно здесь чинится опечатка в хосте без похода в панель.
          baseUrl: DIRECT_PROVIDER_BASE_URLS[provider],
          defaultModel: DEFAULT_PROVIDER_MODELS[provider],
        },
      });

      await db.aIProviderCredential.upsert({
        where: { provider_label: { provider, label: FREE_TIER_CREDENTIAL_LABEL } },
        create: {
          provider,
          label: FREE_TIER_CREDENTIAL_LABEL,
          encryptedKey: encryptSecret(apiKey),
          enabled: true,
          priority: 100,
        },
        update: {
          encryptedKey: encryptSecret(apiKey),
        },
      });

      configured.push(provider);
    } catch (error) {
      // Отказ по одному провайдеру не должен уносить остальные шесть.
      log.error("ai-free-tier-bootstrap.provider_failed", {
        provider,
        error: serializeError(error),
      });
    }
  }

  log.info("ai-free-tier-bootstrap.done", {
    configured: configured.length,
    missingKey,
  });

  return { configured, missingKey, skipped: null };
}
