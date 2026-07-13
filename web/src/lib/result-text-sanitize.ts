const EMBEDDED_DISCLAIMER_PATTERNS = [
  /(?:астролог(?:ия|ический|ическая)|нумеролог(?:ия|ический|ическая)|таро|дизайн человека|символическ[\p{L}\p{M}-]*).*не\s+да[её]т.*(?:точн[\p{L}\p{M}-]*|однозначн[\p{L}\p{M}-]*|гарант[\p{L}\p{M}-]*|прогноз[\p{L}\p{M}-]*|ответ[\p{L}\p{M}-]*)/iu,
  /не\s+да[её]т.*(?:точн[\p{L}\p{M}-]*|однозначн[\p{L}\p{M}-]*|гарант[\p{L}\p{M}-]*).*(?:прогноз[\p{L}\p{M}-]*|ответ[\p{L}\p{M}-]*|будущ[\p{L}\p{M}-]*)/iu,
  /(?:только|лишь)\s+(?:предлагает|да[её]т|показывает)?\s*(?:направлен[\p{L}\p{M}-]*|возможн[\p{L}\p{M}-]*|сценари[\p{L}\p{M}-]*|материал|повод)\s+для\s+размышлен[\p{L}\p{M}-]*/iu,
  /не\s+заменя(?:ет|ют).*(?:консультац[\p{L}\p{M}-]*|специалист[\p{L}\p{M}-]*|психолог[\p{L}\p{M}-]*|врач[\p{L}\p{M}-]*|юрист[\p{L}\p{M}-]*|финанс[\p{L}\p{M}-]*)/iu,
  /не\s+явля(?:ется|ются).*(?:медицинск[\p{L}\p{M}-]*|юридическ[\p{L}\p{M}-]*|финансов[\p{L}\p{M}-]*|психологическ[\p{L}\p{M}-]*|терапевтическ[\p{L}\p{M}-]*|консультац[\p{L}\p{M}-]*)/iu,
  /носит\s+(?:информационно[-\s]рефлексивн[\p{L}\p{M}-]*|ознакомительн[\p{L}\p{M}-]*|развлекательн[\p{L}\p{M}-]*)\s+характер/iu,
  /для\s+этого\s+есть\s+отдельн[\p{L}\p{M}-]*\s+дисклеймер/iu,
];

function isHeading(block: string) {
  return /^#{1,6}\s+\S/.test(block.trim());
}

function isEmbeddedDisclaimer(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 0 && EMBEDDED_DISCLAIMER_PATTERNS.some((pattern) => pattern.test(compact));
}

function stripDisclaimerSentences(block: string) {
  return block
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !isEmbeddedDisclaimer(sentence))
    .join(" ")
    .trim();
}

export function stripEmbeddedResultDisclaimers(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const cleanedLines: string[] = [];
      let paragraphLines: string[] = [];

      const flushParagraph = () => {
        const paragraph = paragraphLines.join(" ").trim();
        paragraphLines = [];
        if (!paragraph) return;

        const cleaned = stripDisclaimerSentences(paragraph);
        if (cleaned && !isEmbeddedDisclaimer(cleaned)) cleanedLines.push(cleaned);
      };

      for (const line of block.trim().split("\n")) {
        if (isHeading(line)) {
          flushParagraph();
          cleanedLines.push(line.trim());
        } else {
          paragraphLines.push(line);
        }
      }
      flushParagraph();

      return cleanedLines.join("\n");
    })
    .filter((block) => block.length > 0 && !isEmbeddedDisclaimer(block))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
