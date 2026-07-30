/**
 * B617 — законный периметр SMM-агента.
 *
 * Граница проходит не по «автоматически или руками», а по «своё пространство
 * или чужое». Публиковать в собственный канал, отвечать на комментарий к своему
 * посту и отвечать на упоминание разрешено официальными API везде. Плановый
 * комментарий под чужим постом запрещён правилами Meta, ловится антиспамом VK,
 * а у Reddit формально разрешён, но снимается модераторами.
 *
 * Модуль существует, чтобы запрет был исполняемым, а не запиской в тикете:
 * попытка действия вне периметра падает с явной ошибкой до внешнего вызова.
 */

export type MarketingAction =
  /** Собственная публикация в свой канал. */
  | "OWN_POST"
  /** Ответ на комментарий к собственной публикации. */
  | "REPLY_TO_OWN"
  /** Ответ на упоминание бренда или входящее сообщение. */
  | "REPLY_TO_MENTION"
  /** Комментарий под чужой публикацией. */
  | "THIRD_PARTY_COMMENT";

export const ALLOWED_MARKETING_ACTIONS: readonly MarketingAction[] = [
  "OWN_POST",
  "REPLY_TO_OWN",
  "REPLY_TO_MENTION",
];

export class MarketingPerimeterError extends Error {
  readonly action: MarketingAction;

  constructor(action: MarketingAction, message: string) {
    super(message);
    this.name = "MarketingPerimeterError";
    this.action = action;
  }
}

export function isWithinPerimeter(action: MarketingAction): boolean {
  return ALLOWED_MARKETING_ACTIONS.includes(action);
}

export function assertWithinPerimeter(action: MarketingAction, context: string): void {
  if (isWithinPerimeter(action)) return;
  throw new MarketingPerimeterError(
    action,
    `Действие «${action}» вне законного периметра площадок (${context}). `
    + "Агент публикует только в собственные каналы и отвечает на входящее.",
  );
}

/**
 * Строка реестра описывает ответ третьему лицу, если у неё есть цель-чужой
 * пост. Такие строки остались от прежнего режима: их нельзя ни публиковать, ни
 * молча удалять — они уходят в архив с причиной.
 */
export function actionForPublication(input: {
  contentType?: string | null;
  engagementTargetId?: string | null;
  inboundReplyToId?: string | null;
}): MarketingAction {
  if (input.inboundReplyToId) return "REPLY_TO_OWN";
  // Решает наличие цели-чужого поста, а не тип строки: contentType в реестре
  // бывает пустым у записей, заведённых до появления очереди.
  if (input.engagementTargetId && (input.contentType ?? "").toUpperCase() !== "POST") {
    return "THIRD_PARTY_COMMENT";
  }
  return "OWN_POST";
}
