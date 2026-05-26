import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { mainUrl } from "@/lib/subdomain";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Поддержка — кабинет ETerapy",
  robots: noIndexRobots,
};

export default function CabinetSupportPage() {
  return (
    <main className="soft-clarity-page" data-testid="cabinet-support-page">
      <section className="soft-shell py-10 md:py-14">
        <p className="soft-eyebrow">поддержка</p>
        <h1 className="soft-h1 mt-2">Чем можем помочь?</h1>
        <p className="soft-lede mt-3 max-w-2xl">
          Если что-то идёт не по плану — напишите нам напрямую. Среднее время первого ответа — до 4 часов
          в будние дни. Для общих вопросов сначала посмотрите{" "}
          <Link href={mainUrl("/help")} className="soft-italic underline">страницу частых вопросов</Link>:
          в 80% случаев ответ уже там.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3" data-testid="cabinet-support-channels">
          <div className="soft-card p-6">
            <Mail className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 className="soft-h3 mt-3">Email</h2>
            <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
              Любые вопросы про оплату, доступ, конфиденциальность.
            </p>
            <a
              href="mailto:hello@eterapy.com"
              className="soft-button soft-button-primary mt-4 h-9 px-4 text-sm"
              data-testid="cabinet-support-email"
            >
              hello@eterapy.com
            </a>
          </div>

          <div className="soft-card p-6">
            <MessageCircle className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 className="soft-h3 mt-3">Чат в Telegram</h2>
            <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
              Быстрые вопросы прямо в Telegram. Отвечаем командой поддержки.
            </p>
            <Link
              href={mainUrl("/telegram")}
              className="soft-button soft-button-primary mt-4 h-9 px-4 text-sm"
              data-testid="cabinet-support-telegram"
            >
              Открыть бот
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="soft-card p-6">
            <ShieldCheck className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 className="soft-h3 mt-3">Жалоба или нарушение</h2>
            <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
              Если специалист повёл себя некорректно, оплата зависла или нарушена приватность.
            </p>
            <a
              href="mailto:safety@eterapy.com?subject=%D0%96%D0%B0%D0%BB%D0%BE%D0%B1%D0%B0"
              className="soft-button soft-button-primary mt-4 h-9 px-4 text-sm"
              data-testid="cabinet-support-safety"
            >
              safety@eterapy.com
            </a>
          </div>
        </div>

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
