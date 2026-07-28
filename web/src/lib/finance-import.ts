import { createHash } from "crypto";

export type CsvRow = Record<string, string>;

function delimiterOf(line: string) {
  const counts = [
    [";", (line.match(/;/g) ?? []).length],
    [",", (line.match(/,/g) ?? []).length],
    ["\t", (line.match(/\t/g) ?? []).length],
  ] as const;
  return [...counts].sort((left, right) => right[1] - left[1])[0][0];
}

function parseLine(line: string, delimiter: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = delimiterOf(lines[0]);
  const headers = parseLine(lines[0], delimiter).map((header) => header.trim().toLocaleLowerCase("ru-RU"));
  return lines.slice(1).map((line) => {
    const values = parseLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
}

function pick(row: CsvRow, names: string[]) {
  for (const name of names) {
    const found = Object.entries(row).find(([header]) => header.includes(name));
    if (found?.[1]) return found[1];
  }
  return "";
}

function amount(value: string) {
  let compact = value.trim().replace(/[^\d,.\-()]/g, "");
  const negative = compact.startsWith("-") || (compact.startsWith("(") && compact.endsWith(")"));
  compact = compact.replace(/[()\-]/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const separator = Math.max(lastComma, lastDot);
  const fractionLength = separator >= 0 ? compact.length - separator - 1 : 0;
  // A final separator with one or two digits is decimal. Earlier separators
  // are grouping marks. This accepts both Russian `12 500,50` and bank/API
  // `12500.50` without deleting the decimal point.
  const decimalIndex = separator >= 0 && fractionLength >= 1 && fractionLength <= 2
    ? separator
    : -1;
  const integer = (decimalIndex >= 0 ? compact.slice(0, decimalIndex) : compact).replace(/[.,]/g, "");
  const fraction = decimalIndex >= 0 ? compact.slice(decimalIndex + 1).replace(/[.,]/g, "") : "";
  const normalized = `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function date(value: string) {
  const match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export type BankImportRow = {
  importKey: string;
  occurredAt: string;
  direction: "income" | "expense";
  categoryKey: string;
  amountKopecks: number;
  taxable: false;
  counterparty: string | null;
  documentRef: string | null;
  note: string;
};

export function parseBankStatement(text: string): BankImportRow[] {
  return parseCsv(text).flatMap((row) => {
    const occurredAt = date(pick(row, ["дата операции", "дата проводки", "дата"]));
    const income = amount(pick(row, ["приход", "зачисление", "кредит"]));
    const expense = amount(pick(row, ["расход", "списание", "дебет"]));
    const signed = amount(pick(row, ["сумма операции", "сумма"]));
    const resolved = income && income > 0
      ? { direction: "income" as const, value: income }
      : expense && expense > 0
        ? { direction: "expense" as const, value: expense }
        : signed && signed !== 0
          ? { direction: signed > 0 ? "income" as const : "expense" as const, value: Math.abs(signed) }
          : null;
    if (!occurredAt || !resolved) return [];
    const counterparty = pick(row, ["контрагент", "получатель", "плательщик"]) || null;
    const documentRef = pick(row, ["номер документа", "№ документа", "документ"]) || null;
    const purpose = pick(row, ["назначение платежа", "назначение", "описание"]) || "Без назначения";
    const stable = [
      occurredAt.toISOString().slice(0, 10),
      resolved.direction,
      resolved.value,
      counterparty ?? "",
      documentRef ?? "",
      purpose,
    ].join("|");
    return [{
      importKey: createHash("sha256").update(stable).digest("hex"),
      occurredAt: occurredAt.toISOString(),
      direction: resolved.direction,
      categoryKey: resolved.direction === "income" ? "income_other_rail" : "expense_other",
      amountKopecks: resolved.value,
      taxable: false as const,
      counterparty,
      documentRef,
      note: `${purpose} · импорт из банковской выписки; классификацию и налоговый признак нужно проверить`,
    }];
  });
}

export type ReceiptImportRow = {
  invoiceId: number;
  status: string;
  reference: string | null;
  error: string | null;
};

export function parseRobokassaReceiptExport(text: string): ReceiptImportRow[] {
  return parseCsv(text).flatMap((row) => {
    const invoiceId = Number(pick(row, ["invid", "invoice", "номер счета", "номер заказа", "счет"]));
    const status = pick(row, ["receiptstatus", "статус чека", "фискальный статус", "статус"]);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0 || !status) return [];
    return [{
      invoiceId,
      status: status.slice(0, 160),
      reference: (pick(row, ["receiptid", "номер чека", "фн/фд/фп", "фискальный номер"]) || null)?.slice(0, 240) ?? null,
      error: (pick(row, ["ошибка чека", "ошибка", "error"]) || null)?.slice(0, 500) ?? null,
    }];
  });
}
