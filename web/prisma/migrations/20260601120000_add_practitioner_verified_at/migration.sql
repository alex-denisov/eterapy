-- V9: record when a practitioner's verification was approved, so the cabinet
-- compliance card and the admin panel can show the verification timestamp.
ALTER TABLE "practitioners" ADD COLUMN "verifiedAt" TIMESTAMP(3);
