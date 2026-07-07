export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarPlus, Paperclip } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { appUrl, loginUrl } from "@/lib/subdomain";

// B478 — деталка сообщения (mockup client-message-detail): читаем материал +
// вложение; «здесь нельзя ответить — обсудите на сессии». Открытие страницы
// помечает сообщение прочитанным (readAt) — практик видит статус.

const WHEN_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

export default async function ClientMessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  guardClientCabinet(session.user.role);

  const { id } = await params;
  const message = await db.practitionerClientMessage.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      text: true,
      attachmentUrl: true,
      attachmentName: true,
      sentAt: true,
      readAt: true,
      practitioner: { select: { slug: true, user: { select: { name: true } } } },
    },
  });
  if (!message || message.clientId !== session.user.id) notFound();

  // Отметка «прочитано» — при первом открытии.
  if (!message.readAt) {
    await db.practitionerClientMessage.update({
      where: { id: message.id },
      data: { readAt: new Date() },
    }).catch(() => {});
  }

  const practitionerName = message.practitioner.user.name ?? "Ваш специалист";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="client-message-detail">
      <Link href={appUrl("/messages")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Сообщения
      </Link>
      <p className="soft-eyebrow mt-4">от специалиста</p>
      <h1 className="soft-h2 mt-2">{practitionerName}</h1>
      <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">{WHEN_FMT.format(message.sentAt)}</p>

      <section className="soft-card mt-5 p-4 sm:p-5">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.text}</p>
        {message.attachmentUrl && (
          <a
            href={message.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center gap-2.5 rounded-[12px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]/50 px-3.5 py-3 text-sm font-medium transition-colors hover:bg-[var(--soft-paper-deep)]"
            data-testid="client-message-attachment"
          >
            <Paperclip className="h-4 w-4 shrink-0 text-[var(--soft-terracotta-dark)]" />
            {message.attachmentName ?? "Вложение"}
          </a>
        )}
      </section>

      {/* Односторонний канал — ответ на сессии */}
      <section className="soft-card mt-4 p-4" data-testid="client-message-oneway-note">
        <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Здесь нельзя ответить — это материал от специалиста. Обсудить его можно на следующей сессии.
        </p>
        <Link
          href={message.practitioner.slug ? appUrl(`/bookings`) : appUrl("/bookings")}
          className="soft-button soft-button-ghost mt-3 inline-flex"
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          Мои записи
        </Link>
      </section>
    </div>
  );
}
