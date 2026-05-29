import { Fragment } from "react";
import { parseMarkdownBlocks, type InlineToken } from "@/lib/markdown";
import { cn } from "@/lib/utils";

// T17: render AI answers as formatted prose instead of raw "##"/"**" tokens.
// Everything is rendered as React elements, so all text is auto-escaped — there
// is no HTML injection and no XSS surface even for user-authored content.

function InlineTokens({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, i) => {
        switch (token.type) {
          case "bold":
            return <strong key={i}>{token.text}</strong>;
          case "italic":
            return <em key={i}>{token.text}</em>;
          case "code":
            return <code key={i}>{token.text}</code>;
          default:
            return <Fragment key={i}>{token.text}</Fragment>;
        }
      })}
    </>
  );
}

export function SoftMarkdown({
  content,
  className,
}: {
  content: string | null | undefined;
  className?: string;
}) {
  const blocks = parseMarkdownBlocks(content);
  if (blocks.length === 0) return null;

  return (
    <div className={cn("soft-prose space-y-3 leading-relaxed", className)}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const Tag = (`h${block.level}` as "h2" | "h3" | "h4" | "h5");
          return (
            <Tag key={i} className="font-heading font-medium text-[var(--soft-bordeaux)]">
              <InlineTokens tokens={block.tokens} />
            </Tag>
          );
        }
        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={i}
              className={cn(
                "space-y-1.5 pl-5",
                block.ordered ? "list-decimal" : "list-disc",
              )}
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <InlineTokens tokens={item} />
                </li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={i}>
            <InlineTokens tokens={block.tokens} />
          </p>
        );
      })}
    </div>
  );
}
