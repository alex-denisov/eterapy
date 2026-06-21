// Pure formatting helpers for the dialogue primary answer (the «что я слышу в
// вашем вопросе» разбор). No server imports — safe to use in client components.

// A legacy «Если хочется глубже» section recommended a paid format inside the
// prose разбор. Product recommendations now live in a dedicated block after the
// answer («можно посмотреть глубже»), so the prose must not duplicate them.
// New разборы no longer generate this section (the prompt was updated), but
// разборы persisted earlier still carry it — strip it on display so the result
// page is clean for everyone.
const DEEPENING_MARKER = /^\s*(?:#{1,6}\s*)?(?:\d+[.)]\s*)?(?:\*\*\s*)?Если\s+(?:хочется|захочется)\s+глубже/i;

export function stripDeepeningSection(text: string): string {
  if (!text) return text;
  const blocks = text.split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const markerIndex = lines.findIndex((line) => DEEPENING_MARKER.test(line));
    if (markerIndex === -1) {
      out.push(block);
      continue;
    }
    // Keep anything before the marker (e.g. when the deepening trails another
    // section in the same block); drop the marker line and the rest of the block.
    const head = lines.slice(0, markerIndex).join("\n").trim();
    if (head) out.push(head);
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
