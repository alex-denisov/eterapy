import { mcpServerCard } from "@/lib/agent-readiness";

export const dynamic = "force-static";

export function GET() {
  return Response.json(mcpServerCard(), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
