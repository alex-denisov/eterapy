// B464 round-4 #15 — shared validation rules for the session review and
// complaint forms. Imported by BOTH the client modals and the API routes so
// client UX and server enforcement can never drift.

export const REVIEW_TEXT_MAX = 800;
// A low rating must explain itself: moderation and the practitioner need the
// context, and it keeps drive-by one-star ratings accountable.
export const REVIEW_COMMENT_REQUIRED_BELOW = 3; // inclusive: 1–3 ★ require text
export const REVIEW_COMMENT_MIN = 10;

export function reviewCommentRequired(rating: number): boolean {
  return rating >= 1 && rating <= REVIEW_COMMENT_REQUIRED_BELOW;
}

export function reviewValidationError(rating: unknown, text: unknown): string | null {
  const ratingNum = typeof rating === "number" ? rating : Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return "Выберите оценку от 1 до 5";
  }
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (reviewCommentRequired(ratingNum) && trimmed.length < REVIEW_COMMENT_MIN) {
    return `При оценке ${REVIEW_COMMENT_REQUIRED_BELOW} и ниже расскажите, что пошло не так — от ${REVIEW_COMMENT_MIN} символов`;
  }
  if (trimmed.length > REVIEW_TEXT_MAX) {
    return `Комментарий — до ${REVIEW_TEXT_MAX} символов`;
  }
  return null;
}

export const COMPLAINT_DESCRIPTION_MIN = 20;
export const COMPLAINT_DESCRIPTION_MAX = 1000;

export function complaintValidationError(reason: unknown, description: unknown): string | null {
  if (typeof reason !== "string" || !reason.trim()) return "Выберите причину жалобы";
  const trimmed = typeof description === "string" ? description.trim() : "";
  if (trimmed.length < COMPLAINT_DESCRIPTION_MIN) {
    return `Опишите ситуацию подробнее — минимум ${COMPLAINT_DESCRIPTION_MIN} символов`;
  }
  if (trimmed.length > COMPLAINT_DESCRIPTION_MAX) {
    return `Описание — до ${COMPLAINT_DESCRIPTION_MAX} символов`;
  }
  return null;
}
