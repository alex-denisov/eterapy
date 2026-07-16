import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextRequest } from "next/server";
import {
  AGENT_SERVER_VERSION,
  platformOverview,
  publicAgentResources,
} from "@/lib/agent-readiness";
import { authRateLimitResponse, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { verifyAgentAccessToken } from "@/lib/agent-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createPublicMcpServer() {
  const server = new McpServer({ name: "eterapy-public-info", version: AGENT_SERVER_VERSION });

  server.registerTool("get_platform_overview", {
    title: "Get ETerapy platform overview",
    description: "Return decision-ready public facts about ETerapy, its audience, free start and safety boundaries. Use this before explaining the service. Do not use it for personal advice, diagnosis, account access or purchases.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => ({
    content: [{ type: "text", text: JSON.stringify(platformOverview(), null, 2) }],
    structuredContent: platformOverview(),
  }));

  server.registerTool("list_public_resources", {
    title: "List canonical ETerapy resources",
    description: "List canonical public pages for product formats, prices, ethics, privacy, help and platform mechanics. Use it to cite the right ETerapy page. It cannot search private accounts or user content.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => ({
    content: [{ type: "text", text: JSON.stringify(publicAgentResources, null, 2) }],
    structuredContent: { resources: publicAgentResources },
  }));

  server.registerResource(
    "eterapy-overview",
    "eterapy://public/overview",
    { title: "ETerapy public overview", mimeType: "application/json" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(platformOverview(), null, 2) }],
    }),
  );

  return server;
}

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowedOrigins = new Set([
    request.nextUrl.origin,
    "https://eterapy.com",
    "https://app.eterapy.com",
    "https://staging.eterapy.com",
    "https://staging.app.eterapy.com",
  ]);
  return allowedOrigins.has(origin);
}

async function handleMcpRequest(request: NextRequest) {
  if (!originAllowed(request)) {
    return Response.json({ error: "Origin is not allowed" }, { status: 403 });
  }

  // B469: анонимный доступ остаётся; валидный OAuth-токен (scope public:read,
  // см. /.well-known/oauth-authorization-server) даёт повышенный rate-limit.
  const agentClientId = await verifyAgentAccessToken(request.headers.get("authorization"));
  const limit = agentClientId
    ? checkRequestAuthRateLimit(request, `public-mcp-oauth:${agentClientId}`, 240, 60_000)
    : checkRequestAuthRateLimit(request, "public-mcp", 60, 60_000);
  if (!limit.allowed) return authRateLimitResponse(limit);

  const server = createPublicMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
export const DELETE = handleMcpRequest;
