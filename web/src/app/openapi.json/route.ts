import { seoOrigins } from "@/lib/seo";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "ETerapy Public Agent API",
      version: "1.0.0",
      description: "Read-only public discovery surface. It exposes no accounts, dialogues, payments or personal data.",
    },
    servers: [{ url: seoOrigins.main }],
    paths: {
      "/api/health": {
        get: {
          operationId: "getHealth",
          summary: "Check public service health",
          responses: { "200": { description: "Service and database are ready" } },
        },
      },
      "/mcp": {
        post: {
          operationId: "callPublicMcp",
          summary: "Call the stateless read-only MCP server",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { "200": { description: "MCP JSON-RPC response" } },
        },
      },
      "/agent/auth": {
        get: {
          operationId: "getAnonymousAgentAccessProfile",
          summary: "Describe anonymous read-only agent access",
          responses: { "200": { description: "No-token anonymous access profile" } },
        },
        post: {
          operationId: "provisionAnonymousAgentAccessProfile",
          summary: "Provision a stateless anonymous read-only access profile",
          responses: { "200": { description: "No account, token or server-side state is created" } },
        },
      },
    },
  }, {
    headers: {
      "Content-Type": "application/openapi+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
