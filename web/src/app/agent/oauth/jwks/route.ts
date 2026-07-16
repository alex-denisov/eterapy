/** B469 — JWKS публичного агент-OAuth (ключ подписи access-токенов). */
import { agentJwks } from "@/lib/agent-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await agentJwks(), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
