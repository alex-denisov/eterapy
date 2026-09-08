-- B732: платная обложка, сгенерированная моделью, хранится в базе.
-- Байты именно в базе: флот из четырёх нод за балансировщиком, и файл,
-- записанный на диск одной ноды, отдавался бы 404 с трёх остальных.
CREATE TABLE "marketing_cover_images" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "model" TEXT NOT NULL,
    "cost_micros" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_cover_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_cover_images_key_key" ON "marketing_cover_images"("key");
CREATE INDEX "marketing_cover_images_platform_created_at_idx" ON "marketing_cover_images"("platform", "created_at");
