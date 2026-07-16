/** B469 — RFC 8414 OAuth authorization-server metadata (+auth.md agent_auth). */
import { authorizationServerMetadata } from "@/lib/agent-oauth";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(authorizationServerMetadata(), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
