export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Mail, Paperclip } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

// B478 — клиентские «Сообщения» (mockup client-messages-list): односторонние
// материалы от специалиста, НЕ чат (owner: «не мессенджер»; живёт под «Ещё»).
// Ответ — на следующей сессии.

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });

export default async function ClientMessagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  guardClientCabinet(session.user.role);

  const messages = await db.practitionerClientMessage.findMany({
    where: { clientId: session.user.id },
    orderBy: { sentAt: "desc" },
    take: 100,
    select: {
      id: true,
      text: true,
      attachmentName: true,
      sentAt: true,
      readAt: true,
      practitioner: { select: { user: { select: { name: true } } } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="client-messages-page">
      <p className="soft-eyebrow">Кабинет</p>
      <h1 className="soft-h1 mt-2">Сообщения</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
        Материалы и сообщения от вашего специалиста. Ответить здесь нельзя — обсудите на следующей сессии.
      </p>

      {messages.length === 0 ? (
        <section className="soft-card mt-6 p-6 text-center" data-testid="client-messages-empty">
          <Mail className="mx-auto h-8 w-8 text-[var(--soft-ink-faint)]" />
          <p className="soft-h3 mt-3" style={{ color: "var(--soft-bordeaux)" }}>Пока нет сообщений</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            После сессий специалист может отправлять вам материалы и бережные заметки — они появятся здесь.
          </p>
          <Link href={mainUrl("/practitioners")} className="soft-button soft-button-ghost mt-5 inline-flex">
            Найти специалиста
          </Link>
        </section>
      ) : (
        <div className="mt-5 divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          {messages.map((m) => {
            const unread = !m.readAt;
            return (
              <Link
                key={m.id}
                href={appUrl(`/messages/${m.id}`)}
                className="flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
                data-testid="client-message-row"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
                  style={unread
                    ? { background: "#F6E7DD", color: "var(--soft-terracotta-dark)" }
                    : { background: "var(--soft-paper-deep)", color: "var(--soft-ink-soft)" }}
                >
                  <Mail className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={`truncate text-[13.5px] ${unread ? "font-semibold" : "font-medium"}`}>
                      {m.practitioner.user.name ?? "Ваш специалист"}
                    </span>
                    {unread && (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--soft-terracotta)" }} aria-label="Непрочитано" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-faint)]">
                    {m.text.slice(0, 90)}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--soft-ink-faint)]">
                    {DAY_FMT.format(m.sentAt)}
                    {m.attachmentName && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        вложение
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
