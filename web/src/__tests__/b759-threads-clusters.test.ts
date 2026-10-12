/** B759 — каталог кластеров Threads, приёмы, «библия» героев, плечо крепкой лексики. */
import { THREADS_FORMATS, formatRulesFor, formatsFor } from "@/lib/marketing/post-formats";
import {
  CAT_NAME,
  CORE_HEROES,
  DORMANT_CLUSTER_FORMATS,
  PROFANITY_ARM_PERIOD,
  TECHNIQUES,
  heroRuleFor,
  isProfanityArm,
  techniqueFor,
} from "@/lib/marketing/threads-clusters";
import { MARKETING_AGENT_SYSTEM_PROMPT } from "@/lib/marketing/agent-prompt";
import { contentPlanFor } from "@/lib/marketing/content-plan";

describe("каталог кластеров", () => {
  it("кот — Котлета, ядро серии из четырёх героев", () => {
    expect(CAT_NAME).toBe("Котлета");
    expect(CORE_HEROES).toHaveLength(4);
    expect(CORE_HEROES.join(" ")).toMatch(/Никита[\s\S]*Миша[\s\S]*Катя[\s\S]*Котлета/);
  });

  it("каждый кластерный формат без ссылки и призыва, с тегом кластера, весом и примером", () => {
    const tagged = THREADS_FORMATS.filter((format) => format.cluster);
    expect(tagged.length).toBeGreaterThanOrEqual(25);
    for (const format of tagged) {
      expect(format.link).toBe(false);
      expect(format.weight).toBeGreaterThan(0);
      expect(format.example.length).toBeGreaterThan(10);
      expect(format.rules.join(" ")).toMatch(/НЕ нужны/);
    }
  });

  it("воронка K13 и самопрезентация K24 заведены, но спят: в ленту не попадают", () => {
    expect(DORMANT_CLUSTER_FORMATS.map((format) => format.cluster)).toEqual(["K13", "K24"]);
    const labels = formatsFor("threads").map((format) => format.label);
    for (const dormant of DORMANT_CLUSTER_FORMATS) expect(labels).not.toContain(dormant.label);
  });

  it("коды кластеров не повторяются, не более двух форматов на код", () => {
    const counts = new Map<string, number>();
    for (const format of THREADS_FORMATS) {
      if (format.cluster) counts.set(format.cluster, (counts.get(format.cluster) ?? 0) + 1);
    }
    for (const [code, count] of counts) {
      expect(count).toBeLessThanOrEqual(2); // базовый формат и кластерный-близнец (K4, K7, K9)
    }
  });
});

describe("герои и приёмы", () => {
  it("герой слота детерминирован, ядро серии вращается", () => {
    expect(heroRuleFor("core", 10, 1)).toBe(heroRuleFor("core", 10, 1));
    const seen = new Set([0, 1, 2, 3].map((sequence) => heroRuleFor("core", 3, sequence)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("правила формата с героями получают строку героя, без героев — те же правила", () => {
    const withHeroes = THREADS_FORMATS.find((format) => format.heroes === "core")!;
    expect(formatRulesFor(withHeroes, 5, 1)[0]).toMatch(/Герой поста/);
    const plain = THREADS_FORMATS.find((format) => !format.heroes && format.label !== "оклик по знаку с прогнозом в ответе")!;
    expect(formatRulesFor(plain, 5, 1)).toBe(plain.rules);
  });

  it("приёмов больше десяти, воронка и мат среди автовыбираемых не числятся", () => {
    expect(TECHNIQUES.length).toBeGreaterThan(10);
    const codes = TECHNIQUES.map((technique) => technique.code);
    for (const banned of ["P9", "P13", "P14", "P24", "P28"]) expect(codes).not.toContain(banned);
  });

  it("одна и та же пара кластер × приём не повторяется чаще раза в 7 суток подряд", () => {
    for (let cluster = 0; cluster < 27; cluster += 1) {
      const window = new Set<string>();
      for (let day = 100; day < 107; day += 1) window.add(techniqueFor(day, 0, cluster).code);
      expect(window.size).toBe(7);
    }
  });

  it("мат — ровно один пост из десяти", () => {
    let hits = 0;
    for (let n = 0; n < PROFANITY_ARM_PERIOD * 20; n += 1) {
      if (isProfanityArm(Math.floor(n / 4), n % 4)) hits += 1;
    }
    expect(hits).toBe(20);
  });
});

describe("план и промты", () => {
  it("слоты Threads несут кластер и приём для замера", () => {
    const plan = contentPlanFor(new Date("2026-10-13T08:00:00Z"));
    const threads = plan.filter((slot) => slot.channel === "threads");
    expect(threads.length).toBeGreaterThan(0);
    expect(threads.every((slot) => slot.technique)).toBe(true);
    expect(threads.some((slot) => slot.formatCluster)).toBe(true);
    // Мат допускается только в слотах с кодом плеча.
    for (const slot of threads) {
      const allowsProfanity = (slot.formatRules ?? []).some((rule) => /мат\)/.test(rule));
      if (allowsProfanity) expect(slot.technique).toBe("P28");
    }
  });

  it("промт: развлекательные истории рассказчика разрешены, отзывы и статистика — нет", () => {
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("развлекательные");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Не выдумывай отзывы, результаты клиентов, статистику");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Формат сильнее пунктов 1–2");
  });
});
