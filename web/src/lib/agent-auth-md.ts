// B469: единственный источник текста auth.md. Отдаётся по двум путям:
// `/auth.md` (путь из спецификации isitagentready) и `/.well-known/auth.md`
// (каноническое место для метаданных по RFC 8615) — сканеры и агенты ищут
// по-разному, а расхождение двух копий текста было бы хуже дубля роута.
export const AGENT_AUTH_MARKDOWN = `# ETerapy auth.md

## Agent audience

Public agents may read ETerapy's published descriptions, policies, prices and safety boundaries through the read-only MCP endpoint at https://eterapy.com/mcp.

## Registration and provisioning

Two access modes exist, both limited to public information:

1. **Anonymous** — call https://eterapy.com/agent/auth. No account, no state, no credential; baseline rate limits apply.
2. **Registered OAuth client** — register via RFC 7591 dynamic client registration at https://eterapy.com/agent/oauth/register, then obtain a one-hour access token with the OAuth 2.0 \`client_credentials\` grant at https://eterapy.com/agent/oauth/token (scope \`public:read\`). A valid Bearer token raises your rate limit on the public MCP endpoint. Discovery: /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource.

Neither mode creates a personal account or grants access to user data. ETerapy does not issue delegated access to personal accounts through this surface; user authentication is a separate session-based system.

\`\`\`json
{
  "agent_auth": {
    "skill": "https://eterapy.com/auth.md",
    "register_uri": "https://eterapy.com/agent/oauth/register",
    "claim_uri": "https://eterapy.com/agent/auth",
    "identity_endpoint": "https://eterapy.com/agent/oauth/register",
    "claim_endpoint": "https://eterapy.com/agent/auth",
    "identity_types_supported": ["anonymous"],
    "anonymous": {
      "credential_types_supported": ["none"],
      "claim_uri": "https://eterapy.com/agent/auth"
    },
    "oauth_client": {
      "credential_types_supported": ["client_secret"],
      "grant_types_supported": ["client_credentials"],
      "register_uri": "https://eterapy.com/agent/oauth/register",
      "token_uri": "https://eterapy.com/agent/oauth/token",
      "scopes_supported": ["public:read"]
    }
  }
}
\`\`\`

## Supported method

- Read-only access to public information (\`public:read\`) — anonymous or via \`client_credentials\` Bearer token.
- Access tokens are ES256 JWTs, valid for 1 hour; there is no revocation endpoint — tokens simply expire.
- Registration is stateless: keep your \`client_secret\`; lost credentials are replaced by registering again.
- Account, dialogue, payment and practitioner data are outside this agent surface.

For product support, use https://eterapy.com/help or support@eterapy.com.
`;

export function agentAuthMarkdownResponse(): Response {
  return new Response(AGENT_AUTH_MARKDOWN, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
