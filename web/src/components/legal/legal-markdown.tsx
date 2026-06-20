import { Fragment, type ReactNode } from "react";

// Minimal, dependency-free Markdown → React renderer for the legal pack. Only the
// subset used by the documents is supported (headings, paragraphs, bold, bullet
// lists, tables and fenced blocks). Content is our own static text, never user
// input, and is emitted as React elements only — raw HTML is never injected.

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part, idx) => {
    if (!part) return;
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) nodes.push(<strong key={idx}>{bold[1]}</strong>);
    else nodes.push(<Fragment key={idx}>{part}</Fragment>);
  });
  return nodes;
}

function LegalTable({ rows }: { rows: string[] }) {
  const grid = rows.map((line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()),
  );
  const hasSeparator = grid[1]?.every((cell) => /^:?-{2,}:?$/.test(cell)) ?? false;
  const header = grid[0] ?? [];
  const body = hasSeparator ? grid.slice(2) : grid.slice(1);
  return (
    <table className="legal-table">
      <thead>
        <tr>{header.map((cell, i) => <th key={i}>{renderInline(cell)}</th>)}</tr>
      </thead>
      <tbody>
        {body.map((row, ri) => (
          <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{renderInline(cell)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

const isHeading = (l: string) => /^#{2,4}\s+/.test(l);
const isTableRow = (l: string) => l.trim().startsWith("|");
const isListItem = (l: string) => /^\s*[-*]\s+/.test(l);
const isHr = (l: string) => /^---+$/.test(l.trim());
const isFence = (l: string) => l.trim().startsWith("```");

export function LegalMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (isFence(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      blocks.push(<pre key={key++} className="legal-pre">{buf.join("\n")}</pre>);
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      const content = renderInline(heading[2]);
      const level = heading[1].length;
      // The page <h1> is the document title; "### N." sections are the primary
      // sections and render as <h2> (styled divider), "####" as <h3>.
      const Tag = level <= 3 ? "h2" : level === 4 ? "h3" : "h4";
      blocks.push(<Tag key={key++}>{content}</Tag>);
      i++;
      continue;
    }

    if (isHr(line)) { i++; continue; }

    if (isTableRow(line)) {
      const tbl: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) { tbl.push(lines[i]); i++; }
      blocks.push(<LegalTable key={key++} rows={tbl} />);
      continue;
    }

    if (isListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && isListItem(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++}>{items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>)}</ul>,
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !isFence(lines[i]) && !isHeading(lines[i]) &&
      !isTableRow(lines[i]) && !isListItem(lines[i]) && !isHr(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(<p key={key++}>{renderInline(para.join(" "))}</p>);
  }

  return <>{blocks}</>;
}
