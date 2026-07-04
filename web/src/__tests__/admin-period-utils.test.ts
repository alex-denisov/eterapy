import {
  ADMIN_PLATFORM_FIRST_DEPLOY_ISO,
  adminClampIsoToPlatformRange,
  adminMonthDays,
  adminPeriodFromRuDate,
  adminPeriodToIsoDate,
  adminPeriodToRuDate,
  adminPlatformWeekInputMax,
  adminPlatformWeekInputMin,
  adminPresetRange,
  adminQuarterOptions,
  adminRangeFromQuarterInput,
  adminRangeFromWeekInput,
  adminTodayIso,
} from "@/app/admin/admin-period-utils";

describe("admin period date utilities", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 4, 12, 0, 0));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

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

  it("exposes an all-time preset for superadmin analytics", () => {
    const allTime = adminPresetRange("all");

    expect(ADMIN_PLATFORM_FIRST_DEPLOY_ISO).toBe("2026-04-03");
    expect(allTime.start).toBe(ADMIN_PLATFORM_FIRST_DEPLOY_ISO);
    expect(allTime.start).not.toBe("2020-01-01");
    expect(allTime.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("disables calendar days before platform launch and after today", () => {
    const april = adminMonthDays("2026-04-01");
    const july = adminMonthDays("2026-07-01");

    expect(april.find((day) => day.iso === "2026-04-02")).toMatchObject({ disabled: true });
    expect(april.find((day) => day.iso === ADMIN_PLATFORM_FIRST_DEPLOY_ISO)).toMatchObject({ disabled: false });
    expect(july.find((day) => day.iso === "2026-07-04")).toMatchObject({ disabled: false });
    expect(july.find((day) => day.iso === "2026-07-05")).toMatchObject({ disabled: true });
  });

  it("limits week and quarter selectors to the real platform lifetime", () => {
    expect(adminTodayIso()).toBe("2026-07-04");
    expect(adminClampIsoToPlatformRange("2020-01-01")).toBe(ADMIN_PLATFORM_FIRST_DEPLOY_ISO);
    expect(adminClampIsoToPlatformRange("2029-01-01")).toBe("2026-07-04");
    expect(adminPlatformWeekInputMin()).toBe("2026-W14");
    expect(adminPlatformWeekInputMax()).toBe("2026-W27");

    expect(adminRangeFromWeekInput("2026-W14")).toEqual({
      start: ADMIN_PLATFORM_FIRST_DEPLOY_ISO,
      end: "2026-04-05",
    });
    expect(adminRangeFromQuarterInput("2026-Q2")).toEqual({
      start: ADMIN_PLATFORM_FIRST_DEPLOY_ISO,
      end: "2026-06-30",
    });
    expect(adminRangeFromQuarterInput("2026-Q3")).toEqual({
      start: "2026-07-01",
      end: "2026-07-04",
    });
    expect(adminQuarterOptions()).toEqual([
      { value: "2026-Q2", label: "2026 · 2 квартал" },
      { value: "2026-Q3", label: "2026 · 3 квартал" },
    ]);
  });
});
