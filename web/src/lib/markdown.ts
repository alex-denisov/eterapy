// T17: the app stores AI-generated answers as Markdown, but every surface
// rendered them as raw text — so users saw literal "##", "**" and "-" tokens.
// We have no markdown dependency in the bundle, so this parses the limited
// subset our prompts emit (headings, bold, italic, inline code, bullet/ordered
// lists) into plain data. Rendering happens in <SoftMarkdown> as React
// elements, so React escapes all text automatically — no raw HTML injection,
// no XSS surface even when the source includes user-authored dialogue content.

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string };

export type MarkdownBlock =
  | { type: "heading"; level: number; tokens: InlineToken[] }
  | { type: "paragraph"; tokens: InlineToken[] }
  | { type: "list"; ordered: boolean; start?: number; items: InlineToken[][] };

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ type: "text", text: text.slice(lastIndex, index) });
    }
    const chunk = match[0];
    if (chunk.startsWith("**")) {
      tokens.push({ type: "bold", text: chunk.slice(2, -2) });
    } else if (chunk.startsWith("`")) {
      tokens.push({ type: "code", text: chunk.slice(1, -1) });
    } else {
      // *italic* or _italic_
      tokens.push({ type: "italic", text: chunk.slice(1, -1) });
    }
    lastIndex = index + chunk.length;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: "text", text: text.slice(lastIndex) });
  }
  return tokens.length > 0 ? tokens : [{ type: "text", text }];
}

export function normalizeMarkdownLists(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((rawLine) => {
      let line = rawLine.replace(/^\s*[•–—]\s+/, "- ");
      const orderedMarkers = [...line.matchAll(/(?:^|\s)\d{1,2}[.)]\s+/g)];
      const bulletMarkers = [...line.matchAll(/(?:^|\s)[•-]\s+/g)];
      if (orderedMarkers.length + bulletMarkers.length < 2) return [line];

      line = line
        .replace(/\s+(?=\d{1,2}[.)]\s+)/g, "\n")
        .replace(/\s+(?=[•-]\s+)/g, "\n")
        .replace(/^•\s+/gm, "- ");
      return line.split("\n");
    })
    .join("\n");
}

export function parseMarkdownBlocks(markdown: string | null | undefined): MarkdownBlock[] {
  if (!markdown) return [];
  const lines = normalizeMarkdownLists(markdown).split("\n");

  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start?: number; items: string[] } | null = null;
  let orderedItemsInSection = 0;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", tokens: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({
        type: "list",
        ordered: list.ordered,
        ...(list.ordered ? { start: list.start } : {}),
        items: list.items.map((item) => parseInline(item)),
      });
      if (list.ordered) orderedItemsInSection += list.items.length;
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: Math.min(heading[1].length + 1, 5),
        tokens: parseInline(heading[2]),
      });
      orderedItemsInSection = 0;
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, start: orderedItemsInSection + 1, items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

/**
 * Strip Markdown tokens to plain text — used for short previews/snippets where
 * full block rendering would be noise (e.g. map tiles truncated to ~160 chars).
 */
export function stripMarkdown(markdown: string | null | undefined): string {
  if (!markdown) return "";
  return markdown
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
