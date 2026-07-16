/** B469 — RFC 9728 OAuth protected-resource metadata для публичного агент-API. */
import { protectedResourceMetadata } from "@/lib/agent-oauth";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
