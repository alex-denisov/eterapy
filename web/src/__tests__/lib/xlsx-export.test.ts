import { createXlsxExport } from "@/lib/xlsx-export";

describe("XLSX export", () => {
  it("generates a ZIP-based workbook from server-owned rows", async () => {
    const output = await createXlsxExport([
      { name: "Отчёт", rows: [{ Дата: "16.07.2026", "Сумма, ₽": 1500 }] },
    ]);

    expect(output.byteLength).toBeGreaterThan(500);
    expect(Buffer.from(output.slice(0, 4)).toString("hex")).toBe("504b0304");
  });

  it("creates a valid workbook for an empty report", async () => {
    const output = await createXlsxExport([{ name: "Поступления", rows: [] }]);

    expect(output.byteLength).toBeGreaterThan(500);
  });
});
