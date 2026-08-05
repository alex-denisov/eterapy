/**
 * B677 · «Автоматические тикеты и инциденты» перестают накапливаться.
 *
 * Владелец 2026-08-05: в блоке накопились проблемы. Накопились они не потому,
 * что их не чинили, а по трём независимым причинам, и ни одна не про качество
 * контура:
 *
 *  1. Закрыть сигнал мог ТОЛЬКО код, который его поднял, и только если снова
 *     дошёл до того же места. Разовый сигнал про конкретный материал такой
 *     возможности не имеет: материал вышел — второго прохода не будет никогда.
 *  2. У «канал не подключён» и «канал сломался» была одна severity. Instagram
 *     и Threads, которых владелец сознательно не подключал, висели как INCIDENT
 *     рядом с настоящими сбоями.
 *  3. Ограничение площадки (VK не отдаёт комментарии токену сообщества)
 *     поднимало WARNING каждый час, хотя повторы его не снимут.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");
const source = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("B677 · сигнал закрывается сам", () => {
  const agent = source("lib/marketing/agent.ts");

  it("проход агента начинается со снятия того, чего больше не происходит", () => {
    expect(agent).toContain("sweepStaleMarketingSignals");
    // Именно ПЕРВЫМ действием: если ниже что-то упадёт, доска всё равно
    // окажется честной.
    const cycle = agent.slice(agent.indexOf("export async function runMarketingAgentCycle"));
    const sweepAt = cycle.indexOf("sweepStaleMarketingSignals");
    const horizonAt = cycle.indexOf("marketingGenerationHorizon");
    expect(sweepAt).toBeGreaterThan(-1);
    expect(sweepAt).toBeLessThan(horizonAt);
  });

  it("разовый сигнал про материал закрывается по СОСТОЯНИЮ материала, не по таймеру", () => {
    expect(agent).toContain('status: { notIn: ["DRAFT", "REVIEW"] }');
    // …и удалённый материал тоже не держит строку.
    expect(agent).toMatch(/vanishedKeys/);
  });

  it("повторяющийся сигнал закрывается сутками молчания и вернётся сам, если причина жива", () => {
    expect(agent).toContain("MARKETING_SIGNAL_STALE_MS");
    expect(agent).toMatch(/24 \* 60 \* 60_000/);
    // Ключ у повторяющегося сигнала стабильный — вернётся та же строка.
    expect(agent).toMatch(/staleKeys/);
  });

  it("уборка не имеет права уронить проход", () => {
    expect(agent).toMatch(/sweepStaleMarketingSignals\(now\)\.catch\(\(\) => undefined\)/);
  });
});

describe("B677 · severity говорит правду", () => {
  it("канал без ключа — ожидание, а не инцидент", () => {
    const hold = source("lib/marketing/publish-hold.ts");
    expect(hold).toMatch(/awaitingSetup/);
    expect(hold).toContain('severity: awaitingSetup ? "WARNING" : "INCIDENT"');
    // Всё остальное — по-прежнему инцидент.
    expect(hold).toContain('"INCIDENT"');
  });

  it("ограничение площадки — INFO, и оно называет рабочий путь", () => {
    const sweep = source("lib/marketing/engagement-sweep.ts");
    expect(sweep).toMatch(/platformLimited/);
    expect(sweep).toContain('severity: limited ? "INFO" : "WARNING"');
    expect(sweep).toContain("groups.setLongPollSettings");
  });

  it("прежняя запись про VK опровергнута живой пробой, а не удалена молча", () => {
    const sweep = source("lib/marketing/engagement-sweep.ts");
    expect(sweep).toContain("method is unavailable with group auth");
    expect(sweep).toMatch(/НЕВЕРНА|неверн/i);
  });
});
