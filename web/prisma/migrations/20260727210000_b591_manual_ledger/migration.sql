-- B591: ручные приходы и расходы вне платёжного рельса.
CREATE TABLE "ip_ledger_entries" (
    "id" TEXT NOT NULL,
    "occurred_at" DATE NOT NULL,
    "direction" TEXT NOT NULL,
    "category_key" TEXT NOT NULL,
    "amount_kopecks" INTEGER NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "counterparty" TEXT,
    "document_ref" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ip_ledger_entries_occurred_at_idx" ON "ip_ledger_entries"("occurred_at");
CREATE INDEX "ip_ledger_entries_direction_occurred_at_idx" ON "ip_ledger_entries"("direction", "occurred_at");
