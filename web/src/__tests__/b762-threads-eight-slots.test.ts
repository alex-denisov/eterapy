/**
 * B762 — Threads: 8 постов в сутки в окне 07:30–23:30 МСК без «копирки».
 *
 * Решения владельца 2026-10-12: 8 слотов, окно 07:30–23:30; один хук не
 * повторяется за месяц; «*знак* ало» не идёт подряд; каждый пост — новый.
 * Расписание и состав суток проверяются на неделе вперёд (56 слотов).
 */

import { contentPlanFor, THREADS_SLOTS_PER_DAY } from "@/lib/marketing/content-plan";
import { threadsCountForDay, threadsDayLineup, ZODIAC_FAMILY_CLUSTERS } from "@/lib/marketing/threads-lineup";

const NOW = new Date("2026-10-12T03:00:00Z");
const DAY0 = 20_740; // произвольные сутки эпохи; свойства не зависят от выбора

function minutesMsk(iso: string): number {
  const at = new Date(iso);
  const msk = new Date(at.getTime() + 3 * 3_600_000);
  return msk.getUTCHours() * 60 + msk.getUTCMinutes();
}

describe("B762 — расписание 8 слотов", () => {
  const threads = contentPlanFor(NOW).filter((slot) => slot.channel === "threads");
  const byDay = new Map<string, typeof threads>();
  for (const slot of threads) {
    const day = new Date(new Date(slot.scheduledAt).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), slot]);
  }

  it("каждые сутки горизонта — ровно 4 слота (B777: до 31.10), у каждого окно; потолок лесенки — 8", () => {
    expect(THREADS_SLOTS_PER_DAY).toBe(8);
    expect(byDay.size).toBe(7);
    for (const slots of byDay.values()) {
      expect(slots).toHaveLength(4);
      expect(slots.every((slot) => slot.toleranceMs > 0 && slot.daypart.startsWith("slot-"))).toBe(true);
    }
  });

  it("все слоты внутри 07:30–23:30 МСК и не ближе полутора часов друг к другу", () => {
    for (const slots of byDay.values()) {
      const minutes = slots.map((slot) => minutesMsk(slot.scheduledAt)).sort((a, b) => a - b);
      expect(minutes[0]).toBeGreaterThanOrEqual(7 * 60 + 30);
      expect(minutes[minutes.length - 1]).toBeLessThanOrEqual(23 * 60 + 30);
      for (let index = 1; index < minutes.length; index += 1) {
        expect(minutes[index] - minutes[index - 1]).toBeGreaterThanOrEqual(90);
      }
    }
  });

  it("план воспроизводим: два пересчёта дают те же ключи и время", () => {
    const again = contentPlanFor(NOW).filter((slot) => slot.channel === "threads");
    expect(again.map((slot) => `${slot.key}@${slot.scheduledAt}`)).toEqual(
      threads.map((slot) => `${slot.key}@${slot.scheduledAt}`),
    );
  });
});

describe("B762 — состав суток без копирки", () => {
  const days = Array.from({ length: 30 }, (_, index) => DAY0 + index);
  const lineups = days.map((day) => threadsDayLineup(day));

  it("внутри суток формат не повторяется", () => {
    lineups.forEach((lineup, index) => {
      expect(lineup).toHaveLength(threadsCountForDay(DAY0 + index));
      expect(new Set(lineup.map((entry) => entry.format.label)).size).toBe(lineup.length);
    });
  });

  it("оклик знака не идёт подряд — ни внутри суток, ни через полночь, и не больше двух в сутки", () => {
    const flat = lineups.flat();
    for (let index = 1; index < flat.length; index += 1) {
      const both = [flat[index - 1], flat[index]].every((entry) => ZODIAC_FAMILY_CLUSTERS.has(entry.format.cluster ?? ""));
      expect(both).toBe(false);
    }
    for (const lineup of lineups) {
      expect(lineup.filter((entry) => ZODIAC_FAMILY_CLUSTERS.has(entry.format.cluster ?? "")).length).toBeLessThanOrEqual(2);
    }
  });

  it("знак оклика не повторяется в шести подряд идущих окликах", () => {
    const signs = lineups.flat().map((entry) => entry.sign).filter((sign): sign is string => Boolean(sign));
    expect(signs.length).toBeGreaterThan(10);
    for (let index = 0; index + 6 <= signs.length; index += 1) {
      expect(new Set(signs.slice(index, index + 6)).size).toBe(6);
    }
  });

  it("герой ядра не повторяется внутри суток", () => {
    for (const lineup of lineups) {
      const heroes = lineup.filter((entry) => entry.format.heroes === "core").map((entry) => entry.heroIndex);
      expect(new Set(heroes).size).toBe(heroes.length);
    }
  });

  it("пара «кластер × приём» не повторяется за 7 суток", () => {
    for (let start = 0; start + 7 <= lineups.length; start += 1) {
      const pairs = lineups.slice(start, start + 7).flat()
        .filter((entry) => entry.technique)
        .map((entry) => `${entry.format.cluster}×${entry.technique!.code}`);
      expect(new Set(pairs).size).toBe(pairs.length);
    }
  });

  it("старые форматы, которые зашли публике, остаются в ротации", () => {
    const labels = new Set(lineups.flat().map((entry) => entry.format.label));
    for (const label of ["оклик по знаку с прогнозом в ответе", "сатира над индустрией", "острый вопрос", "непопулярное мнение"]) {
      expect(labels.has(label)).toBe(true);
    }
  });
});

describe("B762 — строки старой сетки встают на время своего слота", () => {
  const { planQueueHygiene } = jest.requireActual("@/lib/marketing/queue-hygiene") as typeof import("@/lib/marketing/queue-hygiene");
  const plan = contentPlanFor(NOW);
  const slot = plan.find((entry) => entry.channel === "threads" && entry.key.endsWith("-02"))!;
  const slotAt = new Date(slot.scheduledAt);
  const legacy = {
    id: "legacy-02",
    platform: "threads",
    status: "DRAFT",
    contentType: "POST",
    // Старая сетка: вечер 18:45, а слот -02 теперь утренний.
    scheduledFor: new Date(slotAt.getTime() + 9 * 3_600_000),
    publishedAt: null,
    createdAt: new Date("2026-10-11T00:00:00Z"),
    planSlot: slot.key,
    hasDraftText: false,
    telegramReviewMessageId: null,
    moderationDecisionAt: null,
  };

  it("время строки приводится к времени слота, слот и формат прежние", () => {
    const { actions } = planQueueHygiene({ now: NOW, rows: [legacy], plan });
    expect(actions).toEqual([expect.objectContaining({
      kind: "schedule", id: "legacy-02", planSlot: slot.key, scheduledFor: slotAt,
    })]);
  });

  it("строка, совпадающая со слотом, не трогается", () => {
    const { actions } = planQueueHygiene({ now: NOW, rows: [{ ...legacy, scheduledFor: slotAt }], plan });
    expect(actions).toHaveLength(0);
  });

  it("слот, время которого уже прошло, строку назад не тянет", () => {
    const late = new Date(slotAt.getTime() + 60_000);
    const { actions } = planQueueHygiene({ now: late, rows: [legacy], plan });
    expect(actions.find((action) => action.kind === "schedule" && action.planSlot === slot.key)).toBeUndefined();
  });

  it("другие площадки правило не трогает", () => {
    const telegram = plan.find((entry) => entry.channel === "telegram")!;
    const row = { ...legacy, id: "tg", platform: "telegram", planSlot: telegram.key,
      scheduledFor: new Date(new Date(telegram.scheduledAt).getTime() + 3_600_000) };
    const { actions } = planQueueHygiene({ now: NOW, rows: [row], plan });
    expect(actions).toHaveLength(0);
  });
});
