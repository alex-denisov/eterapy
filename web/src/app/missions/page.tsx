import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Sparkles } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/missions");

const rhythm = [
  { title: "Карта дня", text: "Один вопрос на 30 секунд, чтобы заметить состояние без оценки." },
  { title: "Миссия недели", text: "Маленькое действие: написать, отложить, спросить, выбрать паузу." },
  { title: "Кредиты", text: "Бонусы начисляются только за осмысленные действия и проходят антифрод-проверку." },
];

export default function MissionsPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="missions-page">
      <PublicJsonLd route="/missions" />

      <section className="soft-shell py-12 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="soft-eyebrow">миссии</p>
            <h1 className="soft-display mt-4">
              Практика ясности <span className="soft-italic">на каждый день</span>
            </h1>
            <p className="soft-lede mt-6">
              Не марафон и не давление. Короткие вопросы, мягкие напоминания и
              маленькие шаги, которые помогают возвращаться к себе между большими разборами.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/checkin" className="soft-button soft-button-primary">
                Начать с вопроса
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/telegram" className="soft-button soft-button-ghost">
                Получать в Telegram
              </Link>
            </div>
          </div>

          <div className="soft-card p-6 md:p-8">
            <div className="flex items-center gap-3">
              <div className="soft-app-avatar grid size-12 place-items-center rounded-full">
                <Sparkles className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="soft-eyebrow">сегодня</p>
                <h2 className="soft-h3">Что вы уже знаете, но откладываете?</h2>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {["30 сек", "5 мин", "1 шаг"].map((item) => (
                <div key={item} className="rounded-[var(--soft-radius-md)] bg-[var(--soft-paper-deep)] p-4 text-center">
                  <p className="font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="soft-shell soft-public-section pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {rhythm.map((item) => (
            <article key={item.title} className="soft-card p-6">
              <CalendarDays className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <h2 className="soft-h3 mt-4">{item.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{item.text}</p>
              <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[var(--soft-bordeaux)]">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Без штрафов и публичных рейтингов
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
