/**
 * B633 — шлюз наружу для моделей.
 *
 * Живая проба прода 2026-07-30 22:00 UTC: OpenAI через Cloudflare AI Gateway
 * отвечает `403 Country, region, or territory not supported`, OpenRouter через
 * тот же шлюз — `403 "Access denied by security policy."`, Groq и Cerebras
 * напрямую — `403`. То есть шлюз Cloudflare географию НЕ скрывает, и три
 * провайдера из пула мертвы по стране, а не по ключу.
 *
 * Тесты держат две границы шлюза: закрытый список адресов и обязательный
 * секрет. И одну границу клиента: секрет уходит только на наш собственный
 * шлюз, а не в Cloudflare и не провайдеру.
 */

import {
  EDGE_RELAY_UPSTREAMS,
  edgeRelayHeaders,
  edgeRelaySecretMatches,
  edgeRelayTarget,
  isEdgeRelayUpstream,
} from "@/lib/integrations/edge-relay";
import {
  cloudflareGatewayAuthHeaders,
  eterapyRelayAuthHeaders,
  isEterapyRelayUrl,
} from "@/lib/ai-gateway/cloudflare-gateway";

const RELAY = "https://107.172.153.202.sslip.io/api/integrations/edge/relay";

describe("B633 · шлюз наружу", () => {
  beforeEach(() => {
    process.env.META_GRAPH_PROXY_BASE = RELAY;
    process.env.META_GRAPH_PROXY_SECRET = "shared-secret";
    delete process.env.CF_AI_GATEWAY_TOKEN;
  });

  afterEach(() => {
    delete process.env.META_GRAPH_PROXY_BASE;
    delete process.env.META_GRAPH_PROXY_SECRET;
  });

  it("список адресов закрыт: произвольный хост через шлюз не пройдёт", () => {
    expect(isEdgeRelayUpstream("openrouter")).toBe(true);
    expect(isEdgeRelayUpstream("threads")).toBe(true);
    expect(isEdgeRelayUpstream("evil-host")).toBe(false);
    expect(isEdgeRelayUpstream("__proto__")).toBe(false);
  });

  it("в списке есть все провайдеры, которым отказали по стране", () => {
    for (const key of ["openai", "openrouter", "groq", "cerebras"] as const) {
      expect(EDGE_RELAY_UPSTREAMS[key]).toMatch(/^https:\/\//);
    }
  });

  it("путь и строка запроса переносятся без изменений", () => {
    const target = edgeRelayTarget("openrouter", ["api", "v1", "chat", "completions"], "?beta=1");
    expect(target.toString()).toBe("https://openrouter.ai/api/v1/chat/completions?beta=1");
  });

  it("без секрета шлюз не отвечает", () => {
    expect(edgeRelaySecretMatches(null)).toBe(false);
    expect(edgeRelaySecretMatches("wrong-secret-of-same-len")).toBe(false);
    expect(edgeRelaySecretMatches("shared-secret")).toBe(true);
  });

  it("секрет шлюза и кука наружу не уходят", () => {
    const source = new Headers({
      authorization: "Bearer provider-key",
      "content-type": "application/json",
      cookie: "session=1",
      "x-eterapy-proxy": "shared-secret",
      host: "107.172.153.202.sslip.io",
    });
    const forwarded = edgeRelayHeaders(source);
    expect(forwarded.get("authorization")).toBe("Bearer provider-key");
    expect(forwarded.get("content-type")).toBe("application/json");
    expect(forwarded.get("x-eterapy-proxy")).toBeNull();
    expect(forwarded.get("cookie")).toBeNull();
    expect(forwarded.get("host")).toBeNull();
  });

  it("клиент подписывает запрос только на наш шлюз", () => {
    expect(isEterapyRelayUrl(`${RELAY}/openrouter/api/v1`)).toBe(true);
    expect(eterapyRelayAuthHeaders(`${RELAY}/openai/v1`))
      .toEqual({ "x-eterapy-proxy": "shared-secret" });
    // Ни Cloudflare, ни сам провайдер наш секрет получить не должны.
    expect(eterapyRelayAuthHeaders("https://gateway.ai.cloudflare.com/v1/acc/gw/openai")).toEqual({});
    expect(eterapyRelayAuthHeaders("https://api.openai.com/v1")).toEqual({});
  });

  it("общая точка заголовков различает шлюз Cloudflare и наш", () => {
    process.env.CF_AI_GATEWAY_TOKEN = "cf-token";
    expect(cloudflareGatewayAuthHeaders(`${RELAY}/groq/openai/v1`))
      .toEqual({ "x-eterapy-proxy": "shared-secret" });
    expect(cloudflareGatewayAuthHeaders("https://gateway.ai.cloudflare.com/v1/acc/gw/openai"))
      .toEqual({ "cf-aig-authorization": "Bearer cf-token" });
    expect(cloudflareGatewayAuthHeaders("https://api.groq.com/openai/v1")).toEqual({});
  });

  it("без настроенного шлюза подпись не появляется вовсе", () => {
    delete process.env.META_GRAPH_PROXY_BASE;
    expect(isEterapyRelayUrl(`${RELAY}/openai/v1`)).toBe(false);
    expect(eterapyRelayAuthHeaders(`${RELAY}/openai/v1`)).toEqual({});
  });
});
