import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { dialogueTopicLabelRu, dialogueStatusLabelRu } from "@/lib/dialogue-router";
import { loginUrl, mainUrl } from "@/lib/subdomain";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { QuestionsList, type QuestionItem } from "./questions-list";

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
  guardClientCabinet(session.user.role); // Y6: client-only surface

  const dialogues = await db.dialogue.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
    },
    orderBy: [
      { updatedAt: "desc" },
      { id: "desc" },
    ],
    take: 200,
    select: {
      id: true,
      title: true,
      status: true,
      topic: true,
      updatedAt: true,
      _count: { select: { messages: true, productResults: true, clarityRoutes: true } },
    },
  });

  // T18: precompute Russian labels + href server-side so the client list never
  // imports server-only modules (dialogue-router pulls in the AI gateway) and
  // never shows raw enum values ("self" / "answered"). The difficulty chip
  // ("low"/"medium") was an internal routing signal with no user meaning — it
  // is dropped entirely here.
  const items: QuestionItem[] = dialogues.map((dialogue) => ({
    id: dialogue.id,
    title: dialogue.title,
    status: dialogue.status,
    statusLabel: dialogueStatusLabelRu(dialogue.status),
    topic: dialogue.topic ?? "other",
    topicLabel: dialogueTopicLabelRu(dialogue.topic),
    href: mainUrl(`/checkin?dialogueId=${dialogue.id}`),
    updatedAtMs: dialogue.updatedAt.getTime(),
    updatedLabel: dialogue.updatedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }),
    messages: dialogue._count.messages,
    productResults: dialogue._count.productResults,
    clarityRoutes: dialogue._count.clarityRoutes,
  }));

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
          Начать диалог
        </Link>
      </div>

      {items.length === 0 ? (
        <section className="soft-card p-8 text-center">
          <MessageCircle className="mx-auto size-9 text-[var(--soft-terracotta-dark)]" />
          <h2 className="soft-h3 mt-4">Пока нет сохраненных вопросов</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Начните с короткого вопроса. После ответа он появится здесь и в вашей карте.
          </p>
          <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary mt-5">
            Начать диалог
          </Link>
        </section>
      ) : (
        <QuestionsList items={items} deleteAction={deleteQuestion} />
      )}
    </div>
  );
}
