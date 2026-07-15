import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { mainUrl } from "@/lib/subdomain";
import { noIndexRobots } from "@/lib/seo";
import { SupportHelpCenter } from "@/components/support/support-help-center";

export const metadata: Metadata = {
  title: "Поддержка — кабинет ETerapy",
  robots: noIndexRobots,
};

export default async function CabinetSupportPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  return (
    <main className="soft-clarity-page" data-testid="cabinet-support-page">
      <section className="soft-shell py-10 md:py-14">
        {/* B464 IB6 + round-4 #18: the search card IS the hero («Центр
            поддержки») — search gate → theme suggestions → escalation gated by
            problem type (live chat only for the six sensitive topics). */}
        <SupportHelpCenter showChat={!!userId} />

        <div className="soft-card mt-8 p-6" style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)" }}>
          <p className="soft-eyebrow">если сейчас тяжело</p>
          <h2 className="soft-h3 mt-2">ETerapy — не для острых кризисов</h2>
          <p className="mt-3 text-sm text-[var(--soft-ink-soft)]">
            Если есть мысли о самоповреждении или угроза жизни — позвоните на бесплатную линию психологической
            помощи <strong>8-800-2000-122</strong> (круглосуточно) или <strong>112</strong>.
            Мы тоже автоматически переключим сценарий разбора на экстренную поддержку, если увидим признаки кризиса.
          </p>
        </div>

        {/* Round-6 #2: no bare support-email line — почта живёт ТОЛЬКО в
            эскалационной карточке staged-флоу (после выбора категории). */}
        <div className="mt-6 flex flex-wrap gap-3">
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
