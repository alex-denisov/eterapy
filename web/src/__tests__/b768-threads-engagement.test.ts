/** B768 — вопрос в конце поста Threads и тема поста (topic_tag). */
import {
  ENDING_QUESTION_SHARE,
  wantsEndingQuestion,
  endingQuestionFindings,
  endsWithInviteQuestion,
  sanitizeTopicTag,
  topicTagFor,
} from "@/lib/marketing/threads-engagement";

describe("вопрос в конце", () => {
  it("конкретный вопрос последней строкой — годится", () => {
    expect(endsWithInviteQuestion("Бывший прислал свитер.\nУ кого так было — выкинули или оставили пахнуть?")).toBe(true);
    expect(endsWithInviteQuestion("Тельцы, это про работу или про отношения? Напиши цифрой")).toBe(true);
    expect(endsWithInviteQuestion("Тельцов, это про работу или про отношения?")).toBe(true);
  });

  it("пост без вопроса, вопрос не в конце и «что думаете» — замечание", () => {
    expect(endingQuestionFindings({ text: "Сидим, смотрим в потолок.", format: "scene" }).map((f) => f.rule)).toEqual(["threads-end-question"]);
    expect(endingQuestionFindings({ text: "Кто это был?\nПотом заблокировала.", format: null })).toHaveLength(1);
    expect(endingQuestionFindings({ text: "Бывший вернулся.\nЧто думаете?", format: null })).toHaveLength(1);
  });

  it("пост с вопросом и пустой текст замечаний не дают", () => {
    expect(endingQuestionFindings({ text: "Лайк в 2 ночи.\nВы бы ответили?", format: null })).toEqual([]);
    expect(endingQuestionFindings({ text: "  ", format: null })).toEqual([]);
  });

  it("замечание — не отказ: тип contract с готовой правкой для автора", () => {
    const [finding] = endingQuestionFindings({ text: "Без вопроса", format: null });
    expect(finding.kind).toBe("contract");
    expect(finding.brief).toMatch(/последней строкой/);
  });
});

describe("тема поста", () => {
  it("область → тег", () => {
    expect(topicTagFor({ cluster: "бывшие" })).toBe("Отношения");
    expect(topicTagFor({ cluster: "знаки зодиака" })).toBe("Астрология");
    expect(topicTagFor({ cluster: "таро" })).toBe("Таро");
    expect(topicTagFor({ cluster: "начальница" })).toBe("Работа");
    expect(topicTagFor({ cluster: "что-то иное" })).toBe("Психология");
    expect(topicTagFor({ cluster: null })).toBe("Психология");
  });

  it("тег чистится от точек и амперсандов и режется до 50 знаков", () => {
    expect(sanitizeTopicTag("Сон & отдых.")).toBe("Сон отдых");
    expect(sanitizeTopicTag("я".repeat(80))).toHaveLength(50);
    expect(sanitizeTopicTag(" . & ")).toBeNull();
  });
});

describe("вопрос не в каждом посте", () => {
  it("назначение детерминировано и близко к заданной доле", () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `cm${i}abcdefghijkl`);
    expect(ids.map((id) => wantsEndingQuestion(id))).toEqual(ids.map((id) => wantsEndingQuestion(id)));
    const share = ids.filter((id) => wantsEndingQuestion(id)).length / ids.length;
    expect(Math.abs(share - ENDING_QUESTION_SHARE)).toBeLessThan(0.05);
  });

  it("там, где вопрос не назначен, его отсутствие не замечание", () => {
    expect(endingQuestionFindings({ text: "Лайк в 2 ночи.", format: null, wanted: false })).toEqual([]);
    expect(endingQuestionFindings({ text: "Лайк в 2 ночи.", format: null, wanted: true })).toHaveLength(1);
  });
});
