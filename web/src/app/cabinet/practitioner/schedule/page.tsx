export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { SchedulePageTabs } from "./schedule-tabs";
import { appUrl, loginUrl } from "@/lib/subdomain";

export default async function PractitionerSchedulePage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  });
  if (!practitioner) redirect(appUrl("/cabinet/practitioner"));

  const [rules, rates] = await Promise.all([
    db.scheduleRule.findMany({ where: { practitionerId: practitioner.id }, orderBy: { dayOfWeek: "asc" } }),
    db.priceRate.findMany({ where: { practitionerId: practitioner.id }, orderBy: { durationMin: "asc" } }),
  ]);

  return (
    <div className="max-w-6xl px-4 py-8 sm:px-6">
      <p className="premium-eyebrow">Календарь практика</p>
      <h1 className="premium-title mt-2 mb-2 text-3xl md:text-5xl">Расписание и тарифы</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Настройте рабочие часы и цены. Клиенты смогут записаться только в доступное время.
      </p>
      <SchedulePageTabs
        practitionerId={practitioner.id}
        initialRules={rules}
        initialRates={rates}
      />
    </div>
  );
}
