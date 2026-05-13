export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

export default async function PractitionerServicesPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    include: {
      priceRates: { orderBy: { durationMin: "asc" } },
    },
  });

  if (!practitioner) redirect(appUrl("/cabinet/practitioner"));

  const activeRates = practitioner.priceRates.length > 0
    ? practitioner.priceRates
    : [{
        id: "default-session",
        durationMin: practitioner.sessionDuration,
        priceRub: practitioner.pricePerSession,
        enabled: true,
      }];
  const commissionPercent = practitioner.commissionPercent ?? 25;

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="soft-eyebrow">услуги практика</p>
          <h1 className="soft-h1 mt-2">Услуги и цены</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Форматы, которые видит клиент при записи. Цена встречи не участвует в скидках и оплачивается отдельно
            от цифровых продуктов ETerapy.
          </p>
        </div>
        <Link href={appUrl("/cabinet/practitioner/schedule")} className="soft-button soft-button-primary">
          Настроить расписание
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="soft-card p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="soft-eyebrow">активные тарифы</p>
            <span className="soft-badge soft-badge-warm">{activeRates.filter((rate) => rate.enabled).length} активно</span>
          </div>
          <div className="grid gap-3">
            {activeRates.map((rate) => {
              const net = rate.priceRub - Math.round(rate.priceRub * commissionPercent / 100);
              return (
                <article
                  key={rate.id}
                  className="soft-card-flat flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                  style={{ opacity: rate.enabled ? 1 : 0.62 }}
                >
                  <div className="flex items-start gap-4">
                    <span className={`mt-1 h-5 w-9 rounded-full border ${rate.enabled ? "border-[var(--soft-terracotta)] bg-[var(--soft-apricot)]" : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]"}`}>
                      <span
                        className="block h-4 w-4 rounded-full bg-[var(--soft-paper-card)] shadow-sm"
                        style={{ transform: rate.enabled ? "translate(18px, 1px)" : "translate(1px, 1px)" }}
                      />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-[var(--soft-ink)]">Индивидуальная сессия</h2>
                        <span className="soft-badge soft-badge-lilac text-[11px]">{rate.durationMin} мин</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                        Онлайн · клиент видит цену до записи · чистыми после комиссии: {net.toLocaleString("ru-RU")} ₽
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <p className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">
                      {rate.priceRub.toLocaleString("ru-RU")} ₽
                    </p>
                    <Link href={appUrl("/cabinet/practitioner/schedule")} className="soft-chip">
                      Изменить
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="grid gap-4">
          <section className="soft-card p-5" style={{ background: "linear-gradient(160deg, #f4d9c1, #fff0df)" }}>
            <p className="soft-eyebrow">комиссия платформы</p>
            <p className="font-heading mt-3 text-4xl font-semibold text-[var(--soft-bordeaux)]">{commissionPercent}%</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Удерживается только с проведённых встреч. Цифровые продукты и кредиты ясности не уменьшают цену вашей
              сессии.
            </p>
          </section>

          <section className="soft-card p-5" style={{ background: "linear-gradient(140deg, #dbd3ea, #f4d5c8)" }}>
            <p className="soft-eyebrow">совместный формат</p>
            <h2 className="soft-h3 mt-3">Эзотерик + психотерапевт</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Пилотный формат виден в каталоге ожидания. Участие подтверждается вручную, без автоматического снижения
              вашей ставки.
            </p>
            <Link href={mainUrl("/joint")} className="soft-chip mt-4">
              Посмотреть формат →
            </Link>
          </section>
        </aside>
      </div>

      <section className="soft-card mt-4 p-5 md:p-6">
        <p className="soft-eyebrow">правила витрины</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["Прозрачная цена", "Клиент видит стоимость до записи, без скрытых доплат."],
            ["Без скидок на встречи", "Подписки и кредиты применяются только к цифровым продуктам."],
            ["Этическая рамка", "Нельзя обещать гарантированный результат или давить срочностью."],
          ].map(([title, text]) => (
            <div key={title} className="soft-card-flat p-4">
              <h3 className="font-semibold text-[var(--soft-bordeaux)]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-5 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-ink-soft)]">
        Изменение тарифов сейчас проходит через расписание и поддержку, чтобы не ломать уже созданные записи.
        Следующим блоком будет безопасное редактирование услуг с аудитом изменений.
      </div>
    </div>
  );
}
