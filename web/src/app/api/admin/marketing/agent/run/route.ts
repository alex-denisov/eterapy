import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { marketingAgentEnabled, runMarketingAgentCycle } from "@/lib/marketing/agent";
import { runEngagementDiscovery } from "@/lib/marketing/discovery";
import { collectDuePublicationMetrics } from "@/lib/marketing/metrics";
import { publishScheduledMarketing } from "@/lib/marketing/publish";
import { generateMarketingDrafts } from "@/lib/marketing/publication-queue";
import { runSeoAudit } from "@/lib/marketing/seo-monitor";
import { runMarketingUrlAudit } from "@/lib/marketing/url-monitor";

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!await marketingAgentEnabled()) {
    return NextResponse.json({ error: "Сначала включите SMM-агента" }, { status: 409 });
  }
  const generate = await generateMarketingDrafts();
  const agent = await runMarketingAgentCycle();
  const publish = await publishScheduledMarketing();
  const metrics = await collectDuePublicationMetrics();
  const discovery = await runEngagementDiscovery();
  const seo = await runSeoAudit();
  const urls = await runMarketingUrlAudit();
  await logAudit(
    session.user.id,
    AUDIT_ACTIONS.MARKETING_AGENT_RUN,
    "marketing-agent",
    JSON.stringify({ generate, agent, publish, metrics, discovery, seo, urls }).slice(0, 8_000),
  );
  return NextResponse.json({ ok: true, generate, agent, publish, metrics, discovery, seo, urls });
}
