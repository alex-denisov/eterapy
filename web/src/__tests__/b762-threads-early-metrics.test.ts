import { describe, expect, it } from "@jest/globals";
import { marketingMetricTestables } from "@/lib/marketing/metrics";

const published = new Date("2026-10-13T09:00:00.000Z");
const at = (minutes: number) => new Date(published.getTime() + minutes * 60_000);
const { firstDueEarlyMinutes, firstReviewAfterPublish } = marketingMetricTestables;

describe("B762 ранние замеры Threads: 30 и 90 минут", () => {
  it("до 30-й минуты рано", () => {
    expect(firstDueEarlyMinutes(published, at(29), new Set(), "threads")).toBeNull();
  });

  it("30-я минута, потом 90-я; записанное не повторяется", () => {
    expect(firstDueEarlyMinutes(published, at(31), new Set(), "threads")).toBe(30);
    expect(firstDueEarlyMinutes(published, at(95), new Set(["API_THREADS_M30"]), "threads")).toBe(90);
    expect(firstDueEarlyMinutes(published, at(95), new Set(["API_THREADS_M30", "API_THREADS_M90"]), "threads")).toBeNull();
  });

  it("опоздавший замер не пишем: показатели накопительные и скажут про другой срок", () => {
    expect(firstDueEarlyMinutes(published, at(60 * 7), new Set(), "threads")).toBeNull();
    expect(firstDueEarlyMinutes(published, at(60 * 24 * 3), new Set(), "threads")).toBeNull();
  });

  it("только Threads", () => {
    expect(firstDueEarlyMinutes(published, at(40), new Set(), "vk")).toBeNull();
  });

  it("первый контроль после выхода: Threads — через 30 минут, остальные — через 7 суток", () => {
    expect(firstReviewAfterPublish("THREADS", published)).toEqual(at(30));
    expect(firstReviewAfterPublish("VK", published)).toEqual(new Date(published.getTime() + 7 * 86_400_000));
  });
});
