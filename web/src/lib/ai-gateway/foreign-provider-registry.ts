import db from "@/lib/db";

export async function listForeignProviderRegistry() {
  return db.foreignProviderRegistry.findMany({
    orderBy: [{ providerCategory: "asc" }, { providerNameInternal: "asc" }],
  });
}

function csvCell(value: unknown) {
  const text = Array.isArray(value)
    ? value.join(";")
    : value instanceof Date
      ? value.toISOString()
      : value == null
        ? ""
        : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function foreignProviderRegistryToCsv(rows: Awaited<ReturnType<typeof listForeignProviderRegistry>>) {
  const columns = [
    "providerNameInternal",
    "providerCategory",
    "countryOrRegion",
    "role",
    "potentialDataCategories",
    "status",
    "legalBasis",
    "dpaStatus",
    "termsReviewStatus",
    "rknCrossBorderStatus",
    "lastReviewedAt",
    "updatedAt",
  ] as const;
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n");
}
