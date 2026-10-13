/**
 * B777 — входящие Threads: один удалённый пост не останавливает обход остальных.
 *
 * Замер 2026-10-14: с 12.10 обход Threads каждую минуту падал на посте
 * 18112161851127481 («Object does not exist»), цикл обрывался на первой же цели,
 * и ни один ответ под остальными постами не читался.
 */

import { isGoneTargetError, resetGoneTargets, sweepOwnPublicationComments } from "@/lib/marketing/engagement-sweep";

const findMany = jest.fn();
const ingestInboundMessage = jest.fn();
const count = jest.fn();
const upsert = jest.fn();
const resolve = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: { findMany: (...a: unknown[]) => findMany(...a) },
    marketingInboundMessage: { count: (...a: unknown[]) => count(...a) },
    platformSetting: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/marketing/inbound", () => ({
  __esModule: true,
  ingestInboundMessage: (...a: unknown[]) => ingestInboundMessage(...a),
}));
jest.mock("@/lib/marketing/agent", () => ({
  __esModule: true,
  upsertMarketingSignal: (...a: unknown[]) => upsert(...a),
  resolveMarketingSignal: (...a: unknown[]) => resolve(...a),
}));
jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: (platform: string) => Promise.resolve(platform === "Threads"),
  marketingPlatformValue: (key: string) => Promise.resolve(
    key === "THREADS_ACCESS_TOKEN" ? "t" : key === "THREADS_USER_ID" ? "100" : null,
  ),
  requiredMarketingPlatformValue: jest.fn(),
}));

const NOW = new Date("2026-10-14T10:00:00.000Z");
const GONE = { error: { message: "Unsupported get request. Object with ID '1' does not exist, cannot be loaded due to missing permissions, or does not support this operation" } };

function respond(handler: (url: string) => unknown) {
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    const body = handler(String(url)) as Record<string, unknown>;
    return { ok: !body.error, status: body.error ? 400 : 200, json: async () => body };
  }) as unknown as typeof fetch;
}

describe("B777: обход Threads", () => {
  beforeEach(() => {
    resetGoneTargets();
    findMany.mockReset().mockResolvedValue([
      { id: "dead", externalPostId: "111", publicUrl: null },
      { id: "live", externalPostId: "222", publicUrl: "https://www.threads.com/post/222" },
    ]);
    ingestInboundMessage.mockReset().mockResolvedValue({ id: "in", created: true, status: "RECEIVED" });
    count.mockReset().mockResolvedValue(0);
    upsert.mockReset().mockResolvedValue(undefined);
    resolve.mockReset().mockResolvedValue(undefined);
  });

  it("распознаёт ошибку «поста нет»", () => {
    expect(isGoneTargetError(new Error(GONE.error.message))).toBe(true);
    expect(isGoneTargetError(new Error("Error validating access token"))).toBe(false);
  });

  it("удалённый пост пропускается, ответы под остальными читаются", async () => {
    respond((url) => {
      if (url.includes("/111/")) return GONE;
      if (url.includes("/me?")) return { username: "eterapy_official" };
      return { data: [
        { id: "r1", text: "Спасибо, очень в точку", username: "reader", timestamp: "2026-10-14T09:00:00+0000" },
        { id: "r2", text: "Наш ответ", username: "eterapy_official", timestamp: "2026-10-14T09:05:00+0000" },
      ] };
    });
    const [outcome] = await sweepOwnPublicationComments({ now: NOW, platforms: ["threads"] });
    expect(outcome.error).toBeUndefined();
    expect(outcome).toMatchObject({ publications: 2, found: 2, ingested: 1, skippedOwn: 1, goneTargets: 1 });
    expect(ingestInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ platform: "threads", externalId: "r1", threadId: "222" }));
  });

  it("читает всю ветку (/conversation), а не только прямые ответы", async () => {
    const urls: string[] = [];
    respond((url) => {
      urls.push(url);
      return url.includes("/me?") ? { username: "x" } : { data: [] };
    });
    findMany.mockResolvedValue([{ id: "live", externalPostId: "222", publicUrl: null }]);
    await sweepOwnPublicationComments({ now: NOW, platforms: ["threads"] });
    expect(urls.some((url) => url.includes("/222/conversation"))).toBe(true);
  });

  it("если /conversation недоступен, берёт /replies", async () => {
    respond((url) => {
      if (url.includes("/me?")) return { username: "x" };
      if (url.includes("/conversation")) return { error: { message: "(#10) Application does not have permission" } };
      return { data: [{ id: "r9", text: "Вопрос", username: "reader", timestamp: "2026-10-14T09:00:00+0000" }] };
    });
    findMany.mockResolvedValue([{ id: "live", externalPostId: "222", publicUrl: null }]);
    const [outcome] = await sweepOwnPublicationComments({ now: NOW, platforms: ["threads"] });
    expect(outcome).toMatchObject({ found: 1, ingested: 1 });
  });

  it("если не прочитался ни один пост из-за настоящей ошибки — это сбой обхода", async () => {
    respond(() => ({ error: { message: "Error validating access token" } }));
    const [outcome] = await sweepOwnPublicationComments({ now: NOW, platforms: ["threads"] });
    expect(outcome.error).toMatch(/access token/);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ key: "sweep:threads" }));
  });

  it("сторож: ответы за сутки есть у площадки, входящих в базе нет — сигнал; иначе снимается", async () => {
    respond((url) => (url.includes("/me?") ? { username: "x" } : { data: [
      { id: "r1", text: "Привет", username: "reader", timestamp: "2026-10-14T08:00:00+0000" },
    ] }));
    findMany.mockResolvedValue([{ id: "live", externalPostId: "222", publicUrl: null }]);
    await sweepOwnPublicationComments({ now: NOW, platforms: ["threads"] });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ key: "inbound-gap:threads", severity: "WARNING" }));

    upsert.mockClear();
    count.mockResolvedValue(3);
    await sweepOwnPublicationComments({ now: NOW, platforms: ["threads"] });
    expect(upsert).not.toHaveBeenCalledWith(expect.objectContaining({ key: "inbound-gap:threads" }));
    expect(resolve).toHaveBeenCalledWith("inbound-gap:threads");
  });
});
