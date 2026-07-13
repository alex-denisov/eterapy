export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { getActivePractitionerPlanKey } from "@/lib/practitioner-entitlements";
import { practitionerTierBadge, practitionerTierFromPlanKey } from "@/lib/practitioner-tier";
import { ActiveTariffsEditor } from "./active-tariffs-editor";
import { ServicesDirectionsEditor } from "./services-directions-editor";
import { PractitionerServicesEditorMobile } from "./services-editor-mobile";

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

  if (!practitioner) redirect(appUrl("/practitioner"));

  const activeRates = practitioner.priceRates.length > 0
    ? practitioner.priceRates
    : [{
        id: "default-session",
        durationMin: practitioner.sessionDuration,
        priceRub: practitioner.pricePerSession,
        enabled: true,
      }];
  const commissionPercent = practitioner.commissionPercent ?? 35;
  const activeCount = activeRates.filter((rate) => rate.enabled).length;

  const planKey = await getActivePractitionerPlanKey(session.user!.id);
  const tierBadge = practitionerTierBadge(practitionerTierFromPlanKey(planKey));

  // «Как считается выплата» — на базовой цене сессии (иллюстрация выплаты).
  const payoutPrice = practitioner.pricePerSession;
  const payoutNet = payoutPrice - Math.round((payoutPrice * commissionPercent) / 100);

  const taxonomy = {
    categories: practitioner.categories,
    directions: practitioner.directions,
    tags: practitioner.tags,
    formats: practitioner.formats,
  };

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 mockup practitioner-more-services: pcab-редактор
          таксономии (специализация → направления → темы) + форматов. */}
      <PractitionerServicesEditorMobile
        backHref={appUrl("/practitioner/more")}
        initialData={taxonomy}
      />

      {/* ДЕСКТОП — B466 R9-5, 1-в-1 mockup practitioner-desktop-services-v2:
          форматы приёма (on/off) + направления + «Как считается выплата». */}
      <div className="hidden max-w-5xl p-6 md:block md:p-8" data-testid="practitioner-services-desktop">
        <div className="mb-7">
          <p className="soft-eyebrow">Практика</p>
          <h1 className="soft-h1 mt-2">Услуги</h1>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Форматы приёма и направления работы. Клиенты видят их в вашей карточке и при записи.
          </p>
        </div>

        <div className="grid items-start gap-[18px] lg:grid-cols-[1.6fr_1fr]">
          <section className="soft-card p-5 md:p-6">
            <p className="soft-eyebrow mb-4">Форматы приёма · {activeCount} активных</p>
            <ActiveTariffsEditor
              practitionerId={practitioner.id}
              initialRates={activeRates.map((rate) => ({
                id: rate.id,
                durationMin: rate.durationMin,
                priceRub: rate.priceRub,
                enabled: rate.enabled,
              }))}
              commissionPercent={commissionPercent}
              readOnly={practitioner.priceRates.length === 0}
            />
          </section>

          <div className="flex flex-col gap-[18px]">
            <section className="soft-card p-5 md:p-6">
              <p className="soft-eyebrow mb-3.5">Направления работы · {practitioner.directions.length}</p>
              <ServicesDirectionsEditor initial={taxonomy} />
              <p className="mt-3.5 text-[11.5px] leading-relaxed text-[var(--soft-ink-faint)]">
                Направления помогают клиентам найти вас в каталоге по запросу. Отражают ваши компетенции
                из верификации.
              </p>
            </section>

            <section className="soft-card p-5 md:p-6" data-testid="practitioner-payout-card">
              <p className="soft-eyebrow mb-3.5">Как считается выплата</p>
              <div className="flex justify-between gap-3 py-2.5 text-[13px]">
                <span className="text-[var(--soft-ink-soft)]">Цена сессии</span>
                <span className="font-semibold text-[var(--soft-ink)]">
                  {payoutPrice.toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--soft-paper-deep)] py-2.5 text-[13px]">
                <span className="text-[var(--soft-ink-soft)]">Комиссия платформы · тариф {tierBadge}</span>
                <span className="font-semibold text-[var(--soft-ink)]">−{commissionPercent}%</span>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--soft-paper-deep)] py-2.5 text-[13px]">
                <span className="text-[var(--soft-ink-soft)]">Вы получаете</span>
                <span className="font-semibold text-[var(--soft-bordeaux)]">
                  ≈ {payoutNet.toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--soft-ink-faint)]">
                Комиссия зависит от тарифа. На PRO+ она ниже. Выплаты — по подтверждённым реквизитам
                в разделе «Финансы».
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
