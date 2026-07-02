import { toJournalEntries } from "@/lib/journal-entries";

describe("B464 IB2 journal-entries", () => {
  it("keeps only cards with a user-authored question and maps взгляд/шаг", () => {
    const d = new Date("2026-06-30T00:00:00Z");
    const entries = toJournalEntries([
      { id: "a", cardDate: d, metadata: { userQuestion: "Почему меня задевает?", perspective: "взгляд", step: "шаг" } },
      { id: "b", cardDate: d, metadata: { perspective: "no question here" } },
      { id: "c", cardDate: d, metadata: null },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "a",
      question: "Почему меня задевает?",
      perspective: "взгляд",
      step: "шаг",
    });
  });

  it("tolerates a reflected card with no stored beats", () => {
    const entries = toJournalEntries([
      { id: "a", cardDate: new Date(), metadata: { userQuestion: "Q" } },
    ]);
    expect(entries[0]).toMatchObject({ question: "Q", perspective: null, step: null });
  });
});
