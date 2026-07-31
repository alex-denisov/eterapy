/**
 * B634 — контролируемый шлюз для моделей: наш собственный, а не только Cloudflare.
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ СУЩЕСТВУЕТ. B633 показал замером, что Cloudflare AI Gateway
 * географию не скрывает: он идёт к провайдеру из ближайшей к нам точки
 * присутствия, провайдер видит российский выход и отвечает `403 Country … not
 * supported`. Шлюз на нашей зарубежной ноде был выпущен и работает, но
 * подключить его к моделям было нельзя: `resolvedProviderBaseUrl` в режиме
 * «требуется шлюз» строил адрес Cloudflare сам и игнорировал любую настройку.
 * Владелец 2026-07-31: «те LLM, которые должны были идти через CF, теперь не
 * работают — это нужно исправить».
 *
 * ЧТО ИЗМЕНИЛОСЬ ПО СМЫСЛУ. Требование было «шлюз Cloudflare», стало
 * «контролируемый шлюз»: наша нода, наш образ, наша выкатка, наши журналы. Для
 * трансграничного контроля это не ослабление, а усиление — у Cloudflare мы
 * видим только их панель, у себя видим всё. Какой именно шлюз использован,
 * маршрутное доказательство теперь называет прямо (`gateway`), а не оставляет
 * догадываться по одному булеву полю.
 *
 * ПОРЯДОК ВЫБОРА ЖЁСТКИЙ И ТОЛЬКО НА УРОВНЕ НАСТРОЙКИ: свой шлюз, если он
 * настроен; иначе Cloudflare. Отката «на лету» при ошибке нет намеренно —
 * молчаливый уход с рабочего пути на нерабочий вернул бы ту же страновую
 * блокировку и выглядел бы как «иногда работает».
 */

import { AIProvider } from "@prisma/client";
import {
  EDGE_RELAY_UPSTREAMS,
  edgeRelayModelBase,
  type EdgeRelayUpstream,
} from "@/lib/integrations/edge-relay";

/**
 * Какой ключ шлюза отвечает за провайдера. Это НЕ то же самое, что имя
 * провайдера у Cloudflare: там свой словарь, здесь — первый сегмент нашего
 * пути, и совпадение имён случайно.
 */
const RELAY_UPSTREAM_BY_PROVIDER: Partial<Record<AIProvider, EdgeRelayUpstream>> = {
  [AIProvider.OPENAI]: "openai",
  [AIProvider.OPENROUTER]: "openrouter",
  [AIProvider.GROQ]: "groq",
  [AIProvider.CEREBRAS]: "cerebras",
  [AIProvider.MISTRAL]: "mistral",
  [AIProvider.COHERE]: "cohere",
  [AIProvider.ANTHROPIC]: "anthropic",
  [AIProvider.GEMINI]: "gemini",
};

export type AIGatewayKind = "eterapy-edge" | "cloudflare" | "none";

export function relayUpstreamForAIProvider(provider: AIProvider): EdgeRelayUpstream | null {
  return RELAY_UPSTREAM_BY_PROVIDER[provider] ?? null;
}

/**
 * Адрес провайдера через наш шлюз.
 *
 * Хвост пути берётся из ПРЯМОГО адреса провайдера, а не переписывается здесь
 * руками: у OpenRouter это `/api/v1`, у Groq `/openai/v1`, у Cohere
 * `/compatibility/v1`. Держать вторую копию этих хвостов означало бы однажды
 * поменять один и забыть другой — и получить 404 вместо ответа модели.
 *
 * `directBaseUrl` передаётся аргументом, а не импортируется: таблица прямых
 * адресов живёт в `provider-runtime`, который сам вызывает эту функцию.
 */
export function buildEterapyRelayUrlForAIProvider(input: {
  provider: AIProvider;
  directBaseUrl: string | null | undefined;
}): string | null {
  const upstream = relayUpstreamForAIProvider(input.provider);
  if (!upstream) return null;
  const relayBase = edgeRelayModelBase();
  if (!relayBase || !input.directBaseUrl) return null;
  let suffix: string;
  try {
    const direct = new URL(input.directBaseUrl);
    // Хост уже закодирован ключом шлюза; сверка защищает от расхождения таблиц.
    if (direct.origin !== EDGE_RELAY_UPSTREAMS[upstream]) return null;
    suffix = direct.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
  return `${relayBase}/${upstream}${suffix}`;
}

/**
 * Какой контролируемый шлюз доступен для провайдера прямо сейчас. Используется
 * и при выборе адреса, и при записи маршрутного доказательства — одна функция,
 * чтобы доказательство не могло разойтись с фактическим маршрутом.
 */
export function preferredGatewayForProvider(input: {
  provider: AIProvider;
  directBaseUrl: string | null | undefined;
  cloudflareUrl: string | null;
}): { kind: AIGatewayKind; url: string | null } {
  const relayUrl = buildEterapyRelayUrlForAIProvider({
    provider: input.provider,
    directBaseUrl: input.directBaseUrl,
  });
  if (relayUrl) return { kind: "eterapy-edge", url: relayUrl };
  if (input.cloudflareUrl) return { kind: "cloudflare", url: input.cloudflareUrl };
  return { kind: "none", url: null };
}
