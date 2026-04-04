-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('AVATAR', 'DOCUMENT', 'REPORT');

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "path" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_files_userId_kind_idx" ON "stored_files"("userId", "kind");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
