import {
  adminMonthDays,
  adminPeriodFromRuDate,
  adminPeriodToIsoDate,
  adminPeriodToRuDate,
} from "@/app/admin/admin-period-utils";

describe("admin period date utilities", () => {
  it("keeps Russian calendar input on the exact selected local date", () => {
    expect(adminPeriodFromRuDate("02.06.2026")).toBe("2026-06-02");
    expect(adminPeriodToRuDate("2026-06-02")).toBe("02.06.2026");
    expect(adminPeriodToIsoDate(new Date(2026, 5, 2, 0, 0, 0))).toBe("2026-06-02");
  });

  it("only appends the next-month days needed to finish the last week", () => {
    const june = adminMonthDays("2026-06-01");

    expect(june[0]).toMatchObject({ iso: "2026-06-01", current: true });
    expect(june.at(-1)).toMatchObject({ iso: "2026-07-05", current: false });
    expect(june).toHaveLength(35);
  });

  it("keeps only previous-month leading days needed to complete the first week", () => {
    const august = adminMonthDays("2026-08-01");

    expect(august.slice(0, 5).map((day) => day.iso)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
    ]);
    expect(august.at(-1)).toMatchObject({ iso: "2026-09-06", current: false });
  });
});
