/**
 * B705 — сторож очереди публикаций.
 *
 * Замер прода 2026-08-12 нашёл четыре разных способа, которыми строка реестра
 * перестаёт двигаться и при этом никому не жалуется:
 *
 * 1. **Пустая плановая дата.** 13 строк с `scheduled_for IS NULL`, старейшая от
 *    28.07. Такая строка не «срочная» — она БЕЗ СРОКА, но `dueNowFilter`
 *    считает её готовой к работе всегда, и она занимает место в каждом проходе.
 * 2. **Залипшая премодерация.** Ответ человеку от 01.08 ждёт кнопки владельца
 *    11 суток. Ответ на приветствие, отправленный через одиннадцать дней, —
 *    это не ответ.
 * 3. **Строки вне действующего плана.** После §19 темп площадок изменился, и
 *    сотня черновиков стоит на слотах, которых в плане больше нет. Пустая
 *    оболочка без текста не стоит ничего, а вот написанный материал стоит
 *    круга автора и редактора — его надо ПЕРЕНЕСТИ, а не выбросить.
 * 4. **Выпущенное с будущей датой.** Ручные дозаписи Дзена: `published_at` в
 *    прошлом, `scheduled_for` в будущем. Слот выглядит занятым завтрашним
 *    выпуском, которого не будет.
 *
 * Требование владельца 2026-08-12 дословно: «перепланируй все материалы,
 * которые сильно за рамками контент-плана на более ранний период, если они
 * готовы и утверждены или просто подготовлены, таким образом чтобы пул
 * черновиков был полным и редактор дальше мог свободно работать».
 *
 * Решение считается ЧИСТОЙ ФУНКЦИЕЙ (`planQueueHygiene`), а запись отделена
 * (`applyQueueHygiene`). Причина та же, что у `conveyorTact`: правило, живущее
 * внутри цикла с базой, проверяется только на проде.
 */

import db from "@/lib/db";
import { log } from "@/lib/logger";
import { PLAN_HORIZON_DAYS, type ContentPlanSlot, type PlanChannel } from "@/lib/marketing/content-plan";

/** Строки, которые ещё могут поехать. Остальное сторож не трогает. */
const LIVE_STATUSES = ["DRAFT", "REVIEW", "SCHEDULED", "MANUAL"] as const;

/** Утверждённое: такое переносим, а не снимаем. */
const APPROVED_STATUSES = ["SCHEDULED", "MANUAL"] as const;

/**
 * Сколько ждёт кнопки владельца ответ живому человеку.
 *
 * Двое суток — не техническая величина, а свойство разговора: реплика в ленте
 * живёт часы. Материал при этом НЕ считается браком (`ARCHIVED`, а не
 * `FAILED`): виновата не редактура, а простоявшая очередь.
 */
export const PREMODERATION_STALE_MS = 48 * 60 * 60_000;

/**
 * B713 §6 — с какой просрочки плановая дата считается мёртвой.
 *
 * Двое суток. Внутри суток закрывшееся окно — работа переноса B645, и отбирать
 * у него материал сторожем значило бы лечить здоровых. Всё, что старше, до
 * переноса уже не дошло, и опрашивать его каждый проход бессмысленно.
 */
export const STALE_SCHEDULE_MS = 48 * 60 * 60_000;

export interface QueueRow {
  id: string;
  platform: string;
  status: string;
  contentType: string | null;
  scheduledFor: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  planSlot: string | null;
  /** Есть ли на складе написанный автором текст (B700 фаза 1). */
  hasDraftText: boolean;
  telegramReviewMessageId: number | null;
  moderationDecisionAt: Date | null;
}

export type QueueHygieneAction =
  | { kind: "schedule"; id: string; scheduledFor: Date; planSlot: string; reason: string }
  /**
   * B713 §4a — `releaseSlot` отпускает `planSlot` вместе со снятием.
   *
   * Ставится ТОЛЬКО когда строку снимают за отсутствие слота в плане: такая
   * строка никогда не была законным владельцем ключа, а `plan_slot` уникален,
   * и удержание ключа мёртвой строкой закрывает слот навсегда. Ровно это
   * обнулило правку темпа Telegram: вечерний слот вернулся в план, но все
   * десять дат горизонта держали снятые строки.
   *
   * Материал, умерший по существу (решение редактора, safety), слот держит:
   * право на перевыпуск там считает бюджет поколений B643, а не этот сторож.
   */
  | { kind: "retire"; id: string; reason: string; releaseSlot?: boolean }
  | { kind: "expireModeration"; id: string; reason: string }
  | { kind: "alignPublished"; id: string; scheduledFor: Date; reason: string };

export interface QueueHygieneResult {
  actions: QueueHygieneAction[];
  /** Готовый материал, которому не нашлось свободного слота своей площадки. */
  unplaced: string[];
}

function isConversational(row: QueueRow): boolean {
  const type = (row.contentType ?? "").toUpperCase();
  return type === "INBOUND_REPLY" || type === "COMMENT" || type === "REPLY";
}

function isLive(row: QueueRow): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(row.status);
}

function isApproved(row: QueueRow): boolean {
  return (APPROVED_STATUSES as readonly string[]).includes(row.status);
}

/** Дальний край горизонта площадки: дальше него плановой строке стоять негде. */
function horizonEnd(now: Date, platform: string): number {
  const days = PLAN_HORIZON_DAYS[platform.trim().toLowerCase() as PlanChannel];
  // Незнакомая площадка не получает выдуманного горизонта: её строки сторож
  // по горизонту не двигает (§14 — запасной контракт обязан быть проницаемым).
  if (!days) return Number.POSITIVE_INFINITY;
  return now.getTime() + (days + 1) * 86_400_000;
}

/**
 * Что сделать с очередью, чтобы она снова была очередью.
 *
 * Порядок правил важен: сначала снимаются пустые оболочки (они освобождают
 * слоты), и только потом готовый материал занимает освободившееся. Обратный
 * порядок оставил бы написанное без места при живом свободном слоте.
 */
export function planQueueHygiene(input: {
  now: Date;
  rows: readonly QueueRow[];
  plan: readonly ContentPlanSlot[];
}): QueueHygieneResult {
  const { now, rows, plan } = input;
  const actions: QueueHygieneAction[] = [];
  const unplaced: string[] = [];
  const planKeys = new Set(plan.map((slot) => slot.key));

  // Выпущенное с будущей плановой датой: ручная дозапись, а не будущий выпуск.
  for (const row of rows) {
    if (row.status !== "PUBLISHED" || !row.publishedAt || !row.scheduledFor) continue;
    if (row.publishedAt.getTime() >= row.scheduledFor.getTime()) continue;
    actions.push({
      kind: "alignPublished",
      id: row.id,
      scheduledFor: row.publishedAt,
      reason: "Строка выпущена раньше своей плановой даты: дозапись задним числом. "
        + "Плановая дата приведена к фактическому выпуску, слот освобождён.",
    });
  }

  // Премодерация, до которой не дошли руки. Ответ протух — виновата очередь.
  for (const row of rows) {
    if (row.status !== "REVIEW") continue;
    if (row.telegramReviewMessageId === null || row.moderationDecisionAt !== null) continue;
    const since = (row.scheduledFor ?? row.createdAt).getTime();
    if (now.getTime() - since < PREMODERATION_STALE_MS) continue;
    const hours = Math.round((now.getTime() - since) / 3_600_000);
    actions.push({
      kind: "expireModeration",
      id: row.id,
      reason: `Премодерация не пройдена за ${hours} ч: ответ живому человеку протух. `
        + "Снято очередью, а не редактурой — материал браком не признан.",
    });
  }

  const expired = new Set(actions.filter((a) => a.kind === "expireModeration").map((a) => a.id));

  /**
   * B713 §6 — ПРОСРОЧЕННАЯ СТРОКА: своя болезнь, своё правило.
   *
   * Живой случай: строка Reddit со слотом 10.08 в статусе SCHEDULED
   * перебиралась публикатором каждую минуту неделю подряд и каждую минуту
   * отбивалась `Reddit OAuth is not connected`.
   *
   * Ни один существующий сторож её не брал: `beyond` ловит дату ДАЛЬШЕ
   * горизонта, а эта в ПРОШЛОМ; `noDate` — пустую, а эта заполнена; слот в
   * плане ещё числился; перенос B645 до неё не доходит, потому что канал на
   * паузе и проход прекращается раньше. Просроченное проваливалось между
   * четырьмя чужими правилами.
   *
   * ⚠ ПОРОГ ШИРОКИЙ НАМЕРЕННО. Двое суток, а не два часа: у статьи Дзена окно
   * шесть часов, а перенос B645 работает внутри суток. Узкий порог отбирал бы
   * материал у штатного механизма, который справляется сам, — и сторож начал
   * бы лечить здоровых.
   *
   * ⚠ И ЭТО НЕ БРАК МАТЕРИАЛА. Строка с написанным текстом идёт в перенос
   * вместе с остальными бездомными (`needsPlace`), а не в утиль: виновата
   * простоявшая очередь, а не текст.
   */
  const staleBefore = now.getTime() - STALE_SCHEDULE_MS;
  const overdue = new Set<string>();
  for (const row of rows) {
    if (!isLive(row) || expired.has(row.id) || isConversational(row)) continue;
    if (!row.scheduledFor || row.scheduledFor.getTime() > staleBefore) continue;
    const days = Math.floor((now.getTime() - row.scheduledFor.getTime()) / 86_400_000);
    overdue.add(row.id);
    if (row.hasDraftText) continue; // ниже попадёт в перенос вместе с бездомными
    actions.push({
      kind: "retire",
      id: row.id,
      reason: `Плановая дата просрочена на ${days} сут, текста на складе нет. `
        + "Строка снята с перебора: очередь опрашивала её каждый проход, "
        + "а выпускать было нечего.",
    });
  }

  // Плановые строки, которым в действующем плане места нет.
  const needsPlace: QueueRow[] = [];
  for (const row of rows) {
    if (!isLive(row) || expired.has(row.id) || isConversational(row)) continue;
    const slotGone = !row.planSlot || !planKeys.has(row.planSlot);
    const noDate = row.scheduledFor === null;
    const beyond = row.scheduledFor !== null
      && row.scheduledFor.getTime() > horizonEnd(now, row.platform);
    // B713 §6: просроченное — четвёртая причина остаться без места. Написанный
    // текст переезжает на живой слот, пустая оболочка уже снята выше.
    const stale = overdue.has(row.id);
    if (!slotGone && !noDate && !beyond && !stale) continue;

    // Утверждённое и написанное переносится; пустая оболочка снимается.
    if (row.hasDraftText || isApproved(row)) {
      // Утверждённая строка с ЖИВОЙ датой внутри горизонта остаётся на месте
      // даже без слота: её уже ждут, и перенос сдвинул бы обещанное время.
      //
      // B713 §6: но просроченная дата живой не бывает. Без `!stale` строка
      // Reddit со слотом недельной давности проходила ровно здесь и
      // возвращалась в перебор — каждую минуту, неделю подряд.
      if (isApproved(row) && !noDate && !beyond && !stale) continue;
      needsPlace.push(row);
      continue;
    }
    actions.push({
      kind: "retire",
      id: row.id,
      reason: noDate
        ? "Черновик без плановой даты и без текста: слота у него нет, а очередь "
          + "считала его готовым к работе в каждом проходе."
        : "Слот снят из контент-плана (B705 §19: горизонт и темп площадки), "
          + "текста на складе нет — снимать нечего.",
      // B713 §4a: ключ снятого слота обязан вернуться в оборот. Иначе слот,
      // вернувшийся в план (как вечерний Telegram), останется закрыт навсегда.
      releaseSlot: true,
    });
  }

  // Слоты, свободные после снятия пустых оболочек.
  const retired = new Set(actions.filter((a) => a.kind === "retire").map((a) => a.id));
  const occupied = new Set(
    rows
      .filter((row) => !retired.has(row.id) && !expired.has(row.id) && row.planSlot
        && (isLive(row) || row.status === "PUBLISHED"))
      .map((row) => row.planSlot as string),
  );
  const free = plan
    .filter((slot) => slot.reserve === "planned"
      && !occupied.has(slot.key)
      && new Date(slot.scheduledAt).getTime() > now.getTime())
    .sort((left, right) =>
      new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime());

  // Написанное вперёд утверждённого: у него уже потрачен круг автора, и оно
  // ближе всех к выпуску. Внутри группы — по прежней дате, иначе перестановка
  // зависела бы от порядка строк в выборке.
  const ordered = [...needsPlace].sort((left, right) =>
    Number(right.hasDraftText) - Number(left.hasDraftText)
      || (left.scheduledFor?.getTime() ?? left.createdAt.getTime())
        - (right.scheduledFor?.getTime() ?? right.createdAt.getTime())
      || left.id.localeCompare(right.id));

  for (const row of ordered) {
    const platform = row.platform.trim().toLowerCase();
    const index = free.findIndex((slot) => slot.channel === platform);
    if (index < 0) {
      // Слота своей площадки нет. Чужой не подходит: у материала контракт
      // ленты, под которую он написан, — перенос в другую ленту это брак.
      unplaced.push(row.id);
      continue;
    }
    const [slot] = free.splice(index, 1);
    actions.push({
      kind: "schedule",
      id: row.id,
      scheduledFor: new Date(slot.scheduledAt),
      planSlot: slot.key,
      // B713 §6: причина обязана называть ту болезнь, которая была. «Стоял за
      // горизонтом» на просроченной строке — неправда в журнале, а по журналу
      // потом разбирают, почему материал двигали.
      reason: row.scheduledFor === null
        ? "Плановая дата проставлена: материал готов, а срока у него не было."
        : overdue.has(row.id)
          ? "Перенесено на ближний слот площадки: материал готов, а его плановая "
            + "дата давно в прошлом — очередь опрашивала строку каждый проход впустую."
          : "Перенесено на ближний слот площадки: материал готов, а стоял за "
            + "горизонтом планирования.",
    });
  }

  return { actions, unplaced };
}

/**
 * Прочитать очередь, посчитать решение и записать его.
 *
 * Вызывается в начале прохода генератора: снятые оболочки освобождают слоты
 * ДО того, как проход начнёт считать нехватку, иначе он засеет заново то же
 * самое место.
 */
export async function runQueueHygiene(input: {
  now: Date;
  plan: readonly ContentPlanSlot[];
}): Promise<{ scheduled: number; retired: number; expired: number; aligned: number; unplaced: number }> {
  const rows = await db.externalPublication.findMany({
    where: { status: { in: [...LIVE_STATUSES, "PUBLISHED"] } },
    select: {
      id: true,
      platform: true,
      status: true,
      contentType: true,
      scheduledFor: true,
      publishedAt: true,
      createdAt: true,
      planSlot: true,
      agentWriterDraft: true,
      telegramReviewMessageId: true,
      moderationDecisionAt: true,
    },
  }).catch(() => []);

  const { actions, unplaced } = planQueueHygiene({
    now: input.now,
    plan: input.plan,
    rows: rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      status: row.status,
      contentType: row.contentType,
      scheduledFor: row.scheduledFor,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      planSlot: row.planSlot,
      hasDraftText: row.agentWriterDraft !== null && row.agentWriterDraft !== undefined,
      telegramReviewMessageId: row.telegramReviewMessageId,
      moderationDecisionAt: row.moderationDecisionAt,
    })),
  });

  const counts = { scheduled: 0, retired: 0, expired: 0, aligned: 0, unplaced: unplaced.length };
  for (const action of actions) {
    try {
      if (action.kind === "schedule") {
        await db.externalPublication.update({
          where: { id: action.id },
          data: { scheduledFor: action.scheduledFor, planSlot: action.planSlot, lastError: action.reason },
        });
        counts.scheduled += 1;
      } else if (action.kind === "retire") {
        await db.externalPublication.update({
          where: { id: action.id },
          data: {
            status: "ARCHIVED",
            autoPublish: false,
            archiveReason: action.reason,
            // B713 §4a: ключ уникален, и мёртвая строка, снятая ЗА ОТСУТСТВИЕ
            // слота, закрывала бы этот слот навсегда. `undefined` в Prisma —
            // «не трогать поле», поэтому остальные снятия слот сохраняют.
            planSlot: action.releaseSlot ? null : undefined,
          },
        });
        counts.retired += 1;
      } else if (action.kind === "expireModeration") {
        await db.externalPublication.update({
          where: { id: action.id },
          data: { status: "ARCHIVED", autoPublish: false, archiveReason: action.reason },
        });
        counts.expired += 1;
      } else {
        await db.externalPublication.update({
          where: { id: action.id },
          data: { scheduledFor: action.scheduledFor },
        });
        counts.aligned += 1;
      }
    } catch (error) {
      // Одна упавшая строка не отменяет уборку остальных: сторож обязан
      // доводить проход до конца, иначе первая же коллизия ключа слота
      // оставила бы очередь ровно в том состоянии, ради которого он заведён.
      log.warn("marketing.queue_hygiene_action_failed", { id: action.id, kind: action.kind });
    }
  }

  if (actions.length > 0 || unplaced.length > 0) {
    log.info("marketing.queue_hygiene", counts);
  }
  return counts;
}
