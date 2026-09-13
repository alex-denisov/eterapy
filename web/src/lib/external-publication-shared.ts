// Browser-safe vocabulary for B577. Keep this module free of database and
// Node-only imports: the admin client renders these labels and selectors.
export const PUBLICATION_PLATFORMS = [
  "DZEN",
  "VK",
  "TELEGRAM",
  "THREADS",
  "INSTAGRAM",
  "YOUTUBE",
  "MEDIA",
  "DIRECTORY",
  "OTHER",
] as const;
// B626: `INBOUND_REPLY` — ответ агента на комментарий, упоминание или сообщение
// (B618). Строка реестра у него такая же, как у собственного поста, поэтому и в
// таблице «Опубликованные материалы» он должен быть виден и подписан, а не
// выпадать сырым кодом. Владелец 2026-07-30 просил именно этого: комментарии
// агента — часть того же реестра, что и публикации.
export const PUBLICATION_CONTENT_TYPES = ["ARTICLE", "POST", "COMMENT", "INBOUND_REPLY", "VIDEO", "PROFILE", "DIRECTORY_CARD", "OTHER"] as const;
export const PUBLICATION_STATUSES = ["PLANNED", "DRAFT", "REVIEW", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED", "PAUSED", "ARCHIVED"] as const;
export const PUBLICATION_INDEX_STATUSES = ["UNKNOWN", "NOT_INDEXED", "DISCOVERED", "INDEXED", "EXCLUDED"] as const;

/**
 * B626 — машинные коды прошлых решений переводятся в человеческий текст один
 * раз и в одном месте. Владелец читает причину, а не идентификатор ветки.
 *
 * Живёт здесь, а не рядом с логикой восстановления: этот словарь нужен
 * клиентскому компоненту таблицы, а модуль восстановления тянет базу.
 */
const ARCHIVE_REASON_LABELS: Readonly<Record<string, string>> = {
  SUPERSEDED_BY_B610_TWO_WEEK_PLAN: "Заменено новым двухнедельным контент-планом",
  OUT_OF_PERIMETER_B617: "Вне законного периметра: комментарий под чужой публикацией",
};

export function archiveReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return ARCHIVE_REASON_LABELS[reason] ?? reason;
}
