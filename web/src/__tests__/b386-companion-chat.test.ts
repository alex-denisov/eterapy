// B386 (M26) — предохранители персоны-компаньона + тарификация сеансов.
// Безопасность и деньги критичны → покрываем чистую логику плотно.

import {
  buildCompanionSystemPrompt,
  companionSafeguard,
  detectBotProbe,
  sanitizeCompanionReply,
  splitIntoMessages,
  typingDelayMs,
  BOT_PROBE_DEFLECTION,
  COMPANION_MODES,
} from "@/lib/companion-chat";
import {
  decideChatSend,
  freeMessagesRemaining,
  isPaidSessionActive,
  paidMinutesRemaining,
  sessionWindowOnStart,
  sessionWindowOnExtend,
  canExtendSession,
  canUsePremiumIncludedSession,
  premiumIncludedRemaining,
  CHAT_SESSION_COST_CREDITS,
  CHAT_SESSION_PRICE_KOPECKS,
  CHAT_EXTENSION_COST_CREDITS,
  FREE_CHAT_MESSAGE_LIMIT,
  type ChatSessionState,
} from "@/lib/chat-session";

describe("предохранители компаньона", () => {
  it("кризисные маркеры → crisis + хэндофф (не продолжаем обычный разговор)", () => {
    // эвристика ловит явные маркеры (suicide/self-harm/violence); AI-классификатор
    // в API добавляет более тонкие случаи (домашнее насилие и т.п.).
    for (const phrase of ["хочу покончить с собой", "я думаю о суициде", "он угрожает меня убить"]) {
      const guard = companionSafeguard(phrase);
      expect(guard.action).toBe("crisis");
      if (guard.action === "crisis") {
        expect(guard.offerSpecialist).toBe(true);
        expect(guard.reply.length).toBeGreaterThan(40);
      }
    }
  });

  it("«ты бот?» → мягкий уход, без подтверждения/отрицания", () => {
    for (const phrase of ["ты бот?", "это ИИ или человек?", "ты живой?", "с кем я говорю", "ты chatgpt?"]) {
      expect(detectBotProbe(phrase)).toBe(true);
      const guard = companionSafeguard(phrase);
      expect(guard.action).toBe("deflect");
      if (guard.action === "deflect") expect(guard.reply).toBe(BOT_PROBE_DEFLECTION);
    }
    // дефлексия не раскрывает природу (ни «бот/ИИ», ни «живой специалист»)
    expect(/бот|искусственн|нейросет|чат-бот|живой специалист/i.test(BOT_PROBE_DEFLECTION)).toBe(false);
  });

  it("обычное сообщение → continue", () => {
    expect(companionSafeguard("не знаю, стоит ли мне менять работу").action).toBe("continue");
  });

  it("санитайзер вывода глушит утечки «я ИИ» и «я живой специалист»", () => {
    expect(sanitizeCompanionReply("Честно говоря, я бот, созданный для помощи.")).toBe(BOT_PROBE_DEFLECTION);
    expect(sanitizeCompanionReply("Я искусственный интеллект.")).toBe(BOT_PROBE_DEFLECTION);
    expect(sanitizeCompanionReply("Как живой психолог, я советую…")).toBe(BOT_PROBE_DEFLECTION);
    expect(sanitizeCompanionReply("Расскажите, что произошло дальше?")).toBe("Расскажите, что произошло дальше?");
    expect(sanitizeCompanionReply("")).toBe(BOT_PROBE_DEFLECTION);
  });

  it("системный промт несёт ключевые правила во всех режимах", () => {
    for (const mode of ["stay", "explore", "question"] as const) {
      const prompt = buildCompanionSystemPrompt(mode);
      expect(prompt).toContain(COMPANION_MODES[mode].instruction);
      expect(prompt).toMatch(/не раскрывай свою природу/i);
      expect(prompt).toMatch(/диагноз/i);
      expect(prompt).toMatch(/срочн|экстренн/i);
    }
  });

  it("ритм печати: задержка в разумных границах, длинный ответ дробится", () => {
    expect(typingDelayMs("")).toBeGreaterThanOrEqual(1000);
    expect(typingDelayMs("ы".repeat(5000))).toBeLessThanOrEqual(9000);
    const longReply = "Первое довольно длинное предложение про то, что вы чувствуете прямо сейчас. "
      + "Второе предложение, которое помогает мягко прояснить ситуацию и не торопиться с выводами. "
      + "Третье предложение, предлагающее один маленький посильный шаг на ближайшее время.";
    const parts = splitIntoMessages(longReply);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ")).toContain("Первое довольно длинное предложение");
  });
});

describe("тарификация чат-сеанса", () => {
  const fresh: ChatSessionState = { freeMessagesUsed: 0, paidStartedAt: null, paidExpiresAt: null };

  it("первый мини-чат бесплатен (≈10 сообщений)", () => {
    expect(freeMessagesRemaining(0)).toBe(FREE_CHAT_MESSAGE_LIMIT);
    expect(decideChatSend({ ...fresh, freeMessagesUsed: 3 })).toEqual({ allowed: true, kind: "free", freeRemaining: 7 });
  });

  it("после исчерпания бесплатных без активного сеанса → нужен платный сеанс (4 балла / 790 ₽)", () => {
    const decision = decideChatSend({ ...fresh, freeMessagesUsed: FREE_CHAT_MESSAGE_LIMIT });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.cost.credits).toBe(CHAT_SESSION_COST_CREDITS);
      expect(decision.cost.kopecks).toBe(CHAT_SESSION_PRICE_KOPECKS);
      expect(decision.cost.credits).toBe(4);
      expect(decision.cost.kopecks).toBe(79000);
    }
  });

  it("активный оплаченный сеанс → отправка разрешена независимо от бесплатного лимита", () => {
    const now = new Date("2026-06-13T12:00:00Z");
    const active: ChatSessionState = {
      freeMessagesUsed: 50,
      paidStartedAt: now,
      paidExpiresAt: new Date(now.getTime() + 20 * 60_000),
    };
    const decision = decideChatSend(active, now);
    expect(decision).toEqual({ allowed: true, kind: "paid", minutesRemaining: 20 });
    expect(isPaidSessionActive(active, now)).toBe(true);
  });

  it("истёкший сеанс не активен → снова нужен платный сеанс", () => {
    const now = new Date("2026-06-13T12:00:00Z");
    const expired: ChatSessionState = {
      freeMessagesUsed: FREE_CHAT_MESSAGE_LIMIT,
      paidStartedAt: new Date(now.getTime() - 60 * 60_000),
      paidExpiresAt: new Date(now.getTime() - 15 * 60_000),
    };
    expect(isPaidSessionActive(expired, now)).toBe(false);
    expect(paidMinutesRemaining(expired, now)).toBe(0);
    expect(decideChatSend(expired, now).allowed).toBe(false);
  });

  it("окно сеанса: старт = +45 мин, продление = +30 мин от конца окна", () => {
    const now = new Date("2026-06-13T12:00:00Z");
    const { startedAt, expiresAt } = sessionWindowOnStart(now);
    expect(startedAt).toEqual(now);
    expect(expiresAt.getTime() - now.getTime()).toBe(45 * 60_000);

    const active: ChatSessionState = { freeMessagesUsed: 0, paidStartedAt: now, paidExpiresAt: expiresAt };
    const extended = sessionWindowOnExtend(active, new Date(now.getTime() + 10 * 60_000));
    // продление от конца текущего окна (12:45) + 30 мин = 13:15
    expect(extended.expiresAt.getTime() - expiresAt.getTime()).toBe(30 * 60_000);
    expect(CHAT_EXTENSION_COST_CREDITS).toBe(2);
  });

  it("issue #6: продлить можно начатую сессию даже после 00:00, но не НЕ начатую", () => {
    const now = new Date("2026-06-22T12:00:00Z");
    const fresh: ChatSessionState = { freeMessagesUsed: 0, paidStartedAt: null, paidExpiresAt: null };
    // никогда не стартовавшая сессия — продление запрещено (обход полного старта)
    expect(canExtendSession(fresh)).toBe(false);
    // активная сессия — продление доступно
    const active: ChatSessionState = { freeMessagesUsed: 0, paidStartedAt: now, paidExpiresAt: new Date(now.getTime() + 60_000) };
    expect(canExtendSession(active)).toBe(true);
    // истёкшая, но когда-то начатая (таймер на 00:00) — продление ВСЁ ЕЩЁ доступно
    const lapsed: ChatSessionState = { freeMessagesUsed: 0, paidStartedAt: now, paidExpiresAt: new Date(now.getTime() - 60_000) };
    expect(isPaidSessionActive(lapsed, new Date(now.getTime() + 5_000))).toBe(false);
    expect(canExtendSession(lapsed)).toBe(true);
  });

  it("Premium: 2 включённых сеанса в месяц без списания баллов", () => {
    expect(canUsePremiumIncludedSession({ isPremium: true, includedUsedThisMonth: 0 })).toBe(true);
    expect(canUsePremiumIncludedSession({ isPremium: true, includedUsedThisMonth: 1 })).toBe(true);
    expect(canUsePremiumIncludedSession({ isPremium: true, includedUsedThisMonth: 2 })).toBe(false);
    expect(canUsePremiumIncludedSession({ isPremium: false, includedUsedThisMonth: 0 })).toBe(false);
    expect(premiumIncludedRemaining(1)).toBe(1);
  });
});
