/**
 * B703 — семь коннекторов LLM на бесплатных тарифах.
 *
 * Прогоны держат ровно то, что было СНЯТО живой пробой боевых ключей
 * 2026-08-11, а не то, что обещает документация вендоров. Две находки той
 * пробы стоили бы дня разбора, если бы просочились на прод:
 *
 *  • `kilocode.ai` отвечает `308` и переносит на `kilo.ai/api/openrouter`;
 *  • `api.tokenrouter.io` живой, но ждёт ключ формата `tr_…` и на наш `sk-…`
 *    отвечает `401` — это читается как «владелец дал негодный ключ».
 *
 * Обе проверяются здесь адресом, потому что оба хоста «выглядят правильно».
 */

import { AIProvider } from "@prisma/client";
import { AI_GATEWAY_PROVIDERS, AI_PROVIDER_LABELS } from "@/lib/ai-gateway/domain";
import { preferredGatewayForProvider } from "@/lib/ai-gateway/edge-model-gateway";
import { FOREIGN_AI_PROVIDERS, isForeignAIProvider } from "@/lib/ai-gateway/cross-border-gate";
import {
  DEFAULT_PROVIDER_MODELS,
  DIRECT_PROVIDER_BASE_URLS,
  FREE_TIER_LLM_PROVIDERS,
  providerLabel,
} from "@/lib/ai-gateway/provider-runtime";
import {
  MARKETING_ACTIVE_PROVIDERS,
  MARKETING_FREE_PROVIDERS,
  MARKETING_MODEL_RELEASE_CUTOFF,
  MARKETING_REVIEWER_MODEL_PREFERENCES,
  MARKETING_WRITER_MODEL_PREFERENCES,
  marketingModelFreshness,
  marketingPoolCanSeparateRoles,
  marketingProvidersWithSingleModel,
} from "@/lib/marketing/model-pool";
import { getReferenceModelPricing } from "@/lib/ai-gateway/model-pricing-reference";
import { EDGE_RELAY_UPSTREAMS } from "@/lib/integrations/edge-relay";

const RELAY_ORIGIN = "https://107.172.153.202.sslip.io";

/** Адрес, который ФАКТИЧЕСКИ ответил боевому ключу. */
const LIVE_BASE_URLS: Record<string, string> = {
  [AIProvider.KILOCODE]: "https://kilo.ai/api/openrouter",
  [AIProvider.NVIDIA]: "https://integrate.api.nvidia.com/v1",
  [AIProvider.OPENCODE_ZEN]: "https://opencode.ai/zen/v1",
  [AIProvider.TOKENROUTER]: "https://api.tokenrouter.com/v1",
  [AIProvider.SAMBANOVA]: "https://api.sambanova.ai/v1",
  [AIProvider.POLLINATIONS]: "https://text.pollinations.ai/openai",
  [AIProvider.HUGGINGFACE]: "https://router.huggingface.co/v1",
};

/** Модель, которая ответила `200` при НУЛЕВОМ балансе аккаунта. */
const LIVE_FREE_MODELS: Record<string, string> = {
  [AIProvider.KILOCODE]: "nvidia/nemotron-3.5-lightning:free",
  [AIProvider.NVIDIA]: "nvidia/nemotron-3-super-120b-a12b",
  [AIProvider.OPENCODE_ZEN]: "deepseek-v4-flash-free",
  [AIProvider.TOKENROUTER]: "moonshotai/kimi-k3-free",
  [AIProvider.SAMBANOVA]: "gemma-4-31B-it",
  [AIProvider.POLLINATIONS]: "openai-fast",
  [AIProvider.HUGGINGFACE]: "prism-ml/Ternary-Bonsai-27B-AWQ-4bit",
};

describe("B703 · коннекторы на бесплатных тарифах", () => {
  it("заведены все семь ключей владельца", () => {
    expect([...FREE_TIER_LLM_PROVIDERS].sort()).toEqual([
      AIProvider.HUGGINGFACE,
      AIProvider.KILOCODE,
      AIProvider.NVIDIA,
      AIProvider.OPENCODE_ZEN,
      AIProvider.POLLINATIONS,
      AIProvider.SAMBANOVA,
      AIProvider.TOKENROUTER,
    ].sort());
  });

  it.each(FREE_TIER_LLM_PROVIDERS)("%s ходит по адресу, который ответил живому ключу", (provider) => {
    expect(DIRECT_PROVIDER_BASE_URLS[provider]).toBe(LIVE_BASE_URLS[provider]);
  });

  it("адрес Kilo — kilo.ai, а не kilocode.ai с редиректом", () => {
    // Редирект на `POST` теряет тело у части клиентов: вызов модели ушёл бы
    // пустым, а ошибка выглядела бы как «провайдер не понимает запрос».
    expect(DIRECT_PROVIDER_BASE_URLS[AIProvider.KILOCODE]).not.toContain("kilocode.ai");
  });

  it("адрес TokenRouter — .com, а не .io с чужим форматом ключа", () => {
    // `.io` отвечает 401 «Pass Bearer tr_…» — это читается как протухший ключ.
    expect(DIRECT_PROVIDER_BASE_URLS[AIProvider.TOKENROUTER]).not.toContain("tokenrouter.io");
  });

  it.each(FREE_TIER_LLM_PROVIDERS)("%s по умолчанию берёт бесплатную модель", (provider) => {
    expect(DEFAULT_PROVIDER_MODELS[provider]).toBe(LIVE_FREE_MODELS[provider]);
  });

  it.each(FREE_TIER_LLM_PROVIDERS)("%s виден в суперадминке и назван по-человечески", (provider) => {
    expect(AI_GATEWAY_PROVIDERS).toContain(provider);
    expect(AI_PROVIDER_LABELS[provider]).toBeTruthy();
  });

  it.each(FREE_TIER_LLM_PROVIDERS)("%s не представляется чужим именем", (provider) => {
    // До B703 хвост цепочки возвращал "fireworks" для всего незнакомого — по
    // этому полю судят, кто именно написал материал.
    expect(providerLabel(provider)).not.toBe("fireworks");
  });

  it.each(FREE_TIER_LLM_PROVIDERS)("%s считается зарубежным и проходит трансграничный гейт", (provider) => {
    expect(isForeignAIProvider(provider)).toBe(true);
    expect(FOREIGN_AI_PROVIDERS).toContain(provider);
  });
});

describe("B703 · контролируемый шлюз", () => {
  beforeEach(() => {
    process.env.META_GRAPH_PROXY_BASE = `${RELAY_ORIGIN}/api/integrations/meta/relay`;
    process.env.META_GRAPH_PROXY_SECRET = "shared-secret";
  });

  afterEach(() => {
    delete process.env.META_GRAPH_PROXY_BASE;
    delete process.env.META_GRAPH_PROXY_SECRET;
  });

  it.each(FREE_TIER_LLM_PROVIDERS)("у %s есть НАШ шлюз — у Cloudflare соответствия нет", (provider) => {
    const gateway = preferredGatewayForProvider({
      provider,
      directBaseUrl: DIRECT_PROVIDER_BASE_URLS[provider],
      cloudflareUrl: null,
    });
    expect(gateway.kind).toBe("eterapy-edge");
    expect(gateway.url).toBeTruthy();
  });

  it.each(FREE_TIER_LLM_PROVIDERS)("адрес %s через шлюз сохраняет хвост прямого адреса", (provider) => {
    const direct = DIRECT_PROVIDER_BASE_URLS[provider]!;
    const suffix = new URL(direct).pathname.replace(/\/+$/, "");
    const gateway = preferredGatewayForProvider({
      provider,
      directBaseUrl: direct,
      cloudflareUrl: null,
    });
    // Вторая копия хвостов однажды разъехалась бы с первой и дала 404.
    expect(gateway.url?.endsWith(suffix)).toBe(true);
  });

  it("белый список шлюза знает origin каждого нового провайдера", () => {
    const allowed = new Set(Object.values(EDGE_RELAY_UPSTREAMS));
    for (const provider of FREE_TIER_LLM_PROVIDERS) {
      expect(allowed).toContain(new URL(DIRECT_PROVIDER_BASE_URLS[provider]!).origin);
    }
  });
});

describe("B703 · пул SMM", () => {
  it("все семь допущены политикой публичного SMM-контура", () => {
    for (const provider of FREE_TIER_LLM_PROVIDERS) {
      expect(MARKETING_FREE_PROVIDERS).toContain(provider);
    }
  });

  it("Pollinations виден, но в непрерывную генерацию не допущен", () => {
    // Единственная модель тарифа — gpt-oss-20b от 2025-08-05, старше рубежа.
    expect(MARKETING_FREE_PROVIDERS).toContain(AIProvider.POLLINATIONS);
    expect(MARKETING_ACTIVE_PROVIDERS).not.toContain(AIProvider.POLLINATIONS);
    expect(MARKETING_WRITER_MODEL_PREFERENCES[AIProvider.POLLINATIONS]).toBeUndefined();
  });

  it("остальные шесть допущены к непрерывной генерации", () => {
    for (const provider of FREE_TIER_LLM_PROVIDERS) {
      if (provider === AIProvider.POLLINATIONS) continue;
      expect(MARKETING_ACTIVE_PROVIDERS).toContain(provider);
    }
  });

  it("активный пул вырос вдвое — это и есть рычаг ёмкости B699", () => {
    expect(MARKETING_ACTIVE_PROVIDERS.length).toBe(12);
  });

  it.each([
    AIProvider.KILOCODE,
    AIProvider.NVIDIA,
    AIProvider.OPENCODE_ZEN,
    AIProvider.HUGGINGFACE,
  ])("%s в одиночку тянет конвейер: автор и редактор — разные модели", (provider) => {
    expect(marketingPoolCanSeparateRoles([provider])).toBe(true);
    expect(MARKETING_WRITER_MODEL_PREFERENCES[provider])
      .not.toBe(MARKETING_REVIEWER_MODEL_PREFERENCES[provider]);
  });

  it("SambaNova и TokenRouter названы одномодельными вслух, а не молчат", () => {
    // Вторая модель у обоих отвечает 402/403 при нулевом балансе. Вписать её
    // ради разведения ролей значило бы получить отказ по оплате в бою.
    const single = marketingProvidersWithSingleModel();
    expect(single).toContain(AIProvider.SAMBANOVA);
    expect(single).toContain(AIProvider.TOKENROUTER);
  });

  it.each(MARKETING_ACTIVE_PROVIDERS)("модель автора у %s свежее рубежа пула", (provider) => {
    const model = MARKETING_WRITER_MODEL_PREFERENCES[provider];
    expect(model).toBeTruthy();
    const freshness = marketingModelFreshness(model!);
    expect(freshness.eligible).toBe(true);
    expect(freshness.releaseDate! >= MARKETING_MODEL_RELEASE_CUTOFF).toBe(true);
  });

  it.each(MARKETING_ACTIVE_PROVIDERS)("модель редактора у %s свежее рубежа пула", (provider) => {
    const model = MARKETING_REVIEWER_MODEL_PREFERENCES[provider];
    expect(model).toBeTruthy();
    expect(marketingModelFreshness(model!).eligible).toBe(true);
  });
});

describe("B703 · цена", () => {
  it.each(FREE_TIER_LLM_PROVIDERS)("расход по %s не рисуется там, где денег нет", (provider) => {
    const pricing = getReferenceModelPricing(provider, LIVE_FREE_MODELS[provider]);
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(0);
    expect(pricing!.output).toBe(0);
  });
});
