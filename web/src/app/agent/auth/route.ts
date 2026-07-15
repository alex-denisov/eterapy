export const dynamic = "force-dynamic";

const anonymousAccessProfile = {
  identity_type: "anonymous",
  credential_type: "none",
  scopes: ["public:read"],
  token_issued: false,
  account_created: false,
  state_stored: false,
  mcp_endpoint: "https://eterapy.com/mcp",
  documentation: "https://eterapy.com/auth.md",
} as const;

function accessProfileResponse() {
  return Response.json(anonymousAccessProfile, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

export const GET = accessProfileResponse;
export const POST = accessProfileResponse;
