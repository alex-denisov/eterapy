-- B703 — семь коннекторов LLM на бесплатных тарифах.
--
-- `IF NOT EXISTS` намеренно: миграция догоняет базы, где значение уже могло
-- появиться через прогон на стенде. Значения enum в PostgreSQL нельзя
-- добавлять внутри транзакции вместе с их использованием, поэтому здесь
-- только ALTER TYPE и ничего больше.
ALTER TYPE "AIProvider" ADD VALUE IF NOT EXISTS 'KILOCODE';
ALTER TYPE "AIProvider" ADD VALUE IF NOT EXISTS 'NVIDIA';
ALTER TYPE "AIProvider" ADD VALUE IF NOT EXISTS 'OPENCODE_ZEN';
ALTER TYPE "AIProvider" ADD VALUE IF NOT EXISTS 'TOKENROUTER';
ALTER TYPE "AIProvider" ADD VALUE IF NOT EXISTS 'SAMBANOVA';
ALTER TYPE "AIProvider" ADD VALUE IF NOT EXISTS 'POLLINATIONS';
ALTER TYPE "AIProvider" ADD VALUE IF NOT EXISTS 'HUGGINGFACE';
