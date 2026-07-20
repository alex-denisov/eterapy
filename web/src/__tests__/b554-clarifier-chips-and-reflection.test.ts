import { parseConversationalTurnResponse } from "@/lib/dialogue-clarifier";

// B554 (owner review): «в сообщении от платформы вместо подсказок (chips)
// внутри находятся вопросы» и «в процессе первичного диалога я получил от
// платформы только лишь вопросы… скилл эксперта-практика не работает».
// Подсказка обязана быть коротким вариантом ОТВЕТА, а реплика ассистента —
// содержать отражение сказанного, а не только очередной вопрос.
describe("B554 clarifier turn contract", () => {
  describe("chips are answer options, never questions", () => {
    it("drops chips that are phrased as questions", () => {
      const parsed = parseConversationalTurnResponse(JSON.stringify({
        q: "Слышу, что решение затянулось. Что держит сильнее — сомнение или усталость?",
        c: ["Сомнение", "А что вы думаете?", "Почему так вышло?", "Усталость"],
      }));

      expect(parsed?.type).toBe("question");
      expect(parsed?.chips).toEqual(["Сомнение", "Усталость"]);
    });

    it("drops chips that open with an interrogative even without a question mark", () => {
      const parsed = parseConversationalTurnResponse(JSON.stringify({
        q: "Понимаю. Что сейчас ближе?",
        c: ["Как мне поступить", "Спокойствие", "Зачем это всё"],
      }));

      expect(parsed?.chips).toEqual(["Спокойствие"]);
    });

    it("drops chips that are whole sentences rather than short options", () => {
      const parsed = parseConversationalTurnResponse(JSON.stringify({
        q: "Слышу вас. Что важнее сейчас?",
        c: ["Понять себя", "Мне кажется что я уже очень давно тяну с этим решением"],
      }));

      expect(parsed?.chips).toEqual(["Понять себя"]);
    });

    it("keeps a normal set of short answer options untouched", () => {
      const parsed = parseConversationalTurnResponse(JSON.stringify({
        q: "Страх оценки — это про реакцию руководителя или про что-то давнее?",
        c: ["Реакция шефа", "Давнее", "Привычка молчать"],
      }));

      expect(parsed?.chips).toEqual(["Реакция шефа", "Давнее", "Привычка молчать"]);
    });
  });

  describe("assistant turn carries a reflection, not just a question", () => {
    it("accepts a split reflection + question contract and joins it for display", () => {
      const parsed = parseConversationalTurnResponse(JSON.stringify({
        m: "Слышу, что вам важно не потерять себя в этой работе.",
        q: "Что первым уходит, когда становится тяжело?",
        c: ["Сон", "Интерес", "Терпение"],
      }));

      expect(parsed?.type).toBe("question");
      expect(parsed?.question).toContain("Слышу, что вам важно не потерять себя");
      expect(parsed?.question).toContain("Что первым уходит");
    });

    it("still accepts the legacy single-field contract", () => {
      const parsed = parseConversationalTurnResponse(JSON.stringify({
        q: "Слышу вас. Что сейчас важнее всего?",
        c: ["Решение"],
      }));

      expect(parsed?.type).toBe("question");
      expect(parsed?.question).toBe("Слышу вас. Что сейчас важнее всего?");
    });

    it("treats an empty reflection-and-question payload as ready", () => {
      const parsed = parseConversationalTurnResponse(JSON.stringify({ m: "", q: "", c: [] }));
      expect(parsed?.type).toBe("ready");
    });
  });
});
