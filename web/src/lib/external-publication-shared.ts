// Browser-safe vocabulary for B577. Keep this module free of database and
// Node-only imports: the admin client renders these labels and selectors.
export const PUBLICATION_PLATFORMS = [
  "DZEN",
  "VK",
  "TELEGRAM",
  "REDDIT",
  "THREADS",
  "INSTAGRAM",
  "YOUTUBE",
  "MEDIA",
  "DIRECTORY",
  "OTHER",
] as const;
export const PUBLICATION_CONTENT_TYPES = ["ARTICLE", "POST", "COMMENT", "VIDEO", "PROFILE", "DIRECTORY_CARD", "OTHER"] as const;
export const PUBLICATION_STATUSES = ["PLANNED", "DRAFT", "REVIEW", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED", "PAUSED", "ARCHIVED"] as const;
export const PUBLICATION_INDEX_STATUSES = ["UNKNOWN", "NOT_INDEXED", "DISCOVERED", "INDEXED", "EXCLUDED"] as const;
