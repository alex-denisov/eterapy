export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { mainUrl } from "@/lib/subdomain";
import { SupportHelpCenter } from "@/components/support/support-help-center";

const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "eterapy_bot";

export default async function AdminSupportPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN", "MODERATOR"].includes(role)) redirect("/admin");

  const userId = session.user!.id;
  const telegramSupportUrl = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=support_${userId}`;

  return (
    <main className="soft-clarity-page" data-testid="admin-support-page">
      <section className="soft-shell py-8 md:py-10">
        <SupportHelpCenter telegramSupportUrl={telegramSupportUrl} showChat />

        <div className="soft-card mt-6 p-5" style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)" }}>
          <p className="soft-eyebrow">для администраторов</p>
          <h2 className="soft-h3 mt-2">Эскалации идут через тот же канал поддержки</h2>
          <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
            Так обращения клиентов, практиков и команды платформы не расходятся по разным интерфейсам и остаются в одной истории.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={mainUrl("/help")} className="soft-button soft-button-ghost h-9 px-4 text-sm">
            Все частые вопросы
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href={mainUrl("/legal/privacy")} className="soft-button soft-button-ghost h-9 px-4 text-sm">
            Политика конфиденциальности
          </Link>
          <Link href={mainUrl("/legal/offer")} className="soft-button soft-button-ghost h-9 px-4 text-sm">
            Условия использования
          </Link>
        </div>
      </section>
    </main>
  );
}
