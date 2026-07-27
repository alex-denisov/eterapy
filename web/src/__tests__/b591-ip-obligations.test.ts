/**
 * B591 · Календарь обязанностей ИП — фаза 1.
 *
 * Владелец 2026-07-27: «у меня и так УЖЕ стоит УСН Доходы (6%), это даже есть
 * в ЕГРИП, поэтому продолжай работу». Гейт Definition of Ready снят: режим
 * подтверждён, и срочный пункт про уведомление в течение 30 дней закрыт.
 *
 * Что держат эти тесты — ровно два инварианта, нарушение которых стоит денег:
 *
 *  1. **Ни одна дата и ставка не зашита в код.** Налоговое законодательство РФ
 *     меняется; ставка в коде — это будущая ошибка в декларации. Каждая
 *     величина живёт как данные с датой начала действия.
 *  2. **Система не считает «налог к уплате».** Она считает оценку и обязана
 *     называть её оценкой. Решения принимает человек с лицензией.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  IP_REGISTERED_AT,
  TAX_RATES,
  buildObligationSchedule,
  estimateSetAside,
  obligationStatus,
} from "@/lib/ip-accounting";

const REF = new Date("2026-07-27T00:00:00Z");

describe("календарь обязанностей", () => {
  const schedule = buildObligationSchedule(2026, REF);

  it("содержит обязанности ИП на УСН «Доходы» без работников", () => {
    const keys = schedule.map((item) => item.key);
    expect(keys).toEqual(expect.arrayContaining([
      "fixed-contributions",
      "usn-advance-q3",
      "usn-declaration",
      "usn-tax-final",
      "contributions-1-percent",
    ]));
  });

  it("не содержит того, чего у ИП без работников не бывает", () => {
    const keys = schedule.map((item) => item.key);
    // Отчётность за работников, баланс и НДС в этот контур не входят.
    for (const absent of ["6-ndfl", "rsv", "balance-sheet", "nds-declaration"]) {
      expect(keys).not.toContain(absent);
    }
  });

  it("уведомление о переходе на УСН закрыто владельцем и не висит красным", () => {
    const usn = schedule.find((item) => item.key === "usn-notification");
    expect(usn?.state).toBe("done");
    expect(usn?.doneNote).toMatch(/ЕГРИП/);
  });

  it("каждая обязанность называет, кто её выполняет", () => {
    for (const item of schedule) {
      expect(["owner", "accountant", "platform"]).toContain(item.responsible);
    }
  });

  it("срок, выпавший на выходной, сдвигается на следующий рабочий день", () => {
    // 28.12.2025 — воскресенье. Это правило НК, а не косметика: пропущенный
    // из-за него день стоит пеней.
    const schedule2025 = buildObligationSchedule(2025, new Date("2025-01-01T00:00:00Z"));
    for (const item of schedule2025) {
      expect([0, 6]).not.toContain(item.dueAt.getUTCDay());
    }
  });

  it("статусы различают «сделано», «просрочено», «скоро» и «впереди»", () => {
    const due = new Date("2026-08-10T00:00:00Z");
    expect(obligationStatus(due, new Date("2026-08-20T00:00:00Z"), false)).toBe("overdue");
    expect(obligationStatus(due, new Date("2026-08-05T00:00:00Z"), false)).toBe("soon");
    expect(obligationStatus(due, new Date("2026-01-05T00:00:00Z"), false)).toBe("upcoming");
    expect(obligationStatus(due, new Date("2026-08-20T00:00:00Z"), true)).toBe("done");
  });
});

describe("ставки живут как данные с датой начала действия", () => {
  it("ни одна ставка не бессрочна и не безымянна", () => {
    for (const rate of TAX_RATES) {
      expect(rate.effectiveFrom).toBeInstanceOf(Date);
      expect(rate.source.length).toBeGreaterThan(0);
    }
  });

  it("действующая ставка УСН «Доходы» — 6 %", () => {
    const usn = TAX_RATES.filter((rate) => rate.key === "usn-income" && rate.effectiveFrom <= REF)
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
    expect(usn.value).toBe(0.06);
  });
});

describe("панель «сколько отложить» — оценка, а не расчёт", () => {
  it("считает 6 % и взносы, но помечает результат оценкой", () => {
    const estimate = estimateSetAside({ incomeRub: 1_000_000, year: 2026, at: REF });
    expect(estimate.isEstimate).toBe(true);
    expect(estimate.taxRub).toBe(60_000);
  });

  it("взносы 1 % считаются только с дохода свыше порога", () => {
    expect(estimateSetAside({ incomeRub: 200_000, year: 2026, at: REF }).surplusContributionRub).toBe(0);
    expect(estimateSetAside({ incomeRub: 500_000, year: 2026, at: REF }).surplusContributionRub).toBe(2_000);
  });

  it("фиксированные взносы за неполный год считаются пропорционально дате регистрации", () => {
    const estimate = estimateSetAside({ incomeRub: 0, year: 2026, at: REF });
    const full = estimateSetAside({ incomeRub: 0, year: 2027, at: new Date("2027-07-27T00:00:00Z") });
    // ИП зарегистрирован 20.07.2026 — за 2026 год взносов заметно меньше, чем
    // за полный 2027-й.
    expect(estimate.fixedContributionRub).toBeLessThan(full.fixedContributionRub);
    expect(estimate.fixedContributionRub).toBeGreaterThan(0);
    expect(IP_REGISTERED_AT.getUTCFullYear()).toBe(2026);
  });

  it("нулевой доход не рождает налога", () => {
    expect(estimateSetAside({ incomeRub: 0, year: 2026, at: REF }).taxRub).toBe(0);
  });
});

describe("экран учёта не выдаёт оценку за расчёт", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("оговорка стоит рядом с суммой, а не в подвале", () => {
    const page = read("src/app/admin/finance/accounting/page.tsx");
    expect(page).toContain('data-testid="accounting-estimate-disclaimer"');
    expect(page).toContain("estimate.disclaimer");
    expect(page).toContain("Отложить (оценка)");
  });

  it("ставки показаны с источником и датой начала действия", () => {
    const page = read("src/app/admin/finance/accounting/page.tsx");
    expect(page).toContain("TAX_RATES.map");
    expect(page).toContain("rate.source");
    expect(page).toContain("rate.effectiveFrom");
  });

  it("экран доступен только суперадмину и стоит в навигации", () => {
    const page = read("src/app/admin/finance/accounting/page.tsx");
    expect(page).toContain('session?.user?.role !== "SUPERADMIN"');
    expect(read("src/app/admin/admin-shell.tsx")).toContain("/admin/finance/accounting");
  });

  it("честно называет, чего в контуре ещё нет", () => {
    // Иначе владелец решит, что книга доходов уже есть, и не отправит вопрос
    // бухгалтеру, от которого зависит вся фаза 2.
    const page = read("src/app/admin/finance/accounting/page.tsx");
    expect(page).toContain("Книга доходов");
    expect(page).toContain("Сверка с чеками");
  });
});
