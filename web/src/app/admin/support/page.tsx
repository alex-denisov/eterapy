export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Mail, MessageCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { mainUrl } from "@/lib/subdomain";
import { PageContainer } from "@/components/ui/page-container";
import { SupportChat } from "@/components/support/support-chat";
import { ComplaintForm } from "@/components/support/complaint-form";

// Same support bot the client cabinet deep-links to (B333).
const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "eterapy_bot";

export default async function AdminSupportPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN", "MODERATOR"].includes(role)) redirect("/admin");

  const userId = session.user!.id;
  const telegramSupportUrl = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=support_${userId}`;

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6">
        <p className="premium-eyebrow">поддержка</p>
        <h1 className="premium-title mt-2 text-3xl md:text-4xl">Поддержка платформы</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Тот же канал связи, что и в кабинете клиента — пишите команде платформы по любым
          вопросам доступа, эскалаций или технических сбоев.
        </p>
      </div>

      <div data-testid="admin-support-page" className="max-w-3xl space-y-6">
        <div className="grid gap-4 md:grid-cols-2" data-testid="admin-support-channels">
          <div className="soft-card p-6">
            <Mail className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 className="soft-h3 mt-3">Email</h2>
            <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
              Вопросы по доступам, ролям, инцидентам и конфиденциальности.
            </p>
            <a
              href="mailto:hello@eterapy.com"
              className="soft-button soft-button-primary mt-4 h-9 px-4 text-sm"
              data-testid="admin-support-email"
            >
              hello@eterapy.com
            </a>
          </div>

          <div className="soft-card p-6">
            <MessageCircle className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 className="soft-h3 mt-3">Чат в Telegram</h2>
            <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
              Быстрые вопросы прямо в Telegram. Отвечает команда платформы.
            </p>
            <a
              href={telegramSupportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="soft-button soft-button-primary mt-4 h-9 px-4 text-sm"
              data-testid="admin-support-telegram"
            >
              Открыть бот
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <ComplaintForm />

        <div data-testid="admin-support-chat-section">
          <h2 className="soft-h3 mb-3">Чат с поддержкой</h2>
          <SupportChat />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href={mainUrl("/help")} className="soft-button soft-button-ghost h-9 px-4 text-sm">
            Все частые вопросы
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
