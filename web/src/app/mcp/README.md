# ETerapy public MCP server

Stateless Streamable HTTP MCP endpoint for public ETerapy facts. It exposes two
read-only tools and one public resource. It never reads accounts, dialogue text,
payments, practitioner data or other personal information.

Endpoint: `POST /mcp`. No credentials or environment variables are required.
Requests are limited per IP, browser origins are restricted to ETerapy origins,
and tool inputs are schema-validated by the MCP SDK.

Supported tools:

- `get_platform_overview` — audience, free-start facts and safety boundaries.
- `list_public_resources` — canonical public pages with short descriptions.

The transport is stateless, so pagination and cursors do not apply. Rate-limit
responses use HTTP 429 with `Retry-After`; malformed MCP messages receive the
SDK's JSON-RPC error response.
