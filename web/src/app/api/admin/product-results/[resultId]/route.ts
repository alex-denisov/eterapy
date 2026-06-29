import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { reframeToMarkdown } from "@/lib/reframe-format";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function productLabel(key: string) {
  const labels: Record<string, string> = {
    reframe: "Переосмысление",
    compatibility: "Совместимость",
    tarot: "Таро-разбор",
    natal: "Натальная карта",
    synastry: "Синастрия",
    human_design: "Human Design",
    dialogue: "Диалог",
  };
  return labels[key] ?? key;
}

function renderBody(raw: string) {
  return raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^#{1,3}\s/.test(block)) {
        const level = Math.min(3, block.match(/^#+/)?.[0].length ?? 2);
        return `<h${level}>${escapeHtml(block.replace(/^#{1,3}\s*/, ""))}</h${level}>`;
      }
      if (/^[-*]\s/m.test(block)) {
        const items = block.split(/\n/).filter(Boolean).map((line) => `<li>${escapeHtml(line.replace(/^[-*]\s*/, ""))}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

function pageHtml(input: {
  title: string;
  clientName: string | null;
  clientEmail: string;
  productKey: string;
  status: string;
  updatedAt: Date;
  body: string;
}) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)} · ETerapy</title>
  <style>
    :root { color-scheme: light; --paper:#fbf6ee; --card:#fffdf8; --edge:#eaded2; --ink:#332a27; --muted:#7a6e67; --bordeaux:#5c2a2c; --terracotta:#b65f45; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.65 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(920px, calc(100% - 32px)); margin: 32px auto 56px; }
    header { border: 1px solid var(--edge); background: var(--card); border-radius: 14px; padding: 28px; box-shadow: 0 18px 50px -34px rgba(92,42,44,.35); }
    .eyebrow { margin: 0 0 8px; color: var(--terracotta); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; color: var(--bordeaux); font-family: Georgia, "Times New Roman", serif; font-size: clamp(30px, 5vw, 48px); line-height: 1.05; }
    .meta { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-top: 22px; }
    .meta div { border: 1px solid var(--edge); border-radius: 10px; background: rgba(255,255,255,.65); padding: 10px 12px; min-width: 0; }
    .meta dt { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
    .meta dd { margin: 3px 0 0; overflow-wrap: anywhere; font-size: 13px; font-weight: 600; }
    article { margin-top: 18px; border: 1px solid var(--edge); background: var(--card); border-radius: 14px; padding: clamp(22px, 4vw, 42px); box-shadow: 0 18px 50px -38px rgba(92,42,44,.28); }
    article h1, article h2, article h3 { color: var(--bordeaux); font-family: Georgia, "Times New Roman", serif; line-height: 1.18; margin: 1.2em 0 .45em; }
    article h1:first-child, article h2:first-child, article h3:first-child { margin-top: 0; }
    article p { margin: 0 0 1em; }
    article ul { margin: 0 0 1em; padding-left: 1.3em; }
    article li { margin: .35em 0; }
    @media (max-width: 720px) { main { width: min(100% - 20px, 920px); margin-top: 16px; } header { padding: 20px; } .meta { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">результат цифровой услуги</p>
      <h1>${escapeHtml(input.title)}</h1>
      <dl class="meta">
        <div><dt>Клиент</dt><dd>${escapeHtml(input.clientName || input.clientEmail)}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(input.clientEmail)}</dd></div>
        <div><dt>Продукт</dt><dd>${escapeHtml(productLabel(input.productKey))}</dd></div>
        <div><dt>Статус</dt><dd>${escapeHtml(input.status)}</dd></div>
        <div><dt>Обновлено</dt><dd>${escapeHtml(new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium" }).format(input.updatedAt))}</dd></div>
      </dl>
    </header>
    <article>${renderBody(input.body)}</article>
  </main>
</body>
</html>`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ resultId: string }> },
) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!["ADMIN", "SUPERADMIN"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { resultId } = await context.params;
  const result = await db.productResult.findUnique({
    where: { id: resultId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rawBody = result.resultText ?? result.previewText ?? "Текст результата отсутствует.";
  const body = result.productKey === "reframe" ? reframeToMarkdown(rawBody) : rawBody;
  return new Response(pageHtml({
    title: result.title,
    clientName: result.user.name,
    clientEmail: result.user.email,
    productKey: result.productKey,
    status: result.status,
    updatedAt: result.updatedAt,
    body,
  }), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
