import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { WeekCalendar } from "@/components/schedule/week-calendar";
import { ScheduleSettings } from "@/components/schedule/schedule-settings";
import { PriceRatesEditor } from "@/components/schedule/price-rates-editor";
import { SchedulePageTabs } from "./schedule-tabs";

export default async function PractitionerSchedulePage() {
  const session = await auth();
  if (!session) redirect("/login");
  // @ts-expect-error custom
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  });
  if (!practitioner) redirect("/cabinet/practitioner");

  const [rules, rates] = await Promise.all([
    db.scheduleRule.findMany({ where: { practitionerId: practitioner.id }, orderBy: { dayOfWeek: "asc" } }),
    db.priceRate.findMany({ where: { practitionerId: practitioner.id }, orderBy: { durationMin: "asc" } }),
  ]);

  return (
    <div className="px-6 py-8 max-w-5xl">
      <h1 className="font-heading text-2xl font-bold mb-2">Расписание и тарифы</h1>
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
