import { a2aAgentCard } from "@/lib/agent-readiness";

export const dynamic = "force-static";

export function GET() {
  return Response.json(a2aAgentCard(), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
