import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { APP_URL } from "@/lib/env";
import { marketingUrlRegistry, RETIRED_URLS } from "@/lib/marketing/url-registry";

const REQUEST_TIMEOUT_MS = 12_000;
const BATCH_SIZE = 8;

export type MarketingUrlAuditEvidence = {
  path: string;
  status: number;
  finalUrl: string;
  redirectCount: number;
  inSitemap: boolean;
  trafficTouches: number;
  checkedAt: string;
};

function signalKey(path: string) {
  return `url:audit:${createHash("sha256").update(path).digest("hex").slice(0, 20)}`;
}

function sitemapPaths(xml: string, origin: string) {
  const paths = new Set<string>();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    try {
      const url = new URL(match[1].trim());
      if (url.origin === origin) paths.add(`${url.pathname}${url.search}`);
    } catch {
      // The SEO sitemap audit owns malformed entries. One bad row must not
      // leave the entire URL registry stale.
    }
  }
  return paths;
}

export function marketingPathFromUrl(raw: string, origin: string) {
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return null;
    return url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "/";
  } catch {
    return null;
  }
}

function problems(evidence: MarketingUrlAuditEvidence, expectedRetirement: boolean) {
  const result: string[] = [];
  if (expectedRetirement) {
    if (evidence.status !== 404 && evidence.status !== 410 && evidence.redirectCount === 0) {
      result.push(`снятый адрес неожиданно отвечает HTTP ${evidence.status}`);
    }
    return result;
  }
  if (evidence.status < 200 || evidence.status >= 300) result.push(`HTTP ${evidence.status}`);
  if (evidence.redirectCount > 1) result.push(`цепочка из ${evidence.redirectCount} редиректов`);
  if (!evidence.inSitemap) result.push("нет в sitemap");
  return result;
}

async function probe(
  base: URL,
  path: string,
  inSitemap: boolean,
  trafficTouches: number,
  now: Date,
): Promise<MarketingUrlAuditEvidence> {
  const target = new URL(path, base);
  try {
    let current = target;
    let response: Response | null = null;
    let redirectCount = 0;
    for (; redirectCount <= 5; redirectCount += 1) {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": "ETerapy-URL-Monitor/1.0" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) break;
      const next = new URL(location, current);
      if (next.origin !== base.origin) break;
      current = next;
    }
    const finalUrl = current.toString();
    await response?.body?.cancel().catch(() => undefined);
    return {
      path,
      status: response?.status ?? 0,
      finalUrl,
      redirectCount,
      inSitemap,
      trafficTouches,
      checkedAt: now.toISOString(),
    };
  } catch {
    return {
      path,
      status: 0,
      finalUrl: target.toString(),
      redirectCount: 0,
      inSitemap,
      trafficTouches,
      checkedAt: now.toISOString(),
    };
  }
}

async function persistAudit(evidence: MarketingUrlAuditEvidence, issueList: string[]) {
  const open = issueList.length > 0;
  const severe = evidence.status === 0 || evidence.status >= 500;
  const now = new Date(evidence.checkedAt);
  return db.marketingAutomationSignal.upsert({
    where: { key: signalKey(evidence.path) },
    create: {
      key: signalKey(evidence.path),
      kind: "URL_AUDIT",
      severity: open && severe ? "INCIDENT" : open ? "WARNING" : "INFO",
      status: open ? "OPEN" : "RESOLVED",
      title: `Контроль URL: ${evidence.path}`,
      summary: open ? issueList.join(", ") : "HTTP, redirect и sitemap в норме",
      evidence: evidence as unknown as Prisma.InputJsonValue,
      suggestedTicket: open ? "INC" : null,
      lastSeenAt: now,
      resolvedAt: open ? null : now,
    },
    update: {
      severity: open && severe ? "INCIDENT" : open ? "WARNING" : "INFO",
      status: open ? "OPEN" : "RESOLVED",
      summary: open ? issueList.join(", ") : "HTTP, redirect и sitemap в норме",
      evidence: evidence as unknown as Prisma.InputJsonValue,
      suggestedTicket: open ? "INC" : null,
      lastSeenAt: now,
      resolvedAt: open ? null : now,
    },
  });
}

export async function runMarketingUrlAudit(now = new Date()) {
  const base = new URL(APP_URL);
  const sitemapResponse = await fetch(new URL("/sitemap.xml", base), {
    headers: { "User-Agent": "ETerapy-URL-Monitor/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const sitemap = sitemapResponse.ok
    ? sitemapPaths(await sitemapResponse.text(), base.origin)
    : new Set<string>();

  const [traffic, publications] = await Promise.all([
    db.channelAttribution.groupBy({
      by: ["firstEntryPath"],
      where: {
        OR: [
          { utmSource: { not: null } },
          { source: { not: "direct" } },
        ],
      },
      _count: { _all: true },
    }).catch(() => []),
    db.externalPublication.findMany({
      where: { destinationUrl: { not: null } },
      select: { destinationUrl: true },
    }).catch(() => []),
  ]);
  const trafficByPath = new Map<string, number>();
  for (const row of traffic) {
    const path = row.firstEntryPath.split("?")[0] || "/";
    trafficByPath.set(path, (trafficByPath.get(path) ?? 0) + row._count._all);
  }
  const active = marketingUrlRegistry().map((entry) => entry.path);
  const publicationPaths = publications.flatMap(({ destinationUrl }) => {
    const path = destinationUrl ? marketingPathFromUrl(destinationUrl, base.origin) : null;
    return path ? [path] : [];
  });
  const attributedPaths = traffic.flatMap(({ firstEntryPath }) => {
    const path = marketingPathFromUrl(firstEntryPath, base.origin);
    return path ? [path] : [];
  });
  const paths = [...new Set([
    ...active,
    ...publicationPaths,
    ...attributedPaths,
    ...Object.keys(RETIRED_URLS),
  ])];
  const result = { checked: 0, failures: 0 };

  for (let index = 0; index < paths.length; index += BATCH_SIZE) {
    const audits = await Promise.all(paths.slice(index, index + BATCH_SIZE).map((path) => probe(
      base,
      path,
      sitemap.has(path),
      trafficByPath.get(path) ?? 0,
      now,
    )));
    for (const evidence of audits) {
      const issueList = problems(evidence, Boolean(RETIRED_URLS[evidence.path]));
      await persistAudit(evidence, issueList);
      result.checked += 1;
      if (issueList.length > 0) result.failures += 1;
    }
  }
  return result;
}

export function isMarketingUrlAuditEvidence(value: Prisma.JsonValue | null): value is MarketingUrlAuditEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof value.path === "string"
    && typeof value.status === "number"
    && typeof value.finalUrl === "string"
    && typeof value.inSitemap === "boolean"
    && typeof value.trafficTouches === "number"
    && typeof value.checkedAt === "string";
}

export const urlMonitorTestables = { marketingPathFromUrl, problems, signalKey, sitemapPaths };
