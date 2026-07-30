import "dotenv/config";
import { setTimeout as wait } from "timers/promises";
import {
  runMarketingAgentCycle,
  marketingAgentEnabled,
  resolveMarketingSignal,
  upsertMarketingSignal,
} from "@/lib/marketing/agent";
import { runEngagementDiscovery } from "@/lib/marketing/discovery";
import {
  auditUnansweredInbound,
  pollInboundSources,
  queueInboundReplies,
} from "@/lib/marketing/inbound";
import { publishScheduledMarketing } from "@/lib/marketing/publish";
import { collectDuePublicationMetrics } from "@/lib/marketing/metrics";
import { runSeoAudit } from "@/lib/marketing/seo-monitor";
import { runSeoCoverageCycle } from "@/lib/marketing/seo-coverage";
import { runMarketingUrlAudit } from "@/lib/marketing/url-monitor";
import { refreshMetaMarketingTokens } from "@/lib/marketing/meta-oauth";
import { generateMarketingDrafts } from "@/lib/marketing/publication-queue";
import { probeMarketingProviders } from "@/lib/marketing/provider-health";
import { auditStalledPublications } from "@/lib/marketing/publication-queue";
import { log, serializeError } from "@/lib/logger";

const pollMs = Math.max(15_000, Number(process.env.MARKETING_AGENT_POLL_MS || 60_000));
let stopping = false;
let lastDiscovery = 0;
let lastSeoAudit = 0;
let lastUrlAudit = 0;
let lastMetaRefresh = 0;
let lastPlanSync = 0;
let lastProviderProbe = 0;
let lastInboundPoll = 0;
let lastInboundAudit = 0;

process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

async function guarded(name: string, run: () => Promise<unknown>) {
  try {
    const result = await run();
    await resolveMarketingSignal(`worker:${name}`).catch(() => undefined);
    log.info(`marketing-worker.${name}`, { result });
  } catch (error) {
    log.error(`marketing-worker.${name}_failed`, { error: serializeError(error) });
    await upsertMarketingSignal({
      key: `worker:${name}`,
      kind: "SERVICE",
      severity: "INCIDENT",
      title: `Сбой marketing-agent: ${name}`,
      summary: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
  }
}

async function main() {
  log.info("marketing-worker.started", { pollMs });
  while (!stopping) {
    if (await marketingAgentEnabled()) {
      const now = Date.now();
      if (now - lastPlanSync >= 6 * 60 * 60_000) {
        lastPlanSync = now;
        await guarded("plan", () => generateMarketingDrafts({ now: new Date(now) }));
        await guarded("registry-audit", () => auditStalledPublications({ now: new Date(now) }));
      }
      // B618: входящее — единственный разговорный канал после B617, и человек
      // на другой стороне ждёт ответа минутами, а не часами. Очередь ответов
      // пополняется каждый тик, до генерации: так ответ попадает в тот же
      // проход writer → редактор, а не в следующий.
      await guarded("inbound-queue", () => queueInboundReplies({ now: new Date() }));
      await guarded("agent", runMarketingAgentCycle);
      // Approved comments are dispatched independently of the owned-post
      // autopublish flag. Owned posts still obey MARKETING_AUTOPUBLISH.
      await guarded("publish", () => publishScheduledMarketing());
      await guarded("metrics", () => collectDuePublicationMetrics());
      if (now - lastMetaRefresh >= 6 * 60 * 60_000) {
        lastMetaRefresh = now;
        await guarded("meta-tokens", () => refreshMetaMarketingTokens(new Date(now)));
      }
      // The engagement plan books replies on human-paced slots a couple of
      // hours ahead, so discovery has to top the queue up several times an
      // hour — not once every four hours.
      if (now - lastDiscovery >= 35 * 60_000) {
        lastDiscovery = now;
        await guarded("discovery", () => runEngagementDiscovery({ now: new Date(now) }));
      }
      // Reddit и упоминания в VK webhook'ов не присылают — их надо забирать.
      if (now - lastInboundPoll >= 10 * 60_000) {
        lastInboundPoll = now;
        await guarded("inbound-poll", () => pollInboundSources({ now: new Date(now) }));
      }
      // Сторож зависших входящих: INC-094 показал, что строка без исполнителя
      // живёт вечно и молча, поэтому у очереди есть собственный контроль.
      if (now - lastInboundAudit >= 60 * 60_000) {
        lastInboundAudit = now;
        await guarded("inbound-watchdog", () => auditUnansweredInbound({ now: new Date(now) }));
      }
      if (now - lastProviderProbe >= 30 * 60_000) {
        lastProviderProbe = now;
        await guarded("provider-health", () => probeMarketingProviders({ now: new Date(now) }));
      }
      if (now - lastSeoAudit >= 6 * 60 * 60_000) {
        lastSeoAudit = now;
        await guarded("seo", runSeoAudit);
        // Coverage runs on the same cadence: the recrawl quota resets daily and
        // spending it in four batches is friendlier than one burst.
        await guarded("seo-coverage", () => runSeoCoverageCycle({
          now: new Date(now),
          maxSubmissions: 40,
        }));
      }
      if (now - lastUrlAudit >= 6 * 60 * 60_000) {
        lastUrlAudit = now;
        await guarded("urls", runMarketingUrlAudit);
      }
    }
    await wait(pollMs);
  }
  log.info("marketing-worker.stopped", {});
}

main().catch((error) => {
  log.error("marketing-worker.crashed", { error: serializeError(error) });
  process.exitCode = 1;
});
