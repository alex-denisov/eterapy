import { toJournalEntries } from "@/lib/journal-entries";

describe("B464 IB2 journal-entries", () => {
  it("maps EVERY completed practice day; the user's own question wins over the prompt (round-4 #12)", () => {
    const d = new Date("2026-06-30T00:00:00Z");
    const entries = toJournalEntries([
      { id: "a", cardDate: d, prompt: "Подсказка дня", metadata: { userQuestion: "Почему меня задевает?", perspective: "взгляд", step: "шаг" } },
      { id: "b", cardDate: d, prompt: "Что мне сегодня важно?", metadata: { perspective: "no question here" } },
      { id: "c", cardDate: d, prompt: "  ", metadata: null },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "a",
      question: "Почему меня задевает?",
      own: true,
      perspective: "взгляд",
      step: "шаг",
    });
    // A day completed off the suggested prompt still shows in the history.
    expect(entries[1]).toMatchObject({ id: "b", question: "Что мне сегодня важно?", own: false });
  });

  it("tolerates a reflected card with no stored beats", () => {
    const entries = toJournalEntries([
      { id: "a", cardDate: new Date(), prompt: "p", metadata: { userQuestion: "Q" } },
    ]);
    expect(entries[0]).toMatchObject({ question: "Q", perspective: null, step: null });
  });
});
