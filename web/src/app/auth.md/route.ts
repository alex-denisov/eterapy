export const dynamic = "force-static";

const authMarkdown = `# ETerapy auth.md

## Agent audience

Public agents may read ETerapy's published descriptions, policies, prices and safety boundaries through the read-only MCP endpoint at https://eterapy.com/mcp.

## Registration and provisioning

Anonymous agents provision their public read-only access profile at https://eterapy.com/agent/auth. This endpoint creates no account, stores no state and issues no credential. ETerapy does not issue OAuth tokens, API keys or delegated access for personal accounts through this surface.

\`\`\`json
{
  "agent_auth": {
    "skill": "anonymous-public-read",
    "register_uri": "https://eterapy.com/agent/auth",
    "identity_types_supported": ["anonymous"],
    "anonymous": {
      "credential_types_supported": ["none"],
      "claim_uri": "https://eterapy.com/agent/auth"
    }
  }
}
\`\`\`

## Supported method

- Anonymous access to public information only.
- Supported identity type: \`anonymous\`.
- Supported credential type: \`none\`; no credential is sent or stored.
- Supported scope: \`public:read\`.
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
