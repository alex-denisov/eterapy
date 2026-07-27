/**
 * B591 фаза 4 — годовой пакет и напоминания о сроках ИП.
 *
 * Проверяется арифметика пакета и выбор напоминаний. Отправка в Telegram здесь
 * не трогается намеренно: у неё нет своей логики, вся она — в этих двух чистых
 * частях.
 */
import { buildAnnualPackage } from "@/lib/ip-annual-package";
import type { IncomeBookEntry } from "@/lib/ip-income-book";
import {
  REMINDER_DAYS_BEFORE,
  daysUntilMsk,
  dueReminders,
  formatReminderMessage,
} from "@/lib/ip-obligation-reminders";
import type { Obligation } from "@/lib/ip-accounting";
import { buildObligationSchedule } from "@/lib/ip-accounting";
import { CRON_SCHEDULES } from "@/lib/cron-scheduler";
import { CRON_JOB_HANDLERS } from "@/lib/cron-jobs";

function entry(partial: Partial<IncomeBookEntry> & { recognizedAt: Date; turnoverKopecks: number }): IncomeBookEntry {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    recognizedAt: partial.recognizedAt,
    provider: partial.provider ?? "robokassa",
    subject: partial.subject ?? "credits",
    turnoverKopecks: partial.turnoverKopecks,
    commissionPercent: partial.commissionPercent ?? null,
    refunded: partial.refunded ?? false,
    refundedAt: partial.refundedAt ?? null,
    reference: partial.reference ?? "inv-1",
    receiptReference: partial.receiptReference ?? null,
    note: partial.note ?? null,
    recognition: partial.recognition ?? "own",
    // `??` здесь был бы ошибкой: явный null («доход посчитать нельзя»)
    // подменился бы оборотом, и тест проверял бы не то, что написано.
    ownIncomeKopecks: "ownIncomeKopecks" in partial ? partial.ownIncomeKopecks! : partial.turnoverKopecks,
    issue: partial.issue ?? null,
  } as IncomeBookEntry;
}

describe("B591 фаза 4 — годовой пакет", () => {
  it("раскладывает поступления по месяцам московской датой", () => {
    // 31 декабря 23:30 МСК — это 20:30 UTC того же дня. Обратный случай: 1
    // января 01:00 МСК = 31 декабря 22:00 UTC, и он обязан попасть в январь.
    const pkg = buildAnnualPackage([
      entry({ recognizedAt: new Date("2026-12-31T20:30:00Z"), turnoverKopecks: 100_00 }),
      entry({ recognizedAt: new Date("2026-12-31T22:00:00Z"), turnoverKopecks: 200_00 }),
    ], 2026);
    expect(pkg.months[11].turnoverKopecks).toBe(100_00);
    expect(pkg.months[0].turnoverKopecks).toBe(200_00);
  });

  it("возврат уменьшает месяц ДАТОЙ ВОЗВРАТА, а не датой платежа", () => {
    const pkg = buildAnnualPackage([
      entry({
        recognizedAt: new Date("2026-03-10T09:00:00Z"),
        turnoverKopecks: 1_000_00,
        refunded: true,
        refundedAt: new Date("2026-05-04T09:00:00Z"),
      }),
    ], 2026);
    expect(pkg.months[2].refundedOwnIncomeKopecks).toBe(0);
    expect(pkg.months[4].refundedOwnIncomeKopecks).toBe(1_000_00);
    // Возвращённая строка не даёт дохода ни в каком месяце.
    expect(pkg.totals.ownIncomeKopecks).toBe(0);
  });

  it("строка с нерешённым вопросом не считается нулевым доходом", () => {
    // Подставить ноль вместо «неизвестно» — значит молча занизить базу.
    const pkg = buildAnnualPackage([
      entry({ recognizedAt: new Date("2026-04-01T09:00:00Z"), turnoverKopecks: 500_00, ownIncomeKopecks: null, issue: "нет ставки комиссии" }),
      entry({ recognizedAt: new Date("2026-04-02T09:00:00Z"), turnoverKopecks: 500_00, ownIncomeKopecks: 500_00 }),
    ], 2026);
    expect(pkg.totals.turnoverKopecks).toBe(1_000_00);
    expect(pkg.totals.ownIncomeKopecks).toBe(500_00);
    expect(pkg.totals.ownIncomeSharePercent).toBe(50);
  });

  it("делит строки на «с чеком» и «без чека» — это разные листы пакета", () => {
    const pkg = buildAnnualPackage([
      entry({ recognizedAt: new Date("2026-07-26T09:00:00Z"), turnoverKopecks: 299_00, receiptReference: "RK-1" }),
      entry({ recognizedAt: new Date("2026-07-27T09:00:00Z"), turnoverKopecks: 299_00 }),
    ], 2026);
    expect(pkg.receipts).toHaveLength(1);
    expect(pkg.missingReceipts).toHaveLength(1);
    expect(pkg.totals.withReceipt).toBe(1);
  });

  it("пустой год даёт нули, а не NaN", () => {
    const pkg = buildAnnualPackage([], 2026);
    expect(pkg.totals.ownIncomeSharePercent).toBe(0);
    expect(pkg.months).toHaveLength(12);
    expect(pkg.subjects).toEqual([]);
  });

  it("разбивка по видам продаж сортируется по обороту", () => {
    const pkg = buildAnnualPackage([
      entry({ recognizedAt: new Date("2026-02-01T09:00:00Z"), turnoverKopecks: 100_00, subject: "credits" }),
      entry({ recognizedAt: new Date("2026-02-02T09:00:00Z"), turnoverKopecks: 900_00, subject: "subscription" }),
    ], 2026);
    expect(pkg.subjects[0].turnoverKopecks).toBe(900_00);
  });
});

describe("B591 фаза 4 — напоминания о сроках", () => {
  const base: Obligation = {
    key: "usn-q1",
    title: "Аванс по УСН за I квартал",
    recipient: "ФНС",
    dueAt: new Date(Date.UTC(2026, 3, 28)),
    responsible: "owner",
    note: "Пропуск — пени с первого дня.",
    state: "soon",
  };

  it("напоминает ровно за 10 и за 3 дня", () => {
    for (const days of REMINDER_DAYS_BEFORE) {
      const now = new Date(base.dueAt.getTime() - days * 86_400_000);
      expect(dueReminders([base], now).map((r) => r.daysLeft)).toEqual([days]);
    }
    const nine = new Date(base.dueAt.getTime() - 9 * 86_400_000);
    expect(dueReminders([base], nine)).toEqual([]);
  });

  it("считает календарные дни по МСК, а не 72 часа", () => {
    // Запуск в 23:30 МСК не должен превращать завтрашний срок в сегодняшний.
    const dueAt = new Date(Date.UTC(2026, 3, 28));
    const lateEvening = new Date("2026-04-25T20:30:00Z"); // 25 апреля 23:30 МСК
    expect(daysUntilMsk(dueAt, lateEvening)).toBe(3);
  });

  it("не напоминает о закрытом и о просроченном", () => {
    const now = new Date(base.dueAt.getTime() - 3 * 86_400_000);
    expect(dueReminders([{ ...base, state: "done" }], now)).toEqual([]);
    expect(dueReminders([{ ...base, state: "overdue" }], now)).toEqual([]);
  });

  it("текст называет ответственного — иначе читается как «сделай сам»", () => {
    const message = formatReminderMessage({ obligation: { ...base, responsible: "accountant" }, daysLeft: 10 });
    expect(message).toContain("Срок ИП через 10 дней");
    expect(message).toContain("делает бухгалтер");
    expect(message).toContain("Аванс по УСН за I квартал");
  });

  it("реальный календарь года даёт напоминания, а не пустоту", () => {
    // Защита от расписания, у которого все сроки в прошлом или закрыты
    // «навсегда»: тогда джоб был бы вечно молчащим и это выглядело бы нормой.
    const schedule = buildObligationSchedule(2026, new Date("2026-01-01T00:00:00Z"));
    const hits = schedule.flatMap((obligation) => {
      const now = new Date(obligation.dueAt.getTime() - 10 * 86_400_000);
      return dueReminders(schedule, now);
    });
    expect(hits.length).toBeGreaterThan(0);
  });

  it("джоб зарегистрирован в расписании и имеет обработчик", () => {
    const schedule = CRON_SCHEDULES.find((s) => s.type === "cron.ip-obligation-reminders");
    expect(schedule?.cadence).toBe("daily");
    // Не financial: под финансовым гейтом напоминания молчали бы.
    expect(schedule?.financial).toBeUndefined();
    expect(CRON_JOB_HANDLERS["cron.ip-obligation-reminders"]).toBeInstanceOf(Function);
  });
});
