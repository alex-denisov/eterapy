import { seoOrigins } from "@/lib/seo";
import { understandEterapySkillDigest } from "@/lib/agent-readiness";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: "understand-eterapy",
        type: "skill-md",
        description: "Explain ETerapy's public formats, limits and canonical resources without accessing personal data.",
        url: `${seoOrigins.main}/.well-known/agent-skills/understand-eterapy/SKILL.md`,
        digest: understandEterapySkillDigest(),
      },
    ],
  }, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
