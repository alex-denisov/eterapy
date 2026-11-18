const marks = new Map<string, string>();
const statuses = new Map<string, string>();

jest.mock("@/lib/db", () => ({
  db: {
    platformSetting: { findMany: jest.fn(async () => [...marks].map(([key, value]) => ({ key, value }))) },
    marketingAutomationSignal: { findMany: jest.fn(async ({ where }: { where: { key: { in: string[] }; status: string } }) =>
      where.key.in.filter((key) => statuses.get(key) === where.status).map((key) => ({ key }))) },
  },
}));
jest.mock("@/lib/marketing/orchestrator-claims", () => ({
  writeSetting: jest.fn(async (key: string, value: string) => { marks.set(key, value); }),
  claimSetting: jest.fn(async (key: string, expected: string, next: string) => {
    if (marks.get(key) !== expected) return false;
    marks.set(key, next);
    return true;
  }),
}));

import { notifyResolvedSignals, trackAlertedSignals } from "@/lib/marketing/orchestrator-recovery";
import type { OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";

const now = new Date("2026-11-18T06:00:00Z");
const finding = { code: "signal.seo:page:123", title: "SEO: страница", severity: "incident", detail: "noindex" } as OrchestratorFinding;

beforeEach(() => { marks.clear(); statuses.clear(); });

it("сообщает только о подтверждённом восстановлении ранее отправленного сигнала и только один раз", async () => {
  const send = jest.fn().mockResolvedValue(true);
  await trackAlertedSignals([finding], now);
  statuses.set("seo:page:123", "OPEN");
  expect(await notifyResolvedSignals(now, send)).toBe(0);
  statuses.set("seo:page:123", "RESOLVED");
  expect(await notifyResolvedSignals(now, send)).toBe(1);
  expect(await notifyResolvedSignals(now, send)).toBe(0);
  expect(send).toHaveBeenCalledTimes(1);
});

it("повторяет сообщение о восстановлении после ошибки доставки", async () => {
  await trackAlertedSignals([finding], now);
  statuses.set("seo:page:123", "RESOLVED");
  expect(await notifyResolvedSignals(now, async () => false)).toBe(0);
  expect(await notifyResolvedSignals(now, async () => true)).toBe(1);
});

it("не отправляет два сообщения при одновременной проверке узлов", async () => {
  await trackAlertedSignals([finding], now);
  statuses.set("seo:page:123", "RESOLVED");
  const send = jest.fn().mockResolvedValue(true);
  await Promise.all([notifyResolvedSignals(now, send), notifyResolvedSignals(now, send)]);
  expect(send).toHaveBeenCalledTimes(1);
});
