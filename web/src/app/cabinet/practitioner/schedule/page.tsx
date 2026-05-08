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
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="soft-eyebrow">Календарь практика</div>
      <h1 className="soft-h1 mt-2 mb-2">Расписание и тарифы</h1>
      <p className="text-sm mb-6" style={{ color: "var(--soft-ink-soft)" }}>
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
