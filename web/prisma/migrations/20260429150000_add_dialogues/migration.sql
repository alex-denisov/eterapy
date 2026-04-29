-- CreateEnum
CREATE TYPE "DialogueStatus" AS ENUM ('OPEN', 'AWAITING_USER', 'PROCESSING', 'ANSWERED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "DialogueMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "dialogues" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "guest_session_id" TEXT,
    "status" "DialogueStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "difficulty" TEXT,
    "safety_level" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dialogues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialogue_messages" (
    "id" TEXT NOT NULL,
    "dialogue_id" TEXT NOT NULL,
    "role" "DialogueMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dialogue_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dialogues_user_id_updated_at_idx" ON "dialogues"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "dialogues_guest_session_id_updated_at_idx" ON "dialogues"("guest_session_id", "updated_at");

-- CreateIndex
CREATE INDEX "dialogues_status_updated_at_idx" ON "dialogues"("status", "updated_at");

-- CreateIndex
CREATE INDEX "dialogue_messages_dialogue_id_created_at_idx" ON "dialogue_messages"("dialogue_id", "created_at");

-- AddForeignKey
ALTER TABLE "dialogues" ADD CONSTRAINT "dialogues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialogue_messages" ADD CONSTRAINT "dialogue_messages_dialogue_id_fkey" FOREIGN KEY ("dialogue_id") REFERENCES "dialogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
