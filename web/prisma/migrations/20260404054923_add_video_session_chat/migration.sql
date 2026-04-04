-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('WAITING', 'ACTIVE', 'ENDED', 'RECORDING');

-- CreateTable
CREATE TABLE "video_sessions" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'WAITING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "recordingUrl" TEXT,
    "recordingExpiry" TIMESTAMP(3),
    "transcriptText" TEXT,
    "summaryText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "videoSessionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_sessions_bookingId_key" ON "video_sessions"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "video_sessions_roomName_key" ON "video_sessions"("roomName");

-- CreateIndex
CREATE INDEX "video_sessions_bookingId_idx" ON "video_sessions"("bookingId");

-- CreateIndex
CREATE INDEX "chat_messages_videoSessionId_createdAt_idx" ON "chat_messages"("videoSessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_videoSessionId_fkey" FOREIGN KEY ("videoSessionId") REFERENCES "video_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
