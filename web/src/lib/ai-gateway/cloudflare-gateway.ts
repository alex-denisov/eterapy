/**
 * Cloudflare AI Gateway helpers.
 *
 * CF AI Gateway proxies provider requests through Cloudflare's edge so that
 * (a) egress originates from CF IPs (works around region blocks on the
 * upstream provider), and (b) you get caching / observability / rate limits.
 *
 * Runtime config flows through env vars rather than the credential record so
 * that token rotation does not require a DB write:
 *   CF_AI_GATEWAY_ACCOUNT_ID  — public account identifier
 *   CF_AI_GATEWAY_ID          — gateway slug (e.g. "eterapy-openai")
 *   CF_AI_GATEWAY_TOKEN       — authenticated-gateway bearer token (secret)
 *
 * The actual baseURL is stored per-credential in `baseUrlOverride` so admins
 * can selectively route some OpenAI keys through the gateway and others
 * directly. The OpenAI adapter detects a CF Gateway URL and attaches the
 * `cf-aig-authorization` header automatically when the token is present.
 */

const CF_AI_GATEWAY_HOST = "gateway.ai.cloudflare.com";
export type CloudflareGatewayProvider = "openai" | "anthropic" | "groq" | "azure-openai";

export interface CloudflareGatewayConfig {
  accountId: string;
  gatewayId: string;
  hasToken: boolean;
}

export function getCloudflareGatewayConfig(): CloudflareGatewayConfig | null {
  const accountId = process.env.CF_AI_GATEWAY_ACCOUNT_ID?.trim();
  const gatewayId = process.env.CF_AI_GATEWAY_ID?.trim();
  if (!accountId || !gatewayId) return null;
  return {
    accountId,
    gatewayId,
    hasToken: Boolean(process.env.CF_AI_GATEWAY_TOKEN?.trim()),
  };
}

export function buildCloudflareGatewayUrl(input: {
  accountId: string;
  gatewayId: string;
  provider: CloudflareGatewayProvider;
}): string {
  return `https://gateway.ai.cloudflare.com/v1/${input.accountId}/${input.gatewayId}/${input.provider}`;
}

export function isCloudflareAIGatewayUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return new URL(url).host === CF_AI_GATEWAY_HOST;
  } catch {
    return false;
  }
}

export function cloudflareGatewayAuthHeaders(baseURL: string | undefined | null): Record<string, string> {
  if (!isCloudflareAIGatewayUrl(baseURL)) return {};
  const token = process.env.CF_AI_GATEWAY_TOKEN?.trim();
  if (!token) return {};
  return { "cf-aig-authorization": `Bearer ${token}` };
}
