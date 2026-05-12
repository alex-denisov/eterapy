import Link from "next/link";
import { ArrowRight, Bell, MessageCircle, ShieldCheck } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { getTelegramStartUrl, TELEGRAM_GROWTH_ENTRIES } from "@/lib/telegram-growth";

export const metadata = createPublicPageMetadata("/telegram");

export default function TelegramPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="telegram-page">
      <PublicJsonLd route="/telegram" />
      <section className="soft-shell py-12 md:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="soft-eyebrow">telegram</p>
          <h1 className="soft-display mt-4">
            Ясность там, где <span className="soft-italic">вы уже пишете</span>
          </h1>
          <p className="soft-lede mx-auto mt-6 max-w-2xl">
            Карта дня, мягкие напоминания и быстрый вход в диалог. Telegram —
            канал поддержки, а не единственная точка доступа к ETerapy.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={getTelegramStartUrl("dialogue")} className="soft-button soft-button-primary" data-testid="telegram-bot-link">
              Открыть Telegram
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <Link href="/cabinet/settings" className="soft-button soft-button-ghost">
              Настроить уведомления
            </Link>
          </div>
        </div>
      </section>
      <section className="soft-shell soft-public-section pb-20">
        <div className="mb-8">
          <p className="soft-eyebrow">точки входа</p>
          <div className="mt-4 grid gap-3 md:grid-cols-4" data-testid="telegram-growth-deeplinks">
            {TELEGRAM_GROWTH_ENTRIES.map((entry) => (
              <a key={entry.key} href={getTelegramStartUrl(entry.startPayload)} className="soft-card p-4 transition-transform hover:-translate-y-0.5">
                <h2 className="soft-h3 text-base">{entry.label}</h2>
                <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{entry.description}</p>
              </a>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: MessageCircle, title: "Быстрый вход", text: "Ссылка из Telegram ведёт в нужный сценарий с attribution." },
            { icon: Bell, title: "Тихие часы", text: "Напоминания уважают preference center и не дублируются без причины." },
            { icon: ShieldCheck, title: "Фейловер каналов", text: "Если Telegram недоступен, web/email продолжают работать по настройкам." },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="soft-card p-6">
                <Icon className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                <h2 className="soft-h3 mt-4">{item.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
