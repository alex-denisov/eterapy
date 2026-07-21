-- B423: Robokassa needs a numeric, shop-unique invoice number (`InvId`).
-- A dedicated sequence-backed column gives us one that is allocated at row
-- creation, so the payment link can be signed with it and a retried checkout
-- reuses the same InvId instead of creating a second payment.
ALTER TABLE "transactions" ADD COLUMN "invoice_id" SERIAL;

CREATE UNIQUE INDEX "transactions_invoice_id_key" ON "transactions"("invoice_id");
