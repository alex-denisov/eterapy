import "dotenv/config";
import { setTimeout as wait } from "timers/promises";
import {
  runMarketingAgentCycle,
  marketingAgentEnabled,
  resolveMarketingSignal,
  upsertMarketingSignal,
} from "@/lib/marketing/agent";
import { runEngagementDiscovery } from "@/lib/marketing/discovery";
import { publishScheduledMarketing } from "@/lib/marketing/publish";
import { collectDuePublicationMetrics } from "@/lib/marketing/metrics";
import { runSeoAudit } from "@/lib/marketing/seo-monitor";
import { runMarketingUrlAudit } from "@/lib/marketing/url-monitor";
import { refreshMetaMarketingTokens } from "@/lib/marketing/meta-oauth";
import { generateMarketingDrafts } from "@/lib/marketing/publication-queue";
import { log, serializeError } from "@/lib/logger";

const pollMs = Math.max(15_000, Number(process.env.MARKETING_AGENT_POLL_MS || 60_000));
let stopping = false;
let lastDiscovery = 0;
let lastSeoAudit = 0;
let lastUrlAudit = 0;
let lastMetaRefresh = 0;
let lastPlanSync = 0;

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
      }
      await guarded("agent", runMarketingAgentCycle);
      // Approved comments are dispatched independently of the owned-post
      // autopublish flag. Owned posts still obey MARKETING_AUTOPUBLISH.
      await guarded("publish", () => publishScheduledMarketing());
      await guarded("metrics", () => collectDuePublicationMetrics());
      if (now - lastMetaRefresh >= 6 * 60 * 60_000) {
        lastMetaRefresh = now;
        await guarded("meta-tokens", () => refreshMetaMarketingTokens(new Date(now)));
      }
      if (now - lastDiscovery >= 4 * 60 * 60_000) {
        lastDiscovery = now;
        await guarded("discovery", runEngagementDiscovery);
      }
      if (now - lastSeoAudit >= 6 * 60 * 60_000) {
        lastSeoAudit = now;
        await guarded("seo", runSeoAudit);
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
