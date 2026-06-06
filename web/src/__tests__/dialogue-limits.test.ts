import {
  ABUSE_CAP_NEW_DIALOGUES_PER_DAY,
  getDialogueDailyLimit,
  type DialogueAudience,
} from "@/lib/dialogue-limits";

describe("Y10 Z8 dialogue daily limits", () => {
  it("keeps the standalone dialogue ladder monotonic from guest to paid plans", () => {
    const ladder: DialogueAudience[] = ["guest", "free", "plus", "premium"];
    const score = (audience: DialogueAudience) => getDialogueDailyLimit(audience) ?? Number.POSITIVE_INFINITY;

    for (let index = 0; index < ladder.length - 1; index += 1) {
      expect(score(ladder[index])).toBeLessThanOrEqual(score(ladder[index + 1]));
    }

    expect(getDialogueDailyLimit("guest")).toBe(1);
    expect(getDialogueDailyLimit("free")).toBe(3);
    expect(getDialogueDailyLimit("plus")).toBeNull();
    expect(getDialogueDailyLimit("premium")).toBeNull();
    expect(ABUSE_CAP_NEW_DIALOGUES_PER_DAY).toBe(20);
  });
});
