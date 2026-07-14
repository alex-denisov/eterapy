import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const CAL = "src/app/cabinet/practitioner/calendar";

// B466 R9-5 desktop — «Календарь → Расписание» недельная сетка по approved
// -calendar-v2 (owner ROUND 4 #2): 7 колонок дней + гуттер часов, навигация
// неделями через ?week=, «Сегодня» и «Выбрать дату». Мобайл-список не тронут.

describe("R9-5 desktop calendar — page wires the week-grid for schedule", () => {
  const page = () => source(`${CAL}/page.tsx`);

  it("renders WeekGrid on the schedule tab and parses ?week=", () => {
    const src = page();
    expect(src).toContain("<WeekGrid");
    expect(src).toContain("normalizeWeekParam");
    expect(src).toContain("mskMondayISO");
    expect(src).toContain("weekStartISO");
    // мобильный список и десктоп-testid сохранены
    expect(src).toContain("CalendarScheduleMobile");
    expect(src).toContain('data-testid="practitioner-calendar-page"');
    // старый десктоп-список Расписания больше не рендерится
    expect(src).not.toContain("<ScheduleTab");
  });
});

describe("R9-5 desktop calendar — week-grid structure", () => {
  const grid = () => source(`${CAL}/week-grid.tsx`);

  it("is a 7-day grid with an hour gutter (52px + repeat(7))", () => {
    const src = grid();
    expect(src).toContain("52px repeat(7, minmax(0, 1fr))");
    expect(src).toContain('data-testid="calendar-week-grid"');
    expect(src).toContain('data-testid="practitioner-calendar-schedule"'); // тот же testid, что был у списка
  });

  it("has week navigation (prev/next/today via ?week=) + range + Записать", () => {
    const src = grid();
    expect(src).toContain("?tab=schedule&week=");
    expect(src).toContain('data-testid="calendar-week-range"');
    expect(src).toContain("Сегодня");
    expect(src).toContain('data-testid="practitioner-propose-cta"'); // «Записать» сохранён
    expect(src).toContain("<WeekDatePicker");
  });

  it("colors appointments by status and links to the booking detail", () => {
    const src = grid();
    expect(src).toContain('data-testid="calendar-week-appt"');
    expect(src).toContain("/practitioner/calendar/booking/");
    for (const st of ["COMPLETED", "IN_PROGRESS", "CONFIRMED"]) expect(src).toContain(st);
    // диапазон часов из активных рабочих часов (не хардкод 4 ряда)
    expect(src).toContain("scheduleRule.findMany");
  });

  it("computes the week in MSK and is timezone-safe", () => {
    const src = grid();
    expect(src).toContain("Europe/Moscow");
    expect(src).toContain("isoWeekdayMon0");
    expect(src).toContain("export function mskMondayISO");
    expect(src).toContain("export function normalizeWeekParam");
  });
});

describe("R9-5 desktop calendar — date picker navigates to the containing week", () => {
  it("native date-picker pushes ?week=<monday>", () => {
    const src = source(`${CAL}/week-date-picker.tsx`);
    expect(src).toContain('type="date"');
    expect(src).toContain("mondayOf");
    expect(src).toContain("?tab=schedule&week=");
    expect(src).toContain('data-testid="calendar-week-datepicker"');
  });
});
