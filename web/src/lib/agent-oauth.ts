/**
 * B469 — минимальный НАСТОЯЩИЙ OAuth 2.0 authorization server для публичной
 * агент-поверхности (MCP/A2A, scope `public:read`).
 *
 * Что это и чем НЕ является:
 *   • RFC 7591 dynamic client registration — stateless: client_secret =
 *     HMAC(client_id, серверный секрет), БД и аккаунтов нет;
 *   • RFC 6749 client_credentials — единственный грант; токен = ES256 JWT на
 *     1 час, aud — публичный MCP-endpoint; токен даёт агенту повышенный
 *     rate-limit на публичном read-only API;
 *   • это НЕ OpenID Connect (id_token не выпускается) и НЕ доступ к личным
 *     кабинетам/данным — пользовательская аутентификация остаётся NextAuth.
 *
 * Ключ подписи — env AGENT_OAUTH_PRIVATE_KEY_JWK (JSON JWK, ES256). Без
 * ключа token endpoint отвечает 503 (fail-closed), метаданные это отражают.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, importJWK, calculateJwkThumbprint, type JWK } from "jose";
import { seoOrigins } from "@/lib/seo";

export const AGENT_OAUTH_SCOPE = "public:read";
export const AGENT_TOKEN_TTL_SECONDS = 3600;

function issuerOrigin(): string {
  return seoOrigins.main;
}

function clientHmacSecret(): string | null {
  return process.env.AGENT_OAUTH_CLIENT_HMAC_SECRET ?? process.env.NEXTAUTH_SECRET ?? null;
}

function privateJwk(): (JWK & { d: string }) | null {
  const raw = process.env.AGENT_OAUTH_PRIVATE_KEY_JWK;
  if (!raw) return null;
  try {
    const jwk = JSON.parse(raw) as JWK;
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.d !== "string") return null;
    return jwk as JWK & { d: string };
  } catch {
    return null;
  }
}

export function agentOauthConfigured(): boolean {
  return privateJwk() !== null && clientHmacSecret() !== null;
}

/** Публичный JWKS (без приватного скаляра d). */
export async function agentJwks(): Promise<{ keys: JWK[] }> {
  const jwk = privateJwk();
  if (!jwk) return { keys: [] };
  const { d: _d, ...publicJwk } = jwk;
  const kid = jwk.kid ?? await calculateJwkThumbprint(publicJwk as JWK);
  return { keys: [{ ...publicJwk, kid, use: "sig", alg: "ES256" }] };
}

/** RFC 7591: stateless-регистрация — секрет выводится из client_id. */
export function registerAgentClient(): { clientId: string; clientSecret: string } | null {
  const secret = clientHmacSecret();
  if (!secret) return null;
  const clientId = `agent-${randomBytes(16).toString("hex")}`;
  return { clientId, clientSecret: deriveClientSecret(clientId, secret) };
}

function deriveClientSecret(clientId: string, secret: string): string {
  return createHmac("sha256", secret).update(`agent-oauth-client:${clientId}`).digest("hex");
}

export function validateAgentClient(clientId: string, clientSecret: string): boolean {
  const secret = clientHmacSecret();
  if (!secret) return false;
  if (!/^agent-[0-9a-f]{32}$/.test(clientId)) return false;
  const expected = Buffer.from(deriveClientSecret(clientId, secret), "utf8");
  const provided = Buffer.from(clientSecret, "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export async function issueAgentAccessToken(clientId: string): Promise<{
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  scope: string;
} | null> {
  const jwk = privateJwk();
  if (!jwk) return null;
  const { d: _d, ...publicJwk } = jwk;
  const kid = jwk.kid ?? await calculateJwkThumbprint(publicJwk as JWK);
  const key = await importJWK(jwk, "ES256");
  const origin = issuerOrigin();
  const accessToken = await new SignJWT({ scope: AGENT_OAUTH_SCOPE, client_id: clientId })
    .setProtectedHeader({ alg: "ES256", kid, typ: "at+jwt" })
    .setIssuer(origin)
    .setAudience(`${origin}/mcp`)
    .setSubject(clientId)
    .setIssuedAt()
    .setExpirationTime(`${AGENT_TOKEN_TTL_SECONDS}s`)
    .sign(key);
  return { accessToken, tokenType: "Bearer", expiresIn: AGENT_TOKEN_TTL_SECONDS, scope: AGENT_OAUTH_SCOPE };
}

/** Проверка Bearer-токена на ресурсе (MCP). Возвращает client_id или null. */
export async function verifyAgentAccessToken(authorizationHeader: string | null): Promise<string | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const jwk = privateJwk();
  if (!jwk) return null;
  try {
    const { d: _d, ...publicJwk } = jwk;
    const key = await importJWK(publicJwk as JWK, "ES256");
    const origin = issuerOrigin();
    const { payload } = await jwtVerify(authorizationHeader.slice(7), key, {
      issuer: origin,
      audience: `${origin}/mcp`,
    });
    if (payload.scope !== AGENT_OAUTH_SCOPE) return null;
    return typeof payload.client_id === "string" ? payload.client_id : null;
  } catch {
    return null;
  }
}

/** RFC 8414 authorization-server metadata + auth.md agent_auth block. */
export function authorizationServerMetadata() {
  const origin = issuerOrigin();
  return {
    issuer: origin,
    token_endpoint: `${origin}/agent/oauth/token`,
    registration_endpoint: `${origin}/agent/oauth/register`,
    jwks_uri: `${origin}/agent/oauth/jwks`,
    scopes_supported: [AGENT_OAUTH_SCOPE],
    response_types_supported: ["token"],
    grant_types_supported: ["client_credentials"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    service_documentation: `${origin}/auth.md`,
    // auth.md (workos.com/auth-md) agent registration block. Per spec,
    // `skill` is the https URL of the auth.md skill document itself. The
    // isitagentready validator additionally requires the `register_uri`/
    // `claim_uri` field names (its own schema), so both aliases are published
    // alongside the spec names `identity_endpoint`/`claim_endpoint`.
    // `identity_types_supported` uses only spec-recognized values
    // ("anonymous"). The OAuth client_credentials capability is advertised
    // separately under `oauth_client` (an extension key scanners ignore).
    agent_auth: {
      skill: `${origin}/auth.md`,
      register_uri: `${origin}/agent/oauth/register`,
      claim_uri: `${origin}/agent/auth`,
      identity_endpoint: `${origin}/agent/oauth/register`,
      claim_endpoint: `${origin}/agent/auth`,
      identity_types_supported: ["anonymous"],
      anonymous: {
        credential_types_supported: ["none"],
        claim_uri: `${origin}/agent/auth`,
      },
      oauth_client: {
        credential_types_supported: ["client_secret"],
        grant_types_supported: ["client_credentials"],
        register_uri: `${origin}/agent/oauth/register`,
        token_uri: `${origin}/agent/oauth/token`,
        scopes_supported: [AGENT_OAUTH_SCOPE],
      },
    },
  };
}

/** RFC 9728 protected-resource metadata для публичного агент-API. */
export function protectedResourceMetadata() {
  const origin = issuerOrigin();
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: [AGENT_OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/auth.md`,
    resource_name: "ETerapy public agent API (read-only)",
  };
}
