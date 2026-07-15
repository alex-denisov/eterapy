export const dynamic = "force-static";

const docs = `# ETerapy public agent interface

The public agent interface is read-only. It helps an agent explain ETerapy and locate canonical public pages. It never accepts a personal situation, opens an account, creates a purchase or reads private data.

## Discovery

- MCP server card: /.well-known/mcp/server-card.json
- MCP endpoint: /mcp
- Agent Skills index: /.well-known/agent-skills/index.json
- A2A Agent Card: /.well-known/agent-card.json
- Human-readable content map: /llms.txt

## Safety

Do not send names, contact details, health data, dialogue text or payment information to the discovery endpoints. ETerapy is not an emergency or medical service.
`;

export function GET() {
  return new Response(docs, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
