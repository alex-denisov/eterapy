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

// Fillable placeholders. B452: ИП зарегистрировано 2026-07-20, реквизиты
// подставляются здесь. Адрес оператора в публичных документах НЕ печатается
// (owner-решение 2026-07-20): для ИП ЗоЗПП ст. 9 требует сведения о госрегистрации,
// а не адрес; адрес регистрации подаётся только в уведомление РКН.
const SUBSTITUTIONS: ReadonlyArray<readonly [string, string]> = [
  // Owner-решение 2026-07-17: остаёмся на редакции 1.0 — сервис не запущен,
  // оферту никто не акцептовал, переиздавать нечего (см. registry.ts).
  ["[Версия документа]", "1.0"],
  ["[ИП Денисов Алексей]", "Индивидуальный предприниматель Денисов Алексей Сергеевич"],
  ["[ИНН]", "774315089677"],
  ["[ОГРНИП]", "326508100422433"],
  // Адрес печатается ТОЛЬКО в Политике обработки ПДн (Документ 3): практика
  // 152-ФЗ ожидает адрес оператора именно там, и он же указан в уведомлении
  // РКН. В Оферте и остальных документах адреса нет — owner-решение 2026-07-20.
  ["[Адрес]", "141281, Московская обл., г. Ивантеевка, ул. Хлебозаводская, д. 36, кв. 135"],
  ["[Дата публикации]", "18 июня 2026 г."],
  ["[Email поддержки]", "support@eterapy.com"],
  ["[Email для ПДн]", "privacy@eterapy.com"],
  ["[Ссылка на личный кабинет]", "app.eterapy.com"],
  ["[Ссылка на сайт]", "eterapy.com"],
  ["[указать срок]", "10"],
  // B423: the payment provider is deliberately never named in the legal texts —
  // the documents say "провайдер, указанный в интерфейсе при оплате" instead.
  // This used to be a substitution rewriting «Твои платежи» → «[платёжный
  // сервис]», which rendered on the live offer and privacy pages as what read
  // like an unfilled placeholder. The source text is neutral now.
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
