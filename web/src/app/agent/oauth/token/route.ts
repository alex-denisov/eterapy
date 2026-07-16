/**
 * B469 — OAuth 2.0 token endpoint: только client_credentials → ES256 JWT на
 * 1 час для scope `public:read` (публичный read-only агент-API).
 */
import { NextRequest } from "next/server";
import {
  AGENT_OAUTH_SCOPE,
  agentOauthConfigured,
  issueAgentAccessToken,
  validateAgentClient,
} from "@/lib/agent-oauth";
import { authRateLimitResponse, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";

export const dynamic = "force-dynamic";

function oauthError(error: string, description: string, status: number) {
  return Response.json({ error, error_description: description }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function parseBasicAuth(header: string | null): { clientId: string; clientSecret: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) return null;
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const limit = checkRequestAuthRateLimit(req, "agent-oauth-token", 20, 60_000);
  if (!limit.allowed) return authRateLimitResponse(limit);

  if (!agentOauthConfigured()) {
    return oauthError("temporarily_unavailable", "Token issuance is not configured", 503);
  }

  const form = await req.formData().catch(() => null);
  const grantType = form?.get("grant_type");
  if (grantType !== "client_credentials") {
    return oauthError("unsupported_grant_type", "Only client_credentials is supported", 400);
  }

  const scope = form?.get("scope");
  if (typeof scope === "string" && scope.length > 0 && scope !== AGENT_OAUTH_SCOPE) {
    return oauthError("invalid_scope", `Only "${AGENT_OAUTH_SCOPE}" is available`, 400);
  }

  const basic = parseBasicAuth(req.headers.get("authorization"));
  const clientId = basic?.clientId ?? (typeof form?.get("client_id") === "string" ? String(form.get("client_id")) : "");
  const clientSecret = basic?.clientSecret ?? (typeof form?.get("client_secret") === "string" ? String(form.get("client_secret")) : "");
  if (!clientId || !clientSecret || !validateAgentClient(clientId, clientSecret)) {
    return oauthError("invalid_client", "Unknown client or bad credentials", 401);
  }

  const token = await issueAgentAccessToken(clientId);
  if (!token) {
    return oauthError("temporarily_unavailable", "Token issuance is not configured", 503);
  }

  return Response.json({
    access_token: token.accessToken,
    token_type: token.tokenType,
    expires_in: token.expiresIn,
    scope: token.scope,
  }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
