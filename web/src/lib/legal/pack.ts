import fs from "node:fs";
import path from "node:path";
import { getLegalDoc, type LegalDocSlug } from "@/lib/legal/registry";

// The legal pages are statically generated (see legal/[doc]/page.tsx), so the
// source pack is read once at build time.
let cachedPack: string | null = null;

function readPack(): string {
  if (cachedPack === null) {
    const file = path.join(process.cwd(), "src", "content", "legal-pack.md");
    cachedPack = fs.readFileSync(file, "utf8");
  }
  return cachedPack;
}

// Fillable placeholders. Company requisites (ИП / ИНН / ОГРНИП / адрес / телефон)
// are deliberately LEFT as visible "[...]" placeholders: the legal entity is not
// registered yet, so they must remain blank until the owner provides them.
const SUBSTITUTIONS: ReadonlyArray<readonly [string, string]> = [
  ["[Версия документа]", "1.1"],
  ["[Дата публикации]", "16 июля 2026 г."],
  ["[Email поддержки]", "support@eterapy.com"],
  ["[Email для ПДн]", "privacy@eterapy.com"],
  ["[Ссылка на личный кабинет]", "app.eterapy.com"],
  ["[Ссылка на сайт]", "eterapy.com"],
  ["[указать срок]", "10"],
  // Payment provider is intentionally NOT named: the YooKassa → new-provider
  // migration is deferred (B423), so legal text stays provider-neutral.
  ["«Твои платежи»", "«[платёжный сервис]»"],
];

function applySubstitutions(text: string): string {
  let out = text;
  for (const [from, to] of SUBSTITUTIONS) {
    out = out.split(from).join(to);
  }
  return out;
}

const DOC_HEADER = /^## Документ (\d+)\.\s*(.*)$/;
// Leading metadata lines that we render from the registry instead, to avoid a
// duplicate version/date/requisites block at the top of every document.
// B525: «Исполнитель» больше не применяется к платформе — оферта представляет
// её как «Оператор платформы». Старое значение сохранено для устойчивости.
const META_LINE = /^\*\*(Редакция|Дата публикации|Исполнитель|Оператор платформы):\*\*/;

/**
 * Returns the substituted markdown body for a single public legal document,
 * sliced out of the source pack by its document number.
 */
export function legalDocMarkdown(slug: LegalDocSlug): string {
  const doc = getLegalDoc(slug);
  if (!doc) throw new Error(`Unknown legal document: ${slug}`);

  const lines = readPack().split("\n");
  const body: string[] = [];
  let inDoc = false;

  for (const line of lines) {
    const header = line.match(DOC_HEADER);
    if (header) {
      const num = Number(header[1]);
      if (num === doc.docNumber) {
        inDoc = true;
        continue; // skip the "## Документ N. ..." header line itself
      }
      if (inDoc) break; // reached the next document — stop
      continue;
    }
    if (inDoc) body.push(line);
  }

  if (!body.length) {
    throw new Error(`Legal document ${doc.docNumber} (${slug}) not found in pack`);
  }

  // Drop leading blank / meta lines so the page starts at the first section.
  while (body.length && (!body[0].trim() || META_LINE.test(body[0].trim()))) {
    body.shift();
  }
  // Drop trailing blanks and the trailing "---" document separator.
  while (body.length) {
    const last = body[body.length - 1].trim();
    if (!last || /^---+$/.test(last)) body.pop();
    else break;
  }

  return applySubstitutions(body.join("\n")).trim();
}
