import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { marketingAgentEnabled, runMarketingAgentCycle } from "@/lib/marketing/agent";
import { runEngagementDiscovery } from "@/lib/marketing/discovery";
import { auditUnansweredInbound, queueInboundReplies } from "@/lib/marketing/inbound";
import { collectDuePublicationMetrics } from "@/lib/marketing/metrics";
import { publishScheduledMarketing } from "@/lib/marketing/publish";
import { generateMarketingDrafts } from "@/lib/marketing/publication-queue";
import { runSeoAudit } from "@/lib/marketing/seo-monitor";
import { runMarketingUrlAudit } from "@/lib/marketing/url-monitor";
import { refreshMetaMarketingTokens } from "@/lib/marketing/meta-oauth";

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!await marketingAgentEnabled()) {
    return NextResponse.json({ error: "Сначала включите SMM-агента" }, { status: 409 });
  }
  const generate = await generateMarketingDrafts();
  // B618: ручной прогон обязан покрывать и входящее — иначе «прогнать сейчас»
  // проверяет не тот же путь, что воркер, и расхождение обнаружится на проде.
  // B742: опроса больше нет — входящее у всех оставшихся площадок приходит
  // событием, поэтому здесь остаётся только разбор очереди.
  const inboundQueue = await queueInboundReplies();
  const agent = await runMarketingAgentCycle();
  const publish = await publishScheduledMarketing();
  const metrics = await collectDuePublicationMetrics();
  const discovery = await runEngagementDiscovery();
  const inboundWatchdog = await auditUnansweredInbound();
  const seo = await runSeoAudit();
  const urls = await runMarketingUrlAudit();
  const metaTokens = await refreshMetaMarketingTokens();
  const result = {
    generate,
    inboundQueue,
    agent,
    publish,
    metrics,
    discovery,
    inboundWatchdog,
    seo,
    urls,
    metaTokens,
  };
  await logAudit(
    session.user.id,
    AUDIT_ACTIONS.MARKETING_AGENT_RUN,
    "marketing-agent",
    JSON.stringify(result).slice(0, 8_000),
  );
  return NextResponse.json({ ok: true, ...result });
}
