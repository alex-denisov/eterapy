-- AlterTable
ALTER TABLE "practitioners" ADD COLUMN     "slug" TEXT NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE UNIQUE INDEX "practitioners_slug_key" ON "practitioners"("slug");
