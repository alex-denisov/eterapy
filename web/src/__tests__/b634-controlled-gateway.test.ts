/**
 * B634 — контролируемый шлюз для моделей.
 *
 * Замер B633 показал, что Cloudflare AI Gateway географию не скрывает: OpenAI,
 * OpenRouter, Groq и Cerebras отвечали `403` по стране, и переключить их на наш
 * собственный шлюз было нельзя — режим «требуется шлюз» строил адрес Cloudflare
 * сам и игнорировал настройку. Эти прогоны держат новое поведение.
 */

import { AIProvider } from "@prisma/client";
import {
  buildEterapyRelayUrlForAIProvider,
  preferredGatewayForProvider,
} from "@/lib/ai-gateway/edge-model-gateway";
import {
  controlledGatewayUrlForProvider,
  DIRECT_PROVIDER_BASE_URLS,
  resolvedProviderBaseUrl,
} from "@/lib/ai-gateway/provider-runtime";
import { routingProofForProvider } from "@/lib/ai-gateway/routing-proof";
import { cloudflareGatewayAuthHeaders } from "@/lib/ai-gateway/cloudflare-gateway";
import { edgeRelayModelBase } from "@/lib/integrations/edge-relay";

const RELAY_ORIGIN = "https://107.172.153.202.sslip.io";
const RELAY_BASE = `${RELAY_ORIGIN}/api/integrations/edge/relay`;

function enableRelay() {
  // На проде переменная указывает на путь контура Meta — модели должны
  // вывести из неё свой маршрут сами, иначе настройку пришлось бы дублировать.
  process.env.META_GRAPH_PROXY_BASE = `${RELAY_ORIGIN}/api/integrations/meta/relay`;
  process.env.META_GRAPH_PROXY_SECRET = "shared-secret";
}

describe("B634 · контролируемый шлюз", () => {
  beforeEach(() => {
    delete process.env.META_GRAPH_PROXY_BASE;
    delete process.env.META_GRAPH_PROXY_SECRET;
    process.env.CF_AI_GATEWAY_ACCOUNT_ID = "acc";
    process.env.CF_AI_GATEWAY_ID = "gw";
  });

  afterEach(() => {
    delete process.env.META_GRAPH_PROXY_BASE;
    delete process.env.META_GRAPH_PROXY_SECRET;
    delete process.env.CF_AI_GATEWAY_ACCOUNT_ID;
    delete process.env.CF_AI_GATEWAY_ID;
  });

  it("база шлюза считается из origin переменной Meta, а не из её пути", () => {
    enableRelay();
    expect(edgeRelayModelBase()).toBe(RELAY_BASE);
  });

  it("без секрета база не возвращается — адрес без секрета получил бы 403", () => {
    process.env.META_GRAPH_PROXY_BASE = RELAY_BASE;
    expect(edgeRelayModelBase()).toBeNull();
  });

  it("хвост пути берётся из прямого адреса провайдера и не переписывается руками", () => {
    enableRelay();
    const cases: Array<[AIProvider, string]> = [
      [AIProvider.OPENAI, `${RELAY_BASE}/openai/v1`],
      [AIProvider.OPENROUTER, `${RELAY_BASE}/openrouter/api/v1`],
      [AIProvider.GROQ, `${RELAY_BASE}/groq/openai/v1`],
      [AIProvider.CEREBRAS, `${RELAY_BASE}/cerebras/v1`],
      // Cohere: база — корень хоста, потому что его адаптер дописывает полный
      // родной путь `/v2/chat` (в отличие от остальных, где база кончается
      // версией API).
      [AIProvider.COHERE, `${RELAY_BASE}/cohere`],
      [AIProvider.GEMINI, `${RELAY_BASE}/gemini/v1beta`],
    ];
    for (const [provider, expected] of cases) {
      expect(buildEterapyRelayUrlForAIProvider({
        provider,
        directBaseUrl: DIRECT_PROVIDER_BASE_URLS[provider],
      })).toBe(expected);
    }
  });

  it("Yandex через шлюз не ходит вовсе — он российский и это не трансграничный вызов", () => {
    enableRelay();
    expect(controlledGatewayUrlForProvider(AIProvider.YANDEX)).toEqual({ kind: "none", url: null });
  });

  it("режим «требуется шлюз» отдаёт НАШ шлюз, когда он настроен", () => {
    enableRelay();
    expect(resolvedProviderBaseUrl({
      credential: { baseUrlOverride: null, provider: AIProvider.OPENROUTER },
      requireCloudflareAIGateway: true,
    })).toBe(`${RELAY_BASE}/openrouter/api/v1`);
  });

  it("без нашего шлюза остаётся Cloudflare — поведение не ломается там, где шлюз не настроен", () => {
    expect(resolvedProviderBaseUrl({
      credential: { baseUrlOverride: null, provider: AIProvider.OPENAI },
      requireCloudflareAIGateway: true,
    })).toBe("https://gateway.ai.cloudflare.com/v1/acc/gw/openai");
  });

  it("без единого настроенного шлюза запрос не уходит напрямую, а падает", () => {
    delete process.env.CF_AI_GATEWAY_ACCOUNT_ID;
    delete process.env.CF_AI_GATEWAY_ID;
    expect(() => resolvedProviderBaseUrl({
      credential: { baseUrlOverride: null, provider: AIProvider.OPENAI },
      requireCloudflareAIGateway: true,
    })).toThrow(/controlled AI gateway/i);
  });

  it("выбор шлюза жёсткий: свой, потом Cloudflare, и только на уровне настройки", () => {
    enableRelay();
    expect(preferredGatewayForProvider({
      provider: AIProvider.GROQ,
      directBaseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.GROQ],
      cloudflareUrl: "https://gateway.ai.cloudflare.com/v1/acc/gw/groq",
    }).kind).toBe("eterapy-edge");
  });

  it("маршрутное доказательство называет использованный шлюз, а не догадывается", () => {
    enableRelay();
    const proof = routingProofForProvider({
      provider: AIProvider.OPENAI,
      requireCloudflareAIGateway: true,
    });
    expect(proof.cloudflareAIGatewayUsed).toBe(true);
    expect(proof.gateway).toBe("eterapy-edge");
    expect(proof.crossBorderProcessing).toBe(true);
  });

  // Регрессия, найденная живой пробой на проде 2026-07-31: Cohere отвечал
  // HTTP 404, потому что его прямая база кончалась на `/compatibility/v1`, а
  // адаптер дописывал `/v2/chat`. Через шлюз Cloudflare это не проявлялось —
  // там база без пути. Прогон держит согласованность базы и адаптера.
  it("адрес Cohere складывается с путём его собственного адаптера", () => {
    enableRelay();
    const base = buildEterapyRelayUrlForAIProvider({
      provider: AIProvider.COHERE,
      directBaseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.COHERE],
    });
    expect(`${base}/v2/chat`).toBe(`${RELAY_BASE}/cohere/v2/chat`);
  });

  it("подпись для нашего шлюза добавляется в общей точке заголовков всех адаптеров", () => {
    enableRelay();
    expect(cloudflareGatewayAuthHeaders(`${RELAY_BASE}/groq/openai/v1`))
      .toEqual({ "x-eterapy-proxy": "shared-secret" });
    // Прямой адрес провайдера наш секрет наружу не уносит.
    expect(cloudflareGatewayAuthHeaders(DIRECT_PROVIDER_BASE_URLS[AIProvider.GROQ]!)).toEqual({});
  });
});
