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

// B333: deep-link the actual support bot with the user id as a /start payload.
const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "eterapy_bot";

export default async function CabinetSupportPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const telegramSupportUrl = userId
    ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=support_${userId}`
    : `https://t.me/${TELEGRAM_BOT_USERNAME}?start=support`;

  return (
    <main className="soft-clarity-page" data-testid="cabinet-support-page">
      <section className="soft-shell py-10 md:py-14">
        <p className="soft-eyebrow">поддержка</p>
        <h1 className="soft-h1 mt-2">Чем можем помочь?</h1>
        <p className="soft-lede mt-3 max-w-2xl">
          Найдите ответ в частых вопросах или выберите тему — подскажем самый быстрый способ связаться.
          Прямой адрес: <a href="mailto:support@eterapy.com" className="soft-italic underline">support@eterapy.com</a>.
        </p>

        {/* B464 IB6 (owner round-3 #8): Apple-style search gate → FAQ → escalation
            gated by problem type (live chat only for the six sensitive topics). */}
        <SupportHelpCenter telegramSupportUrl={telegramSupportUrl} showChat={!!userId} />

        <div className="soft-card mt-8 p-6" style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)" }}>
          <p className="soft-eyebrow">если сейчас тяжело</p>
          <h2 className="soft-h3 mt-2">ETerapy — не для острых кризисов</h2>
          <p className="mt-3 text-sm text-[var(--soft-ink-soft)]">
            Если есть мысли о самоповреждении или угроза жизни — позвоните на бесплатную линию психологической
            помощи <strong>8-800-2000-122</strong> (круглосуточно) или <strong>112</strong>.
            Мы тоже автоматически переключим сценарий разбора на экстренную поддержку, если увидим признаки кризиса.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
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
