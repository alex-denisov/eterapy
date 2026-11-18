import { db } from "@/lib/db";
import { claimSetting, writeSetting } from "@/lib/marketing/orchestrator-claims";
import type { OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";

const PREFIX = "marketing.orchestrator.recovery.";
const LEASE_MS = 15 * 60_000;

type Mark = { title: string; state: "open" | "sending" | "closed"; at: string };

function parseMark(value: string): Mark | null {
  try {
    const mark = JSON.parse(value) as Partial<Mark>;
    if (typeof mark.title !== "string" || typeof mark.at !== "string" || !["open", "sending", "closed"].includes(mark.state ?? "")) return null;
    return mark as Mark;
  } catch { return null; }
}

/** Track only signals that were actually sent as incident alerts. */
export async function trackAlertedSignals(findings: readonly OrchestratorFinding[], now: Date): Promise<void> {
  await Promise.all(findings.filter((finding) => finding.code.startsWith("signal.")).map((finding) =>
    writeSetting(`${PREFIX}${finding.code.slice(7)}`, JSON.stringify({ title: finding.title, state: "open", at: now.toISOString() } satisfies Mark)),
  ));
}

/** Notify once when a previously alerted signal is explicitly resolved by its checker. */
export async function notifyResolvedSignals(now: Date, send: (text: string) => Promise<boolean>): Promise<number> {
  const legacyPrefix = "marketing.orchestrator.incident.signal.";
  const [marks, legacyMarks] = await Promise.all([
    db.platformSetting.findMany({ where: { key: { startsWith: PREFIX } }, select: { key: true, value: true } }),
    db.platformSetting.findMany({ where: { key: { startsWith: legacyPrefix } }, select: { key: true, value: true } }),
  ]);
  const tracked = new Set(marks.map((row) => row.key.slice(PREFIX.length)));
  const legacySignals = await db.marketingAutomationSignal.findMany({
    where: { key: { in: legacyMarks.map((row) => row.key.slice(legacyPrefix.length)) }, status: { in: ["OPEN", "RESOLVED"] } },
    select: { key: true, title: true },
  });
  const legacyValues = new Map(legacyMarks.map((row) => [row.key.slice(legacyPrefix.length), row.value]));
  await Promise.all(legacySignals.filter((signal) => !tracked.has(signal.key)).map((signal) => {
    const previous = legacyValues.get(signal.key);
    const at = previous && Number.isFinite(Date.parse(previous)) ? previous : now.toISOString();
    return claimSetting(`${PREFIX}${signal.key}`, null, JSON.stringify({ title: signal.title, state: "open", at } satisfies Mark));
  }));
  const currentMarks = await db.platformSetting.findMany({ where: { key: { startsWith: PREFIX } }, select: { key: true, value: true } });
  const pending = currentMarks.flatMap((row) => {
    const mark = parseMark(row.value);
    if (!mark || mark.state === "closed") return [];
    if (mark.state === "sending" && now.getTime() - Date.parse(mark.at) < LEASE_MS) return [];
    return [{ ...row, mark, signalKey: row.key.slice(PREFIX.length) }];
  });
  if (!pending.length) return 0;
  const resolved = await db.marketingAutomationSignal.findMany({
    where: { key: { in: pending.map((row) => row.signalKey) }, status: "RESOLVED" },
    select: { key: true },
  });
  const resolvedKeys = new Set(resolved.map((row) => row.key));
  const claimed: Array<{ key: string; old: string; lease: string; signalKey: string; title: string }> = [];
  for (const row of pending.filter((item) => resolvedKeys.has(item.signalKey))) {
    const lease = JSON.stringify({ ...row.mark, state: "sending", at: now.toISOString() } satisfies Mark);
    if (await claimSetting(row.key, row.value, lease)) claimed.push({ key: row.key, old: row.value, lease, signalKey: row.signalKey, title: row.mark.title });
  }
  if (!claimed.length) return 0;
  // A checker can reopen a signal between the first read and the claim.
  const stillResolved = await db.marketingAutomationSignal.findMany({
    where: { key: { in: claimed.map((row) => row.signalKey) }, status: "RESOLVED" }, select: { key: true },
  }).catch(() => []);
  const valid = new Set(stillResolved.map((row) => row.key));
  const ready = claimed.filter((row) => valid.has(row.signalKey));
  await Promise.all(claimed.filter((row) => !valid.has(row.signalKey)).map((row) => claimSetting(row.key, row.lease, row.old)));
  if (!ready.length) return 0;
  const titles = ready.slice(0, 2).map((row) => row.title.slice(0, 120).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  const text = `Проверка больше не обнаруживает проблему: ${ready.length}.\n${titles.join("\n")}${ready.length > 2 ? `\nЕщё: ${ready.length - 2}` : ""}`;
  let sent = false;
  try { sent = await send(text); } catch { /* retry after releasing the claim */ }
  await Promise.all(ready.map((row) => claimSetting(row.key, row.lease, sent
    ? JSON.stringify({ title: row.title, state: "closed", at: now.toISOString() } satisfies Mark)
    : row.old)));
  return sent ? ready.length : 0;
}
