// Pure formatting helper for the tarot reading body shown on the result page.
// No server imports — safe to use in client components.

// #1: a tarot reading must tell the story of the cards, not duplicate what is
// already on the card and not interrogate the user. This strips two legacy
// artefacts so the reading reads cleanly:
//   - a standalone «прямое/перевёрнутое положение» line (orientation is already
//     visible on the card itself, so repeating it as its own line is noise);
//   - per-card reflective question bullets («…?») — the расклад should interpret,
//     not ask the user questions.
// New readings no longer generate these (the prompt was updated); this also
// cleans readings persisted before that change.
// NB: \w does not match Cyrillic in JS regex, so use explicit Cyrillic ranges.
const ORIENTATION_LINE = /^\s*[-*•]?\s*(?:Прям|Перев[её]рнут|Перевернут)[а-яёА-ЯЁ]*\s+положени[а-яёА-ЯЁ]*\s*[.:]?\s*$/i;
const QUESTION_BULLET = /^\s*[-*•]\s*.+\?\s*$/;

export function sanitizeTarotReading(text: string): string {
  if (!text) return text;
  const kept = text
    .split("\n")
    .filter((line) => !ORIENTATION_LINE.test(line) && !QUESTION_BULLET.test(line));
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
