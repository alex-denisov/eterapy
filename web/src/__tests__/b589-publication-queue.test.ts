/**
 * B589 фаза 1 · Очередь черновиков постов.
 *
 * Что здесь сторожится и почему именно это:
 *   — КАЖДЫЙ слот плана указывает на живую карточку библиотеки. Пост со
 *     ссылкой в никуда не даёт ни индексации, ни перехода, и заметят это
 *     снаружи, а не у нас;
 *   — ключи слотов уникальны: по ним стоит уникальный индекс в базе, и он
 *     единственное, что не даёт daily-джобу выпустить один и тот же пост
 *     столько раз, сколько тиков воркера попало в сутки;
 *   — генератор ДЕТЕРМИНИРОВАН: одинаковый вход даёт одинаковый выход, иначе
 *     проверить сгенерированное можно только глазами, а при расписании раз в
 *     день этого никто делать не будет;
 *   — в тексте поста есть ссылка с UTM, и наружу в этой фазе не уходит ничего.
 */

import { approvedLibraryEntries } from "@/data/anonymous-library";
import {
  CONTENT_PLAN,
  nextPlanSlots,
  planSlot,
} from "@/lib/marketing/content-plan";
import { destinationUrlFor, generatePost } from "@/lib/marketing/post-generator";
import { CRON_SCHEDULES } from "@/lib/cron-scheduler";

describe("B589 · контент-план", () => {
  it("каждый слот ведёт на существующую опубликованную карточку", () => {
    const slugs = new Set(approvedLibraryEntries().map((entry) => entry.slug));
    for (const slot of CONTENT_PLAN) {
      expect(slugs.has(slot.articleSlug)).toBe(true);
    }
  });

  it("ключи слотов уникальны — на них держится защита от повторной генерации", () => {
    const keys = CONTENT_PLAN.map((slot) => slot.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(planSlot(key)?.key).toBe(key);
  });

  it("порядок выпуска однозначен", () => {
    const orders = CONTENT_PLAN.map((slot) => slot.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("занятые слоты не выдаются повторно", () => {
    const first = nextPlanSlots([], 2);
    expect(first).toHaveLength(2);

    const second = nextPlanSlots(first.map((slot) => slot.key), 2);
    expect(second.map((slot) => slot.key)).not.toEqual(
      expect.arrayContaining(first.map((slot) => slot.key)),
    );
  });

  it("исчерпанный план не выдаёт ничего вместо того, чтобы начать заново", () => {
    const all = CONTENT_PLAN.map((slot) => slot.key);
    expect(nextPlanSlots(all, 5)).toHaveLength(0);
  });
});

describe("B589 · генератор поста", () => {
  const slot = CONTENT_PLAN[0];

  it("собирает пост из карточки и ведёт на неё же", () => {
    const post = generatePost(slot);
    expect(post).not.toBeNull();

    const entry = approvedLibraryEntries().find((card) => card.slug === slot.articleSlug)!;
    expect(post!.body).toContain(entry.question);
    expect(post!.body).toContain(entry.summary);
    expect(post!.body).toContain(`/library/${slot.articleSlug}`);
  });

  it("детерминирован — два вызова дают один текст", () => {
    expect(generatePost(slot)!.body).toBe(generatePost(slot)!.body);
  });

  it("ссылка размечена UTM канала", () => {
    const url = new URL(destinationUrlFor(slot));
    expect(url.searchParams.get("utm_source")).toBe(slot.channel);
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_content")).toBe(slot.articleSlug);
  });

  it("слот без статьи возвращает null, а не подставляет чужую", () => {
    const broken = { ...slot, articleSlug: "takoy-karto4ki-net" };
    expect(generatePost(broken)).toBeNull();
  });

  it("текст поста полезен без перехода: в нём есть первый шаг", () => {
    for (const planned of CONTENT_PLAN) {
      const post = generatePost(planned);
      expect(post).not.toBeNull();
      expect(post!.body).toContain("С чего начать:");
      expect(post!.body.length).toBeGreaterThan(200);
    }
  });
});

describe("B589 · расписание", () => {
  it("джоб генерации зарегистрирован ежедневно и не помечен финансовым", () => {
    const schedule = CRON_SCHEDULES.find((item) => item.type === "cron.marketing-generate");
    expect(schedule).toBeDefined();
    expect(schedule!.cadence).toBe("daily");
    expect(schedule!.financial).toBeUndefined();
  });

  it("джоба публикации в этой фазе нет вовсе — наружу ничего не уходит", () => {
    expect(CRON_SCHEDULES.some((item) => item.type === "cron.marketing-publish")).toBe(false);
  });
});
