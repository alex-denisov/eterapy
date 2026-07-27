/**
 * B591 · Бухгалтерский контур ИП — фаза 1: календарь обязанностей и оценка
 * «сколько отложить».
 *
 * ГРАНИЦА ОТВЕТСТВЕННОСТИ. Этот модуль не заменяет бухгалтера и не считает
 * налог к уплате. Он делает две вещи: не даёт пропустить дату и показывает
 * порядок суммы, чтобы деньги не оказались потрачены. Всё, что он выдаёт, —
 * оценка; декларацию сдаёт Альфа-бухгалтерия по этим же данным.
 *
 * Владелец 2026-07-27: «у меня и так УЖЕ стоит УСН Доходы (6%), это даже есть
 * в ЕГРИП» — режим подтверждён, срочный пункт про уведомление закрыт.
 *
 * ⚠ Ставки и пороги живут ЗДЕСЬ КАК ДАННЫЕ с датой начала действия, а не как
 *   числа внутри формул. Налоговое законодательство меняется; ставка,
 *   вписанная в выражение, — это будущая ошибка в декларации, которую никто
 *   не заметит до апреля.
 */

/** Дата регистрации ИП — из ЕГРИП. От неё считается неполный первый год. */
export const IP_REGISTERED_AT = new Date(Date.UTC(2026, 6, 20));

export interface TaxRate {
  key: "usn-income" | "fixed-contributions" | "surplus-threshold" | "surplus-rate";
  /** Доля (0.06) либо сумма в рублях — по смыслу ключа. */
  value: number;
  effectiveFrom: Date;
  /** Откуда взято. Без источника величину нельзя перепроверить. */
  source: string;
}

export const TAX_RATES: readonly TaxRate[] = [
  {
    key: "usn-income",
    value: 0.06,
    effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
    source: "УСН «Доходы», базовая ставка НК РФ гл. 26.2 — подтвердить у бухгалтера",
  },
  {
    key: "fixed-contributions",
    value: 53_658,
    effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
    source: "фиксированные взносы ИП за полный 2026 год — подтвердить у бухгалтера",
  },
  {
    key: "surplus-threshold",
    value: 300_000,
    effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
    source: "порог дохода для взносов 1 % — подтвердить у бухгалтера",
  },
  {
    key: "surplus-rate",
    value: 0.01,
    effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
    source: "взносы 1 % с дохода свыше порога — подтвердить у бухгалтера",
  },
];

export function rateAt(key: TaxRate["key"], at: Date): number {
  const applicable = TAX_RATES
    .filter((rate) => rate.key === key && rate.effectiveFrom <= at)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
  if (!applicable) throw new Error(`Нет действующей величины «${key}» на ${at.toISOString()}`);
  return applicable.value;
}

export type ObligationState = "done" | "overdue" | "soon" | "upcoming";
export type ObligationResponsible = "owner" | "accountant" | "platform";

export interface Obligation {
  key: string;
  title: string;
  /** Кому сдаётся или платится. */
  recipient: string;
  dueAt: Date;
  responsible: ObligationResponsible;
  /** Зачем это нужно и что будет, если пропустить. */
  note: string;
  state: ObligationState;
  /** Заполняется только у закрытых пунктов. */
  doneNote?: string;
}

/** Срок, попавший на выходной, сдвигается на следующий рабочий день (НК РФ). */
function nextBusinessDay(date: Date): Date {
  const shifted = new Date(date.getTime());
  while (shifted.getUTCDay() === 0 || shifted.getUTCDay() === 6) {
    shifted.setUTCDate(shifted.getUTCDate() + 1);
  }
  return shifted;
}

const SOON_DAYS = 30;

export function obligationStatus(dueAt: Date, at: Date, done: boolean): ObligationState {
  if (done) return "done";
  if (at.getTime() > dueAt.getTime()) return "overdue";
  const daysLeft = (dueAt.getTime() - at.getTime()) / 86_400_000;
  return daysLeft <= SOON_DAYS ? "soon" : "upcoming";
}

interface ObligationSeed {
  key: string;
  title: string;
  recipient: string;
  /** Срок как (год, месяц, день) относительно налогового года. */
  due: (year: number) => Date;
  responsible: ObligationResponsible;
  note: string;
  /** Пункты, закрытые владельцем раз и навсегда. */
  doneNote?: string;
}

/**
 * Обязанности ИП на УСН «Доходы» БЕЗ РАБОТНИКОВ.
 *
 * Чего здесь нет и почему: отчётности за работников (их нет), бухгалтерского
 * баланса (ИП его не ведёт), деклараций по НДС.
 */
const OBLIGATION_SEEDS: readonly ObligationSeed[] = [
  {
    key: "usn-notification",
    title: "Уведомление о переходе на УСН",
    recipient: "ФНС",
    due: () => new Date(Date.UTC(2026, 7, 19)),
    responsible: "owner",
    note: "Окно — 30 дней с регистрации. На ОСНО агентская экономика платформы не работает.",
    doneNote: "Закрыто владельцем 27.07.2026: УСН «Доходы» 6 % действует и отражён в ЕГРИП.",
  },
  {
    key: "fixed-contributions",
    title: "Фиксированные страховые взносы",
    recipient: "ФНС",
    due: (year) => new Date(Date.UTC(year, 11, 31)),
    responsible: "owner",
    note: "За первый неполный год считаются пропорционально дате регистрации.",
  },
  {
    key: "usn-advance-q3",
    title: "Авансовый платёж по УСН за 9 месяцев",
    recipient: "ФНС",
    due: (year) => new Date(Date.UTC(year, 9, 28)),
    responsible: "accountant",
    note: "Считает Альфа по выручке платформы. Данные даёт книга доходов (фаза 2).",
  },
  {
    key: "usn-declaration",
    title: "Декларация по УСН",
    recipient: "ФНС",
    due: (year) => new Date(Date.UTC(year + 1, 3, 25)),
    responsible: "accountant",
    note: "Сдаёт Альфа. От платформы нужен годовой пакет: доходы по месяцам, чеки, возвраты.",
  },
  {
    key: "usn-tax-final",
    title: "Налог по УСН за год (итог)",
    recipient: "ФНС",
    due: (year) => new Date(Date.UTC(year + 1, 3, 28)),
    responsible: "owner",
    note: "Платится после декларации. Оценка суммы — в панели «сколько отложить».",
  },
  {
    key: "contributions-1-percent",
    title: "Взносы 1 % с дохода свыше порога",
    recipient: "ФНС",
    due: (year) => new Date(Date.UTC(year + 1, 6, 1)),
    responsible: "owner",
    note: "Возникают только если годовой доход превысил порог.",
  },
  {
    key: "kudir",
    title: "КУДиР за год",
    recipient: "не сдаётся, предъявляется по запросу",
    due: (year) => new Date(Date.UTC(year, 11, 31)),
    responsible: "accountant",
    note: "Ведётся весь год. Источник строк — книга доходов платформы (фаза 2).",
  },
];

export function buildObligationSchedule(year: number, at: Date, doneKeys: readonly string[] = []): Obligation[] {
  return OBLIGATION_SEEDS
    .map((seed) => {
      const dueAt = nextBusinessDay(seed.due(year));
      const done = Boolean(seed.doneNote) || doneKeys.includes(seed.key);
      return {
        key: seed.key,
        title: seed.title,
        recipient: seed.recipient,
        dueAt,
        responsible: seed.responsible,
        note: seed.note,
        state: obligationStatus(dueAt, at, done),
        ...(seed.doneNote ? { doneNote: seed.doneNote } : {}),
      } satisfies Obligation;
    })
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export interface SetAsideEstimate {
  taxRub: number;
  fixedContributionRub: number;
  surplusContributionRub: number;
  totalRub: number;
  /** Всегда `true`. Поле существует, чтобы интерфейс не смог забыть оговорку. */
  isEstimate: true;
  disclaimer: string;
}

/**
 * Порядок суммы, которую стоит держать в стороне. НЕ расчёт налога:
 * не учитывает вычет взносов из налога, авансы, убытки и всё, что знает
 * бухгалтер. Ради этого поле `isEstimate` не опционально.
 */
export function estimateSetAside(input: { incomeRub: number; year: number; at: Date }): SetAsideEstimate {
  const income = Math.max(0, input.incomeRub);
  const taxRub = Math.round(income * rateAt("usn-income", input.at));

  // Первый год неполный: взносы считаются со дня регистрации до конца года.
  const yearStart = Date.UTC(input.year, 0, 1);
  const yearEnd = Date.UTC(input.year + 1, 0, 1);
  const from = Math.max(yearStart, IP_REGISTERED_AT.getTime());
  const activeShare = Math.max(0, Math.min(1, (yearEnd - from) / (yearEnd - yearStart)));
  const fixedContributionRub = Math.round(rateAt("fixed-contributions", input.at) * activeShare);

  const threshold = rateAt("surplus-threshold", input.at);
  const surplusContributionRub = income > threshold
    ? Math.round((income - threshold) * rateAt("surplus-rate", input.at))
    : 0;

  return {
    taxRub,
    fixedContributionRub,
    surplusContributionRub,
    totalRub: taxRub + fixedContributionRub + surplusContributionRub,
    isEstimate: true,
    disclaimer:
      "Оценка, а не расчёт налога: не учтён вычет взносов, авансовые платежи и всё, "
      + "что знает бухгалтер. Итоговую сумму считает Альфа.",
  };
}
