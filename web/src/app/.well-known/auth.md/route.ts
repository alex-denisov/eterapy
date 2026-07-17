export const dynamic = "force-static";

import { agentAuthMarkdownResponse } from "@/lib/agent-auth-md";

// B469: алиас на /auth.md по каноническому well-known-пути (RFC 8615).
export function GET() {
  return agentAuthMarkdownResponse();
}
