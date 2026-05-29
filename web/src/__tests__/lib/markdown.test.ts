import { parseInline, parseMarkdownBlocks, stripMarkdown } from "@/lib/markdown";

describe("markdown parser (T17)", () => {
  describe("parseInline", () => {
    it("splits bold, italic and code tokens", () => {
      const tokens = parseInline("Hello **bold** and *italic* and `code`.");
      expect(tokens).toEqual([
        { type: "text", text: "Hello " },
        { type: "bold", text: "bold" },
        { type: "text", text: " and " },
        { type: "italic", text: "italic" },
        { type: "text", text: " and " },
        { type: "code", text: "code" },
        { type: "text", text: "." },
      ]);
    });

    it("returns plain text when no markers exist", () => {
      expect(parseInline("just text")).toEqual([{ type: "text", text: "just text" }]);
    });
  });

  describe("parseMarkdownBlocks", () => {
    it("parses headings into the right level (## -> h3)", () => {
      const blocks = parseMarkdownBlocks("## Заголовок");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ type: "heading", level: 3 });
    });

    it("groups consecutive bullet lines into one list", () => {
      const blocks = parseMarkdownBlocks("- one\n- two\n- three");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ type: "list", ordered: false });
      if (blocks[0].type === "list") {
        expect(blocks[0].items).toHaveLength(3);
      }
    });

    it("parses ordered lists separately from bullets", () => {
      const blocks = parseMarkdownBlocks("1. first\n2. second");
      expect(blocks[0]).toMatchObject({ type: "list", ordered: true });
    });

    it("treats blank-line separated text as distinct paragraphs", () => {
      const blocks = parseMarkdownBlocks("First para.\n\nSecond para.");
      expect(blocks).toHaveLength(2);
      expect(blocks.every((b) => b.type === "paragraph")).toBe(true);
    });

    it("returns an empty array for empty input", () => {
      expect(parseMarkdownBlocks("")).toEqual([]);
      expect(parseMarkdownBlocks(null)).toEqual([]);
    });
  });

  describe("stripMarkdown", () => {
    it("removes heading, bold, italic and bullet tokens", () => {
      expect(stripMarkdown("## Title\n\n**bold** and *italic*\n- item")).toBe(
        "Title bold and italic item",
      );
    });

    it("collapses whitespace and trims", () => {
      expect(stripMarkdown("  a\n\n  b  ")).toBe("a b");
    });
  });
});
