/** B769 — стоп-проверки кода: ловят названное владельцем и не режут хорошие посты замера. */
import { readFileSync } from "fs";
import { join } from "path";
import { threadsStopFindings } from "@/lib/marketing/threads-stop-checks";

const rules = (text: string) => threadsStopFindings(text).map((f) => f.rule);

describe("стоп-проверки", () => {
  it("книжное слово", () => {
    expect(rules("Все стали осознанными и говорят «я так чувствую»")).toContain("threads-bookish-word");
    expect(rules("Бывший лайкнул фото в два ночи")).toEqual([]);
    // Слово внутри кавычек — чужая речь в сцене (пост оценён на 9).
    expect(rules("Все знакомые вдруг стали «осознанными» и говорят «я так чувствую»")).toEqual([]);
  });

  it("мужской род рассказчика", () => {
    expect(rules("Я сказал ему всё и ушёл")).toContain("threads-masculine-voice");
    expect(rules("Я сказала ему всё и ушла")).toEqual([]);
    // «должен» — состояние, а не действие: владелец оценил такой пост на 9.
    expect(rules("Если голосовое длиннее серии, я должен слушать с конспектом")).toEqual([]);
  });

  it("имя героя без роли; с ролью рядом — можно", () => {
    expect(rules("Елена пишет «это на пять минут» в 18:55")).toContain("threads-name-without-role");
    expect(rules("Начальница Елена пишет «это на пять минут»")).toEqual([]);
  });

  it("довесок после вопроса в последней строке", () => {
    expect(rules("Бывший вернулся.\nУ кого так было? Пишите в комментариях")).toContain("threads-question-tail");
    expect(rules("Бывший вернулся.\nУ кого так было?")).toEqual([]);
  });

  it("пустой текст замечаний не даёт", () => {
    expect(threadsStopFindings("  ")).toEqual([]);
  });

  const setPath = join(process.cwd(), "..", "docs/v5-release/tasks/B762-bench-data/judge-set.json");
  let posts: Array<{ text: string; reply?: string; owner: number }> | null = null;
  try { posts = JSON.parse(readFileSync(setPath, "utf8")); } catch { posts = null; }

  (posts ? it : it.skip)("на 79 постах с оценками владельца режет не больше 2 из 22 постов ≥ 8", () => {
    const high = posts!.filter((p) => p.owner >= 8);
    const cut = high.filter((p) => threadsStopFindings(p.text + (p.reply ? `\n${p.reply}` : "")).length > 0);
    expect(cut.length).toBeLessThanOrEqual(2);
  });
});
