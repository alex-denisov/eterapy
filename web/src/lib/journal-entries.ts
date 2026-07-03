import db from "@/lib/db";
import { dailyCardBeats, dailyCardUserQuestion } from "@/lib/daily-card";
import { log, serializeError } from "@/lib/logger";

// B464 IB2 (owner #1) — the private journaling history: EVERY completed
// practice day (round-4 #12: the principle is «день, когда вы ответили на
// вопрос дня»). A day the user wrote their own question shows that question;
// a day completed off the suggested prompt shows the prompt. «виден только вам».

export interface JournalEntry {
  id: string;
  date: Date;
  question: string;
  /** true when the user wrote their own вопрос дня (vs the suggested prompt). */
  own: boolean;
  perspective: string | null;
  step: string | null;
}

export interface JournalCardRow {
  id: string;
  cardDate: Date;
  prompt: string;
  metadata: unknown;
}

// Pure: map every completed practice day; user-authored question wins over the
// suggested prompt. Unit-testable without a DB.
export function toJournalEntries(rows: ReadonlyArray<JournalCardRow>): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const row of rows) {
    const userQuestion = dailyCardUserQuestion(row.metadata);
    const question = userQuestion ?? row.prompt.trim();
    if (!question) continue;
    const beats = dailyCardBeats(row.metadata);
    entries.push({
      id: row.id,
      date: row.cardDate,
      question,
      own: Boolean(userQuestion),
      perspective: beats.perspective,
      step: beats.step,
    });
  }
  return entries;
}

export async function listJournalEntries(userId: string, limit = 60): Promise<JournalEntry[]> {
  try {
    const rows = await db.dailyCard.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { cardDate: "desc" },
      take: limit,
      select: { id: true, cardDate: true, prompt: true, metadata: true },
    });
    return toJournalEntries(rows);
  } catch (error) {
    log.warn("journal.entries_fallback", { error: serializeError(error) });
    return [];
  }
}
