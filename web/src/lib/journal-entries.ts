import db from "@/lib/db";
import { dailyCardBeats, dailyCardUserQuestion } from "@/lib/daily-card";
import { log, serializeError } from "@/lib/logger";

// B464 IB2 (owner #1) — the private journaling history: past вопрос дня entries
// the user wrote, each with the LLM взгляд + шаг. Reads existing DailyCard rows;
// «виден только вам».

export interface JournalEntry {
  id: string;
  date: Date;
  question: string;
  perspective: string | null;
  step: string | null;
}

export interface JournalCardRow {
  id: string;
  cardDate: Date;
  metadata: unknown;
}

// Pure: keep only cards that carry a user-authored вопрос дня, mapping the
// stored beats. Unit-testable without a DB.
export function toJournalEntries(rows: ReadonlyArray<JournalCardRow>): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const row of rows) {
    const question = dailyCardUserQuestion(row.metadata);
    if (!question) continue;
    const beats = dailyCardBeats(row.metadata);
    entries.push({
      id: row.id,
      date: row.cardDate,
      question,
      perspective: beats.perspective,
      step: beats.step,
    });
  }
  return entries;
}

export async function listJournalEntries(userId: string, limit = 30): Promise<JournalEntry[]> {
  try {
    const rows = await db.dailyCard.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { cardDate: "desc" },
      take: limit,
      select: { id: true, cardDate: true, metadata: true },
    });
    return toJournalEntries(rows);
  } catch (error) {
    log.warn("journal.entries_fallback", { error: serializeError(error) });
    return [];
  }
}
