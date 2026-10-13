import {
  ANYA_PERSONA_BLOCK,
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_SMM_SYSTEM_PROMPT,
  marketingSmmSystemPrompt,
  marketingWriterSystemPrompt,
} from "@/lib/marketing/agent-prompt";
import { marketingRole } from "@/lib/marketing/agent-roles";
import { PLATFORM_PROFILES } from "@/lib/marketing/platform-profiles";

const PERSONA_PROMPTS: Record<string, string> = {
  persona: ANYA_PERSONA_BLOCK,
  writer: MARKETING_AGENT_SYSTEM_PROMPT,
  writerThreads: marketingWriterSystemPrompt("threads"),
};

const SAFETY_PROMPTS = [
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_SMM_SYSTEM_PROMPT,
  marketingSmmSystemPrompt("threads"),
];

describe("B774: единая персона автора (решение владельца 2026-10-13)", () => {
  it.each(Object.keys(PERSONA_PROMPTS))("персона %s: сооснователь, два инструмента", (k) => {
    const p = PERSONA_PROMPTS[k];
    expect(p).toContain("автора и сооснователя eTerapy");
    expect(p).toContain("психологию и мягкие практики");
    expect(p).toContain("астрология, нумерология, дизайн человека, таро");
    expect(p).toContain("как язык, а не вердикт");
    expect(p).toContain("Перекоса ни в гадания, ни в психотерапию нет");
  });

  it.each(Object.keys(PERSONA_PROMPTS))("в %s нет старых формулировок", (k) => {
    const p = PERSONA_PROMPTS[k];
    for (const old of ["28–32", "Не психолог", "не психолог", "куратор", "Куратор"]) {
      expect(p).not.toContain(old);
    }
  });

  it("роль автора и профили площадок без возраста и куратора", () => {
    const role = marketingRole("writer");
    expect(`${role.title} ${role.mission}`).not.toMatch(/куратор|28/i);
    for (const profile of Object.values(PLATFORM_PROFILES)) {
      expect(`${profile.tagline} ${profile.bio}`).not.toMatch(/куратор|28 лет/i);
    }
  });

  it.each(SAFETY_PROMPTS.map((p, i) => [i, p] as const))("границы безопасности в промте %s", (_i, raw) => {
    const p = raw.replace(/\s+/g, " ");
    expect(p).toContain("Не называй себя психологом, психотерапевтом или врачом");
    expect(p).toContain("не заявляй дипломы, лицензии, сертификаты и годы квалификации");
    expect(p).toContain("не выдавай себя за клиента или независимого автора");
    expect(p).toContain("я сооснователь ETerapy");
    expect(p).toContain("я из команды ETerapy");
    expect(p).toContain("«представим девушку, которая…»");
    expect(p).toContain("«невыдуманная»");
    expect(p).toContain("Личный опыт и истории не выдумывай в ответах людям и комментариях");
    expect(p).toContain("Тебя ждёт любовь в октябре");
    expect(p).not.toContain("Никогда не выдавай себя за клиента, психолога");
    expect(p).not.toContain("одна женщина пришла с вопросом");
    expect(p).not.toContain("из работы автора с людьми");
  });

  it("B777: в персоне и защите нет «основательницы» и историй «из работы с людьми» как разрешённых", () => {
    for (const raw of [...Object.values(PERSONA_PROMPTS), ...SAFETY_PROMPTS]) {
      const p = raw.replace(/\s+/g, " ");
      expect(p).not.toMatch(/основательниц/);
      expect(p).not.toContain("Разрешены и истории от первого лица");
      expect(p).not.toContain("разговоров с людьми");
    }
    for (const profile of Object.values(PLATFORM_PROFILES)) {
      expect(`${profile.tagline} ${profile.bio}`).not.toMatch(/основательниц/);
    }
  });
});
