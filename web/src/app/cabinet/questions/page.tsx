import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Trash2 } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { loginUrl, mainUrl } from "@/lib/subdomain";

const STATUS_LABELS: Record<string, string> = {
  AWAITING_USER: "ждет уточнения",
  PROCESSING: "в обработке",
  ANSWERED: "есть ответ",
  SAFETY_INTERRUPTED: "экстренная поддержка",
  ARCHIVED: "архив",
  OPEN: "открыт",
};

async function deleteQuestion(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.dialogue.updateMany({
    where: {
      id,
      userId: session.user.id,
      deletedAt: null,
    },
    data: {
      status: "DELETED",
      deletedAt: new Date(),
    },
  });
  revalidatePath("/cabinet/questions");
  revalidatePath("/cabinet");
}

export default async function CabinetQuestionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());

  const dialogues = await db.dialogue.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
    },
    orderBy: [
      { updatedAt: "desc" },
      { id: "desc" },
    ],
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      topic: true,
      difficulty: true,
      updatedAt: true,
      _count: { select: { messages: true, productResults: true, clarityRoutes: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6" data-testid="client-questions-page">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="soft-eyebrow">История разборов</p>
          <h1 className="soft-h1 mt-2">Все сохраненные вопросы</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Здесь собраны ваши вопросы и первичные ответы. Можно вернуться к диалогу,
            продолжить уточнения или удалить вопрос из кабинета.
          </p>
        </div>
        <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary w-full sm:w-auto">
          Новый вопрос
        </Link>
      </div>

      {dialogues.length === 0 ? (
        <section className="soft-card p-8 text-center">
          <MessageCircle className="mx-auto size-9 text-[var(--soft-terracotta-dark)]" />
          <h2 className="soft-h3 mt-4">Пока нет сохраненных вопросов</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Начните с короткого вопроса. После ответа он появится здесь и в вашей карте.
          </p>
          <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary mt-5">
            Задать вопрос
          </Link>
        </section>
      ) : (
        <div className="space-y-3">
          {dialogues.map((dialogue) => (
            <article key={dialogue.id} className="soft-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="soft-chip soft-chip-warm">{STATUS_LABELS[dialogue.status] ?? dialogue.status.toLowerCase()}</span>
                  {dialogue.topic && <span className="soft-chip">{dialogue.topic}</span>}
                  {dialogue.difficulty && <span className="soft-chip">{dialogue.difficulty}</span>}
                </div>
                <h2 className="mt-3 font-heading text-2xl font-medium text-[var(--soft-ink)]">
                  {dialogue.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--soft-ink-faint)]">
                  Обновлено {dialogue.updatedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                  {" · "}
                  {dialogue._count.messages} сообщений
                  {dialogue._count.productResults > 0 && ` · ${dialogue._count.productResults} результатов`}
                  {dialogue._count.clarityRoutes > 0 && ` · ${dialogue._count.clarityRoutes} маршрутов`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href={mainUrl(`/checkin?dialogueId=${dialogue.id}`)} className="soft-button soft-button-ghost">
                  Открыть
                </Link>
                <form action={deleteQuestion}>
                  <input type="hidden" name="id" value={dialogue.id} />
                  <button type="submit" className="soft-button soft-button-ghost text-[var(--soft-bordeaux)]">
                    <Trash2 className="size-4" />
                    Удалить
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
