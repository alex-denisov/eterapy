export const dynamic = "force-static";

const authMarkdown = `# ETerapy auth.md

## Agent audience

Public agents may read ETerapy's published descriptions, policies, prices and safety boundaries through the read-only MCP endpoint at https://eterapy.com/mcp.

## Registration and provisioning

No agent registration or credential provisioning endpoint is offered. Public agent discovery is anonymous and read-only. ETerapy does not issue OAuth tokens, API keys or delegated access for personal accounts through this surface.

## Supported method

- Anonymous access to public information only.
- No credential is sent or stored.
- Account, dialogue, payment and practitioner data are outside this agent surface.

For product support, use https://eterapy.com/help or support@eterapy.com.
`;

export function GET() {
  return new Response(authMarkdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
