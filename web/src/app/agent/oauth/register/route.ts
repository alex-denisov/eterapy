/**
 * B469 — RFC 7591 dynamic client registration (stateless).
 *
 * Секрет клиента детерминированно выводится из client_id серверным HMAC —
 * БД/аккаунтов нет, регистрация даёт только client_credentials для scope
 * `public:read` (публичный read-only агент-API). Личные данные недоступны.
 */
import { NextRequest } from "next/server";
import { AGENT_OAUTH_SCOPE, registerAgentClient } from "@/lib/agent-oauth";
import { authRateLimitResponse, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { seoOrigins } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limit = checkRequestAuthRateLimit(req, "agent-oauth-register", 10, 60_000);
  if (!limit.allowed) return authRateLimitResponse(limit);

  // Метаданные клиента принимаются, но не персистятся (stateless server).
  const body = await req.json().catch(() => ({}));
  const clientName = typeof body?.client_name === "string" ? body.client_name.slice(0, 120) : undefined;

  const registration = registerAgentClient();
  if (!registration) {
    return Response.json(
      { error: "temporarily_unavailable", error_description: "Registration is not configured" },
      { status: 503 },
    );
  }

  return Response.json({
    client_id: registration.clientId,
    client_secret: registration.clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    ...(clientName ? { client_name: clientName } : {}),
    grant_types: ["client_credentials"],
    token_endpoint_auth_method: "client_secret_post",
    scope: AGENT_OAUTH_SCOPE,
    token_endpoint: `${seoOrigins.main}/agent/oauth/token`,
  }, { status: 201 });
}
