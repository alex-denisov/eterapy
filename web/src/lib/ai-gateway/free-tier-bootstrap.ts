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
import { MARKETING_RETIRED_PROVIDERS } from "@/lib/marketing/model-pool";
import { parseServiceAccount } from "@/lib/ai-gateway/google-service-account";
import { log, serializeError } from "@/lib/logger";

/** Метка строки, которой владеет бутстрап. Чужие метки он не трогает. */
export const FREE_TIER_CREDENTIAL_LABEL = "env:b703";

/** Метка, которой помечен провайдер, выключенный за отсутствие живых ответов. */
export const RETIRED_MARKER = "b742-no-successful-calls";

/**
 * B742 — метка ключа Vertex.
 *
 * Отдельная строка credential'а, а не подмена существующей: ключ AI Studio
 * остаётся на месте и работает как запасной путь. Если сервисный аккаунт
 * отзовут или кредиты кончатся, голова пула не встанет — она упадёт на
 * соседний ключ того же провайдера, как и задумано ротацией.
 */
export const VERTEX_CREDENTIAL_LABEL = "env:b742-vertex";

/**
 * Имя переменной с JSON сервисного аккаунта Google Cloud.
 *
 * ⚠ ПОЧЕМУ ЧЕРЕЗ ОКРУЖЕНИЕ, А НЕ ВВОДОМ В ПАНЕЛИ. Владелец не правит секреты
 * руками — они доезжают выкаткой; механизм с ручным шагом это невыполненный
 * механизм. От владельца нужен ровно один шаг, которого никто за него сделать
 * не может: выпустить сервисный аккаунт в своём проекте Google Cloud и
 * положить его JSON в секрет репозитория. Дальше ключ поднимается сам.
 */
export const VERTEX_ENV_KEY = "GEMINI_VERTEX_SERVICE_ACCOUNT";

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
  /** Поднят ли ключ Vertex этим заходом (B742). */
  vertex: "configured" | "invalid" | "absent";
  missingKey: AIProvider[];
  /** Провайдеры, физически выключенные этим заходом (B742). */
  retired: AIProvider[];
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
    return {
      configured: [],
      missingKey: [],
      retired: [],
      vertex: "absent",
      skipped: "encryption-not-configured",
    };
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

  /**
   * B742 — МЁРТВЫЕ ПРОВАЙДЕРЫ ВЫКЛЮЧАЮТСЯ ФИЗИЧЕСКИ, А НЕ ТОЛЬКО СПИСКОМ.
   *
   * Требование владельца 2026-09-12: «их надо исключить из пулов выключив
   * физически чтобы они не мешали пайплайну никак и не были в них
   * задействованы».
   *
   * До этой правки трое (Cerebras, Cohere, TokenRouter) были убраны из
   * `MARKETING_ACTIVE_PROVIDERS`, то есть маркетинговый обход их не звал. Но
   * строка провайдера в базе оставалась `enabled`, и это не пустяк: по ней
   * провайдер виден в суперадминке как рабочий, сторожевая проба ходит к нему
   * каждые пятнадцать минут и записывает отказ, а любой НЕмаркетинговый
   * маршрут (у него свой порядок провайдеров) по-прежнему мог его выбрать.
   *
   * Выключатель ставится ОДИН РАЗ при старте воркера — тем же заходом, что
   * поднимает ключи. Повторно провайдер не гасится: если человек сознательно
   * включил его обратно в панели, проверив живым вызовом, выкатка не имеет
   * права отменять это решение молча.
   */
  const retired: AIProvider[] = [];
  for (const provider of MARKETING_RETIRED_PROVIDERS) {
    try {
      const row = await db.aIProviderConfig.findUnique({
        where: { provider },
        select: { enabled: true, metadata: true },
      });
      if (!row?.enabled) continue;
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      // Признак «уже гасили» живёт в метаданных строки: без него заход
      // выключал бы провайдера каждый раз, отменяя ручное включение.
      if (metadata.retiredBy === RETIRED_MARKER) continue;
      await db.aIProviderConfig.update({
        where: { provider },
        data: { enabled: false, metadata: { ...metadata, retiredBy: RETIRED_MARKER } },
      });
      retired.push(provider);
    } catch (error) {
      log.warn("ai-free-tier-bootstrap.retire_failed", {
        provider,
        error: serializeError(error),
      });
    }
  }
  if (retired.length > 0) log.info("ai-free-tier-bootstrap.retired", { retired });

  /**
   * B742 — КЛЮЧ VERTEX ПОДНИМАЕТСЯ ТЕМ ЖЕ ЗАХОДОМ.
   *
   * Смысл маршрута — кошелёк: бонусные $300 Google Cloud на Gemini API в
   * AI Studio не распространяются и покрывают Vertex, где живут те же модели.
   * Провайдер остаётся GEMINI (Vertex — дверь, а не поставщик), поэтому
   * потолок расхода, очередь и предпочтения моделей не раздваиваются.
   *
   * Приоритет 10 против 100 у ключа AI Studio: меньше число — раньше очередь.
   * Пока бонусы живы, тратятся они; кончатся или отзовут аккаунт — ротация
   * сама перейдёт на соседний ключ, и контур этого не заметит.
   */
  let vertex: FreeTierBootstrapResult["vertex"] = "absent";
  const vertexSecret = process.env[VERTEX_ENV_KEY]?.trim();
  if (vertexSecret) {
    if (!parseServiceAccount(vertexSecret)) {
      // ⚠ Неразбираемый секрет НЕ пишется. Строка-ключ, которая не является
      // сервисным аккаунтом, ушла бы в ротацию и отбивалась бы 401 на каждом
      // материале — отказ, который выглядит как поломка провайдера.
      vertex = "invalid";
      log.error("ai-free-tier-bootstrap.vertex_invalid", { envKey: VERTEX_ENV_KEY });
    } else {
      try {
        await db.aIProviderCredential.upsert({
          where: { provider_label: { provider: AIProvider.GEMINI, label: VERTEX_CREDENTIAL_LABEL } },
          create: {
            provider: AIProvider.GEMINI,
            label: VERTEX_CREDENTIAL_LABEL,
            encryptedKey: encryptSecret(vertexSecret),
            enabled: true,
            priority: 10,
          },
          update: { encryptedKey: encryptSecret(vertexSecret), enabled: true, priority: 10 },
        });
        vertex = "configured";
      } catch (error) {
        log.error("ai-free-tier-bootstrap.vertex_failed", { error: serializeError(error) });
      }
    }
  }

  log.info("ai-free-tier-bootstrap.done", {
    configured: configured.length,
    missingKey,
    vertex,
  });

  return { configured, missingKey, retired, vertex, skipped: null };
}
