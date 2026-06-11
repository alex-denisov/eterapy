import { pointsWord, formatPoints } from "@/lib/points";

describe("B365 pointsWord — склонение «балл»", () => {
  it.each([
    [1, "балл"],
    [21, "балл"],
    [101, "балл"],
    [2, "балла"],
    [3, "балла"],
    [4, "балла"],
    [22, "балла"],
    [5, "баллов"],
    [10, "баллов"],
    [11, "баллов"],
    [12, "баллов"],
    [14, "баллов"],
    [25, "баллов"],
    [111, "баллов"],
    [0, "баллов"],
  ])("pointsWord(%i) → %s", (n, expected) => {
    expect(pointsWord(n)).toBe(expected);
  });

  it("handles negative amounts by absolute value", () => {
    expect(pointsWord(-1)).toBe("балл");
    expect(pointsWord(-2)).toBe("балла");
    expect(pointsWord(-5)).toBe("баллов");
  });

  it("formatPoints joins number and word", () => {
    expect(formatPoints(1)).toBe("1 балл");
    expect(formatPoints(2)).toBe("2 балла");
    expect(formatPoints(12)).toBe("12 баллов");
  });
});
