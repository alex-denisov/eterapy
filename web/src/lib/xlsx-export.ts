import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";

export type XlsxExportSheet = {
  name: string;
  rows: Record<string, unknown>[];
  emptyRow?: Record<string, unknown>;
};

function cellValue(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value;
  if (typeof value === "bigint") return value.toString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sheetData(sheet: XlsxExportSheet): { data: SheetData; columns: { width: number }[] } {
  const rows = sheet.rows.length > 0
    ? sheet.rows
    : [sheet.emptyRow ?? { "Нет данных": "Нет данных за выбранный период" }];
  const headers = Object.keys(rows[0] ?? { "Нет данных": "" });
  const data: SheetData = [
    headers.map((header) => ({ value: header, fontWeight: "bold" })),
    ...rows.map((row) => headers.map((header) => cellValue(row[header]))),
  ];
  const columns = headers.map((header) => ({
    width: Math.min(48, Math.max(12, header.length + 2, ...rows.map((row) => String(row[header] ?? "").length + 2))),
  }));
  return { data, columns };
}

/** Generates XLSX only from server-owned export rows; it never parses uploads. */
export async function createXlsxExport(sheets: XlsxExportSheet[]): Promise<ArrayBuffer> {
  if (sheets.length === 0) throw new Error("At least one XLSX sheet is required");
  const buffer = await writeXlsxFile(
    sheets.map((sheet) => ({
      ...sheetData(sheet),
      sheet: sheet.name,
      stickyRowsCount: 1,
    })),
    { fontFamily: "Arial", fontSize: 10 },
  ).toBuffer();
  return Uint8Array.from(buffer).buffer;
}
