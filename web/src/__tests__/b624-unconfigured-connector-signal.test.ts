/**
 * B624, довесок — ненастроенный коннектор не поднимает инцидент.
 *
 * На проде 2026-07-30 опрос входящего Reddit поднимал
 * `WARNING «Не читается входящее: reddit»` с текстом `Reddit OAuth is not
 * connected`. Формально верно, по смыслу нет: OAuth просто не пройден.
 * Платформа сознательно не заводит инцидентов на ненастроенное (B610/B617) —
 * иначе панель владельца показывает не состояние, а список того, что ещё не
 * включали.
 */

const upsertMarketingSignal = jest.fn().mockResolvedValue(undefined);
const resolveMarketingSignal = jest.fn().mockResolvedValue(undefined);
const redditAccessToken = jest.fn();

jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

jest.mock("@/lib/marketing/agent", () => ({
  __esModule: true,
  upsertMarketingSignal: (...args: unknown[]) => upsertMarketingSignal(...args),
  resolveMarketingSignal: (...args: unknown[]) => resolveMarketingSignal(...args),
}));

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: jest.fn().mockResolvedValue(true),
  marketingPlatformValue: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/marketing/reddit-oauth", () => ({
  __esModule: true,
  REDDIT_NOT_CONNECTED: "Reddit OAuth is not connected",
  redditAccessToken: (...args: unknown[]) => redditAccessToken(...args),
}));

import { pollInboundSources } from "@/lib/marketing/inbound";

beforeEach(() => {
  upsertMarketingSignal.mockClear();
  resolveMarketingSignal.mockClear();
  redditAccessToken.mockReset();
});

it("непройденный OAuth не заводит сигнал и снимает старый", async () => {
  redditAccessToken.mockRejectedValue(new Error("Reddit OAuth is not connected"));

  const outcomes = await pollInboundSources({ now: new Date("2026-08-03T21:00:00.000Z") });

  expect(upsertMarketingSignal).not.toHaveBeenCalled();
  expect(resolveMarketingSignal).toHaveBeenCalledWith("inbound:reddit");
  expect(outcomes).toEqual([{ platform: "reddit", found: 0, ingested: 0 }]);
});

it("настоящий отказ API по-прежнему виден сигналом", async () => {
  redditAccessToken.mockRejectedValue(new Error("Reddit token refresh failed: HTTP 500"));

  const outcomes = await pollInboundSources({ now: new Date("2026-08-03T21:00:00.000Z") });

  expect(upsertMarketingSignal).toHaveBeenCalledWith(expect.objectContaining({
    key: "inbound:reddit",
    severity: "WARNING",
  }));
  expect(outcomes[0].error).toContain("HTTP 500");
});
