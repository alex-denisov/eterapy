/**
 * B705 — у автора один контракт площадки, а не шесть подряд.
 *
 * Ответ на вопрос владельца 2026-08-12 («он пишет всё подряд, не взирая на
 * специфику площадки?») был «да»: `MARKETING_AGENT_SYSTEM_PROMPT` держал раздел
 * «КОНТРАКТ ПЛОЩАДОК» со всеми шестью лентами сразу. Цена измерена дословно из
 * `archive_reason` прода: «текст всё ещё длиннее лимита Threads (718
 * символов)» — при пределе 480, который стоял в его же промте пятым по счёту
 * среди чужих.
 *
 * Второй предмет проверки — ЛОВУШКА СКЛЕЙКИ. Площадочный хвост доезжает до
 * модели только пока общая часть остаётся ДОСЛОВНЫМ ПРЕФИКСОМ промта:
 * `mergeAIPromptOverride` отделяет хвост от кодового умолчания проверкой
 * `startsWith`. Перестанет — админская копия в `ai_prompt_configs` сотрёт
 * контракт площадки МОЛЧА, и всё вернётся к состоянию до B705.
 */

import {
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_REVIEWER_SYSTEM_PROMPT,
  marketingReviewerSystemPrompt,
  marketingWriterSystemPrompt,
} from "@/lib/marketing/agent-prompt";
import {
  AI_PROMPT_DEFAULT_REVISION,
  defaultPromptTextForFeature,
  mergeAIPromptOverride,
} from "@/lib/ai-gateway/prompts";
import { PLATFORM_PLAYBOOKS } from "@/lib/marketing/platform-playbook";

const PLATFORMS = Object.keys(PLATFORM_PLAYBOOKS);

describe("B705 — системный промт разделён по площадкам", () => {
  it("в общей части не осталось контракта чужих площадок", () => {
    expect(MARKETING_AGENT_SYSTEM_PROMPT).not.toContain("КОНТРАКТ ПЛОЩАДОК");
    // Числа соседних лент в общей части — это ровно тот способ, которым автор
    // Threads получал предел Telegram.
    expect(MARKETING_AGENT_SYSTEM_PROMPT).not.toContain("не более 480 символов");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).not.toContain("не более 1000 символов");
  });

  it("промт автора для Threads не содержит правил Дзена и наоборот", () => {
    const threads = marketingWriterSystemPrompt("threads");
    const dzen = marketingWriterSystemPrompt("dzen");

    expect(threads).toContain("КОНТРАКТ ТВОЕЙ ПЛОЩАДКИ — threads");
    expect(threads).not.toContain("Дзен");
    expect(dzen).toContain("КОНТРАКТ ТВОЕЙ ПЛОЩАДКИ — dzen");
    expect(dzen).not.toContain("Threads");
  });

  it("редактор судит нативность по контракту той же площадки", () => {
    const threads = marketingReviewerSystemPrompt("threads");
    expect(threads).toContain(MARKETING_REVIEWER_SYSTEM_PROMPT);
    expect(threads).toContain("КОНТРАКТ ТВОЕЙ ПЛОЩАДКИ — threads");
    expect(threads).not.toContain("Дзен");
  });

  it("каждая из шести площадок получает свой брифинг и ровно один", () => {
    for (const platform of PLATFORMS) {
      const prompt = marketingWriterSystemPrompt(platform);
      const sections = prompt.match(/## КОНТРАКТ ТВОЕЙ ПЛОЩАДКИ/gu) ?? [];
      expect(sections).toHaveLength(1);
      expect(prompt).toContain(PLATFORM_PLAYBOOKS[platform].briefing);
      expect(prompt).toContain(PLATFORM_PLAYBOOKS[platform].audience);
    }
  });

  it("незнакомая площадка не получает выдуманного контракта", () => {
    const unknown = marketingWriterSystemPrompt("pikabu");
    expect(unknown).toContain("Плейбук этой площадки не заведён");
    expect(unknown).not.toContain(PLATFORM_PLAYBOOKS.dzen.briefing);
  });
});

describe("B705 — площадочный хвост переживает админскую правку промта", () => {
  it("общая часть остаётся дословным префиксом промта автора и редактора", () => {
    for (const platform of PLATFORMS) {
      expect(marketingWriterSystemPrompt(platform).startsWith(MARKETING_AGENT_SYSTEM_PROMPT)).toBe(true);
      expect(marketingReviewerSystemPrompt(platform).startsWith(MARKETING_REVIEWER_SYSTEM_PROMPT)).toBe(true);
    }
  });

  it("кодовое умолчание фичи совпадает с общей частью", () => {
    // `mergeAIPromptOverride` отрезает хвост по длине ИМЕННО этой строки.
    expect(defaultPromptTextForFeature("marketing-agent-writer")).toBe(MARKETING_AGENT_SYSTEM_PROMPT);
    expect(defaultPromptTextForFeature("marketing-agent-reviewer")).toBe(MARKETING_REVIEWER_SYSTEM_PROMPT);
    expect(defaultPromptTextForFeature("marketing-reply-writer")).toBe(MARKETING_AGENT_SYSTEM_PROMPT);
  });

  it("правка администратора заменяет общую часть, но не стирает контракт площадки", () => {
    const merged = mergeAIPromptOverride(
      "marketing-agent-writer",
      marketingWriterSystemPrompt("threads"),
      "Пиши суше и короче обычного.",
    );
    expect(merged).toContain("Пиши суше и короче обычного.");
    expect(merged).toContain("КОНТРАКТ ТВОЕЙ ПЛОЩАДКИ — threads");
  });
});

describe("B705 — ревизия промтов поднята вместе с текстом", () => {
  it("номер ревизии отличается от того, с которым синхронизирован прод", () => {
    // B560/§12: без нового номера строка в `ai_prompt_configs` не считается
    // устаревшей, и модель продолжает читать промт со всеми шестью лентами.
    expect(AI_PROMPT_DEFAULT_REVISION).not.toBe("2026-07-28-marketing-agent-public-social-v2");
  });
});

describe("B705 — редактор не переспрашивает у модели то, что посчитала машина", () => {
  it("machineFindings описан в промте редактора как факт, а не как мнение", () => {
    expect(MARKETING_REVIEWER_SYSTEM_PROMPT).toContain("machineFindings");
    expect(MARKETING_REVIEWER_SYSTEM_PROMPT).toContain("не ищи заново");
  });
});
