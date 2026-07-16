/**
 * @jest-environment node
 *
 * B469 — публичный агент-OAuth (RFC 7591/6749/8414/9728): stateless
 * регистрация, client_credentials → ES256 JWT, discovery-метаданные.
 * (node-окружение: jose требует настоящие WebCrypto/Uint8Array, а не jsdom.)
 */
import { webcrypto } from "node:crypto";
import fs from "fs";
import path from "path";

// jose использует WebCrypto/structuredClone; в jest-окружении их нет глобально.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
if (typeof globalThis.structuredClone !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  globalThis.structuredClone = require("node:v8").deserialize
    ? (value: unknown) => {
        const v8 = require("node:v8") as typeof import("node:v8");
        return v8.deserialize(v8.serialize(value));
      }
    : ((value: unknown) => JSON.parse(JSON.stringify(value)));
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateKeyPair, exportJWK } = require("jose") as typeof import("jose");

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

async function withAgentOauthEnv<T>(run: () => Promise<T>): Promise<T> {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(privateKey);
  const originalKey = process.env.AGENT_OAUTH_PRIVATE_KEY_JWK;
  const originalSecret = process.env.AGENT_OAUTH_CLIENT_HMAC_SECRET;
  process.env.AGENT_OAUTH_PRIVATE_KEY_JWK = JSON.stringify(jwk);
  process.env.AGENT_OAUTH_CLIENT_HMAC_SECRET = "test-hmac-secret";
  try {
    return await run();
  } finally {
    if (originalKey === undefined) delete process.env.AGENT_OAUTH_PRIVATE_KEY_JWK;
    else process.env.AGENT_OAUTH_PRIVATE_KEY_JWK = originalKey;
    if (originalSecret === undefined) delete process.env.AGENT_OAUTH_CLIENT_HMAC_SECRET;
    else process.env.AGENT_OAUTH_CLIENT_HMAC_SECRET = originalSecret;
  }
}

describe("B469 agent OAuth — stateless clients and tokens", () => {
  it("register → token → resource verification roundtrip", async () => {
    await withAgentOauthEnv(async () => {
      const oauth = await import("@/lib/agent-oauth");
      const registration = oauth.registerAgentClient();
      expect(registration).not.toBeNull();
      expect(registration!.clientId).toMatch(/^agent-[0-9a-f]{32}$/);

      expect(oauth.validateAgentClient(registration!.clientId, registration!.clientSecret)).toBe(true);
      expect(oauth.validateAgentClient(registration!.clientId, "wrong-secret")).toBe(false);
      expect(oauth.validateAgentClient("agent-" + "0".repeat(32), registration!.clientSecret)).toBe(false);

      const token = await oauth.issueAgentAccessToken(registration!.clientId);
      expect(token).not.toBeNull();
      expect(token!.scope).toBe("public:read");
      expect(token!.expiresIn).toBe(3600);

      const verified = await oauth.verifyAgentAccessToken(`Bearer ${token!.accessToken}`);
      expect(verified).toBe(registration!.clientId);

      expect(await oauth.verifyAgentAccessToken("Bearer not-a-jwt")).toBeNull();
      expect(await oauth.verifyAgentAccessToken(null)).toBeNull();
    });
  });

  it("JWKS publishes the public key without the private scalar", async () => {
    await withAgentOauthEnv(async () => {
      const oauth = await import("@/lib/agent-oauth");
      const jwks = await oauth.agentJwks();
      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0].kty).toBe("EC");
      expect(jwks.keys[0].alg).toBe("ES256");
      expect(jwks.keys[0]).not.toHaveProperty("d");
      expect(typeof jwks.keys[0].kid).toBe("string");
    });
  });

  it("fails closed without the signing key", async () => {
    const originalKey = process.env.AGENT_OAUTH_PRIVATE_KEY_JWK;
    delete process.env.AGENT_OAUTH_PRIVATE_KEY_JWK;
    try {
      const oauth = await import("@/lib/agent-oauth");
      expect(oauth.agentOauthConfigured()).toBe(false);
      expect(await oauth.issueAgentAccessToken("agent-" + "a".repeat(32))).toBeNull();
      expect((await oauth.agentJwks()).keys).toHaveLength(0);
    } finally {
      if (originalKey !== undefined) process.env.AGENT_OAUTH_PRIVATE_KEY_JWK = originalKey;
    }
  });

  it("RFC 8414 metadata carries required fields and the agent_auth block", async () => {
    const oauth = await import("@/lib/agent-oauth");
    const metadata = oauth.authorizationServerMetadata();
    expect(metadata.issuer).toBe("https://eterapy.com");
    expect(metadata.token_endpoint).toBe("https://eterapy.com/agent/oauth/token");
    expect(metadata.registration_endpoint).toBe("https://eterapy.com/agent/oauth/register");
    expect(metadata.jwks_uri).toBe("https://eterapy.com/agent/oauth/jwks");
    expect(metadata.grant_types_supported).toEqual(["client_credentials"]);
    expect(metadata.scopes_supported).toEqual(["public:read"]);
    expect(metadata.agent_auth.register_uri).toBe("https://eterapy.com/agent/oauth/register");
    // Only spec-recognized identity types (scanner rejects unknown values).
    expect(metadata.agent_auth.identity_types_supported).toEqual(["anonymous"]);
    expect(metadata.agent_auth.claim_uri).toBe("https://eterapy.com/agent/auth");
    expect(metadata.agent_auth.anonymous.credential_types_supported).toEqual(["none"]);
    // OAuth client_credentials advertised under an extension key.
    expect(metadata.agent_auth.oauth_client.token_uri).toBe("https://eterapy.com/agent/oauth/token");
  });

  it("RFC 9728 protected-resource metadata points at the MCP resource", async () => {
    const oauth = await import("@/lib/agent-oauth");
    const metadata = oauth.protectedResourceMetadata();
    expect(metadata.resource).toBe("https://eterapy.com/mcp");
    expect(metadata.authorization_servers).toEqual(["https://eterapy.com"]);
    expect(metadata.scopes_supported).toEqual(["public:read"]);
    expect(metadata.bearer_methods_supported).toEqual(["header"]);
  });
});

describe("B469 agent OAuth — surface wiring (source contracts)", () => {
  it("well-known routes exist and delegate to the shared lib", () => {
    expect(source("src/app/.well-known/oauth-authorization-server/route.ts")).toContain("authorizationServerMetadata");
    expect(source("src/app/.well-known/oauth-protected-resource/route.ts")).toContain("protectedResourceMetadata");
    expect(source("src/app/agent/oauth/jwks/route.ts")).toContain("agentJwks");
  });

  it("token endpoint only supports client_credentials and never caches", () => {
    const route = source("src/app/agent/oauth/token/route.ts");
    expect(route).toContain("unsupported_grant_type");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain("validateAgentClient");
    // Basic auth only counts when it carries an agent client id — otherwise an
    // upstream Basic-Auth proxy would mask form-body credentials.
    expect(route).toContain('basic?.clientId?.startsWith("agent-")');
  });

  it("MCP accepts a valid Bearer token for a higher rate limit", () => {
    const route = source("src/app/mcp/route.ts");
    expect(route).toContain("verifyAgentAccessToken");
    expect(route).toContain("public-mcp-oauth");
  });

  it("auth.md documents the real OAuth option and its limits", () => {
    const authMd = source("src/app/auth.md/route.ts");
    expect(authMd).toContain("agent/oauth/register");
    expect(authMd).toContain("client_credentials");
    expect(authMd).toContain("oauth_client");
    expect(authMd).toContain("public:read");
  });
});
