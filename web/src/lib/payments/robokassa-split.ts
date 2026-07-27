/**
 * B583 — модель расчётов со специалистом под ограничения Robokassa.
 *
 * ОТВЕТ ПОДДЕРЖКИ ROBOKASSA (владелец передал 2026-07-27) — источник истины
 * этого модуля, дословно по смыслу:
 *
 *   1. Сплитование платежа **поддерживается**, «по предварительному
 *      согласованию» (docs.robokassa.ru/ru/split-payments).
 *   2. «Массовые выплаты» — выплаты по реквизитам продавцам/агентам — **не
 *      реализованы** в Robokassa вовсе.
 *   3. Потолок холдирования — **7 суток**, подтверждено.
 *   4. **Совмещать холдирование и сплитование нельзя.**
 *   5. Для интеграции используется **идентификатор магазина** получателя
 *      («Мои магазины → Настройка»), а не ID аккаунта из шапки кабинета.
 *   6. При возврате средства списываются **с баланса магазина, в зависимости
 *      от доли возврата** — то есть возврат после сплита провайдер разносит
 *      сам, пропорционально долям.
 *   7. При сплите с «Робочеками» чек пробивает **Robokassa как платёжный
 *      агент**.
 *
 * ЧТО ЭТО ЛОМАЕТ. Решение владельца от 2026-07-26 звучало как «сплитовать
 * сразу, но холдировать до конца окна диспута». Пункт 4 говорит, что такой
 * конструкции нет: рельс либо со сплитом, либо с холдом. Поэтому здесь описаны
 * ТРИ рельса и правило выбора между ними — вместо прежней одной схемы.
 *
 * ЧТО ЭТО ОТКРЫВАЕТ. Пункт 6 снимает главную плату прежней модели: возврат
 * после сплита больше не «своими деньгами» — доля специалиста списывается с
 * его магазина провайдером. Значит рельс «сплит без холда» не требует ни
 * резерва, ни удержания, ни потолка в семь суток: **горизонт брони на нём не
 * ограничен вовсе**.
 *
 * ЧТО ОСТАЁТСЯ ЗАКРЫТЫМ. Пункт 2 закрывает автоматические выплаты по
 * реквизитам НАВСЕГДА на этом эквайринге — не «до получения контракта».
 * Единственный автоматический путь денег специалисту — сплит в момент оплаты.
 * Само движение денег здесь по-прежнему не исполняется: сплит требует
 * предварительного согласования с Robokassa (действие владельца), а провайдер
 * выплат продолжает падать закрыто (B562, шаг 2).
 */

import { SESSION_DISPUTE_WINDOW_HOURS } from "@/lib/session-dispute-window";

/** Потолок холдирования у Robokassa (подтверждён поддержкой 2026-07-27). */
export const ROBOKASSA_HOLD_MAX_DAYS = 7;

/**
 * Холд и сплит взаимоисключающи (ответ поддержки, п. 4).
 *
 * Константа существует, чтобы это ограничение нельзя было забыть при чтении
 * кода: любая ветка, которая одновременно ставит холд и разносит доли, — это
 * не оптимизация, а рельс, которого у провайдера нет.
 */
export const SPLIT_AND_HOLD_ARE_EXCLUSIVE = true;

/** Выплаты по реквизитам («массовые выплаты») у Robokassa не существуют. */
export const ROBOKASSA_HAS_MASS_PAYOUTS = false;

/** Дата ответа поддержки, на котором стоит эта модель. */
export const SPLIT_CONTRACT_ANSWER_DATE = "2026-07-27";

/**
 * Рельсы расчёта. Их ровно три, и выбор между ними — не вкус, а следствие
 * ограничений провайдера.
 *
 * • `split_no_hold` — деньги делятся В МОМЕНТ оплаты: доля платформы на её
 *   магазин, доля специалиста на его. Холда нет, поэтому горизонт брони не
 *   ограничен. Возврат внутри окна диспута делается возвратом платежа, и
 *   провайдер списывает доли пропорционально (п. 6).
 * • `hold_no_split` — деньги замораживаются целиком у клиента и снимаются
 *   после сессии. Сплита нет, значит доля специалиста уходит ВРУЧНУЮ: массовых
 *   выплат у Robokassa нет. Горизонт брони — потолок холда минус длительность
 *   сессии.
 * • `manual_prepay` — прежний путь: полная оплата вперёд платформе, выплата
 *   записью `Payout` и ручным переводом. Работает всегда и ни от чего не
 *   зависит.
 */
export type SettlementRail = "split_no_hold" | "hold_no_split" | "manual_prepay";

export type SettlementRailReason =
  | "split_not_agreed_with_provider"
  | "practitioner_not_split_ready"
  | "hold_and_split_are_exclusive"
  | "hold_horizon_exceeded";

export interface SettlementRailInput {
  /** Сплит согласован с Robokassa («по предварительному согласованию»). */
  splitAgreedWithProvider: boolean;
  /** Специалист готов принимать долю — см. `evaluateSplitReadiness`. */
  practitionerSplitReady: boolean;
  /** Нужен ли холд, то есть просят ли снимать деньги не в момент оплаты. */
  wantsHold: boolean;
  /** Умещается ли бронь в потолок холда (только для рельса с холдом). */
  holdCoversBooking?: boolean;
}

export interface SettlementRailDecision {
  rail: SettlementRail;
  /** Почему не выбран сплит-рельс — по порядку, все причины сразу. */
  reasons: SettlementRailReason[];
}

/**
 * Выбор рельса. Сплит имеет приоритет: он единственный доводит деньги до
 * специалиста автоматически.
 *
 * Просьба о холде вместе со сплитом не «уточняет» рельс, а меняет его: раз
 * совмещать нельзя, выбор холда означает отказ от автоматической выплаты.
 * Поэтому причина `hold_and_split_are_exclusive` возвращается явно — чтобы
 * администратор видел цену своего выбора, а не молчаливую подмену.
 */
export function resolveSettlementRail(input: SettlementRailInput): SettlementRailDecision {
  const reasons: SettlementRailReason[] = [];
  if (!input.splitAgreedWithProvider) reasons.push("split_not_agreed_with_provider");
  if (!input.practitionerSplitReady) reasons.push("practitioner_not_split_ready");
  if (input.wantsHold) reasons.push("hold_and_split_are_exclusive");

  if (reasons.length === 0) return { rail: "split_no_hold", reasons };

  if (input.wantsHold) {
    if (input.holdCoversBooking === false) {
      return { rail: "manual_prepay", reasons: [...reasons, "hold_horizon_exceeded"] };
    }
    return { rail: "hold_no_split", reasons };
  }

  return { rail: "manual_prepay", reasons };
}

export const SETTLEMENT_RAIL_LABELS: Record<SettlementRail, string> = {
  split_no_hold: "Сплит в момент оплаты · выплата автоматическая",
  hold_no_split: "Холд без сплита · выплата вручную",
  manual_prepay: "Оплата вперёд платформе · выплата вручную",
};

export const SETTLEMENT_RAIL_REASON_LABELS: Record<SettlementRailReason, string> = {
  split_not_agreed_with_provider: "Сплит не согласован с Robokassa",
  practitioner_not_split_ready: "Специалист не готов принимать долю сплитом",
  hold_and_split_are_exclusive: "Robokassa не совмещает холдирование и сплит",
  hold_horizon_exceeded: "Бронь дальше потолка холда — семи суток",
};

export interface SplitReadinessInput {
  /** Идентификатор МАГАЗИНА Robokassa специалиста («Мои магазины → Настройка»). */
  robokassaAccount?: string | null;
  /** Налоговый статус подтверждён — без него нельзя пробить чек и отчитаться. */
  taxVerified: boolean;
  /** Профиль специалиста активен (не на модерации, не заблокирован). */
  practitionerActive: boolean;
}

export type SplitReadinessReason =
  | "no_robokassa_account"
  | "tax_not_verified"
  | "practitioner_inactive";

export interface SplitReadiness {
  ready: boolean;
  reasons: SplitReadinessReason[];
}

export const SPLIT_READINESS_LABELS: Record<SplitReadinessReason, string> = {
  no_robokassa_account: "Не указан идентификатор магазина Robokassa — сплит адресовать некуда",
  tax_not_verified: "Налоговый статус не подтверждён",
  practitioner_inactive: "Профиль специалиста неактивен",
};

/**
 * Нормализация идентификатора магазина Robokassa.
 *
 * Поддержка уточнила, ЧТО это за идентификатор (магазин, раздел «Мои магазины →
 * Настройка»), но не его формат. Поэтому проверка остаётся намеренно
 * консервативной: латиница/цифры/`-`/`_`/`.`, длина 3–64. Придумывать более
 * строгий формат по догадке нельзя — отвергнутый валидный идентификатор стоит
 * специалисту выплаты.
 */
export function normalizeRobokassaAccount(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(trimmed)) return null;
  return trimmed;
}

export function evaluateSplitReadiness(input: SplitReadinessInput): SplitReadiness {
  const reasons: SplitReadinessReason[] = [];
  if (!normalizeRobokassaAccount(input.robokassaAccount)) reasons.push("no_robokassa_account");
  if (!input.taxVerified) reasons.push("tax_not_verified");
  if (!input.practitionerActive) reasons.push("practitioner_inactive");
  return { ready: reasons.length === 0, reasons };
}

/**
 * Покрывает ли холд бронь — вопрос ТОЛЬКО рельса `hold_no_split`.
 *
 * Прежняя версия считала от конца окна диспута: по замыслу владельца возврат
 * делался неснятием холда, значит окно диспута обязано было уместиться внутрь
 * семи суток. Этой конструкции не существует — холд и сплит несовместимы.
 * На рельсе с холдом доля специалиста остаётся у платформы и удерживается
 * прежним механизмом (`Payout.availableAt`, окно диспута, резерв), поэтому
 * холду достаточно дожить до КОНЦА СЕССИИ, а не до конца спора.
 *
 * Окно диспута здесь всё равно участвует — но как проверка, что удержание
 * после снятия холда вообще возможно: если сессия уже прошла, удерживать
 * нечего.
 */
export function holdRailCoversBooking(
  paidAt: Date,
  sessionStartsAt: Date,
  sessionDurationMin = 60,
): boolean {
  if (sessionStartsAt.getTime() < paidAt.getTime()) return false;
  const sessionEndsAt = sessionStartsAt.getTime() + sessionDurationMin * 60_000;
  const days = (sessionEndsAt - paidAt.getTime()) / 86_400_000;
  return days <= ROBOKASSA_HOLD_MAX_DAYS;
}

/**
 * Крайняя дата сессии, которую ещё покрывает холд, — то, что нужно показывать
 * при выборе слота на рельсе `hold_no_split`. На сплит-рельсе горизонт не
 * ограничен, и звать эту функцию там не нужно.
 */
export function latestSessionStartCoveredByHoldRail(paidAt: Date, sessionDurationMin = 60): Date {
  const budgetMs = ROBOKASSA_HOLD_MAX_DAYS * 86_400_000 - sessionDurationMin * 60_000;
  return new Date(paidAt.getTime() + budgetMs);
}

/**
 * Момент, до которого возврат клиенту бесплатен для платформы на сплит-рельсе:
 * пока открыто окно диспута, возврат делается возвратом платежа, а провайдер
 * списывает доли пропорционально с обоих магазинов (п. 6 ответа поддержки).
 * После него взыскание доли специалиста — уже наша работа.
 */
export function splitRefundWindowEndsAt(sessionEndsAt: Date): Date {
  return new Date(sessionEndsAt.getTime() + SESSION_DISPUTE_WINDOW_HOURS * 3_600_000);
}

export interface SplitParty {
  /** Кто получает долю: `platform` или идентификатор магазина специалиста. */
  key: string;
  /** Доля этой стороны в исходном платеже, копейки. */
  shareKopecks: number;
}

export interface SplitRefundDebit {
  key: string;
  debitKopecks: number;
}

/**
 * Разнос возврата по сторонам сплита — «в зависимости от доли возврата»
 * (ответ поддержки, п. 6).
 *
 * Считает то же, что провайдер, чтобы наша статистика сходилась с его
 * списаниями: частичный возврат бьёт по обеим сторонам пропорционально, а не
 * только по платформе.
 *
 * Остаток от округления берёт на себя ПЛАТФОРМА (первая сторона по величине
 * доли). Причина простая: сумма списаний обязана в точности равняться сумме
 * возврата, а «недостающая копейка» на специалисте — это спор о копейке с
 * человеком, который её не выбирал.
 */
export function computeSplitRefundDebits(
  parties: readonly SplitParty[],
  refundKopecks: number,
): SplitRefundDebit[] {
  const total = parties.reduce((sum, p) => sum + p.shareKopecks, 0);
  if (total <= 0 || refundKopecks <= 0) return parties.map((p) => ({ key: p.key, debitKopecks: 0 }));

  const capped = Math.min(refundKopecks, total);
  const debits = parties.map((p) => ({
    key: p.key,
    debitKopecks: Math.floor((capped * p.shareKopecks) / total),
  }));

  const remainder = capped - debits.reduce((sum, d) => sum + d.debitKopecks, 0);
  if (remainder > 0) {
    const biggest = parties.reduce(
      (best, p, i) => (p.shareKopecks > parties[best].shareKopecks ? i : best),
      0,
    );
    debits[biggest] = { ...debits[biggest], debitKopecks: debits[biggest].debitKopecks + remainder };
  }
  return debits;
}
