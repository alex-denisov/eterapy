import fs from "fs";
import path from "path";
import { stripEchoOpening } from "@/lib/dialogue-clarifier";
import { AI_PROMPT_DEFAULT_REVISION } from "@/lib/ai-gateway/prompts";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("B560 — первичный диалог не пересказывает реплику клиента", () => {
  const USER = "Мы с женой постоянно ссоримся из-за денег, хотя денег хватает.";

  it("срезает вступление-зеркало, оставляя мысль и вопрос", () => {
    // Реальный ответ модели из живого прогона против YandexGPT Lite.
    const answer = "Вы упомянули, что денег хватает, но ссоры продолжаются. Возможно, есть разница в подходах к тратам. Какие у вас представления о том, как распоряжаться деньгами?";
    const result = stripEchoOpening(answer, USER);
    expect(result).not.toContain("Вы упомянули");
    expect(result).toContain("разница в подходах");
    expect(result).toContain("?");
  });

  it("срезает дословный повтор реплики", () => {
    const answer = `${USER} Что именно происходит в момент ссоры?`;
    expect(stripEchoOpening(answer, USER)).toBe("Что именно происходит в момент ссоры?");
  });

  it("не трогает ответ, который сразу начинается с мысли", () => {
    const answer = "За спором о тратах часто стоит спор о том, кто в паре решает. Кто обычно предлагает крупную покупку?";
    expect(stripEchoOpening(answer, USER)).toBe(answer);
  });

  it("не режет, если после вступления не остаётся вопроса", () => {
    const answer = "Вы говорите, что денег хватает. Это важно.";
    expect(stripEchoOpening(answer, USER)).toBe(answer);
  });

  it("не ломает односоставный ответ", () => {
    const answer = "Кто в паре обычно заводит разговор о деньгах?";
    expect(stripEchoOpening(answer, USER)).toBe(answer);
  });

  it("промт запрещает пересказ, а ревизия сдвинута — иначе прод останется на старой строке", () => {
    const prompts = source("src/lib/ai-gateway/prompts.ts");
    expect(prompts).not.toContain("коротко отзеркалить конкретную фразу пользователя");
    expect(prompts).toContain("НИКОГДА не пересказывай и не перефразируй реплику пользователя");
    // На проде живёт синхронизированная копия в `ai_prompt_configs`; она
    // обновляется только при смене ревизии.
    expect(AI_PROMPT_DEFAULT_REVISION).not.toBe("2026-07-14-surname-karmic-audit");
  });
});
