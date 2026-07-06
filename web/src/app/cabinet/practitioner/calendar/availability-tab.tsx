import db from "@/lib/db";
import { mainUrl } from "@/lib/subdomain";
import { AvailabilityClient } from "./availability-client";

// B466 — «Календарь → Доступность» (mockup -calendar-availability): рабочие
// часы (weekly grid + точечные блокировки) + «Цены за сессию» (owner-фикс #1:
// стоимость здесь НЕ редактируется — только вкл/выкл длительности) + личная
// ссылка для записи.

export async function AvailabilityTab({ practitionerId }: { practitionerId: string }) {
  const [rules, rates, practitioner] = await Promise.all([
    db.scheduleRule.findMany({ where: { practitionerId }, orderBy: { dayOfWeek: "asc" } }),
    db.priceRate.findMany({ where: { practitionerId }, orderBy: { durationMin: "asc" } }),
    db.practitioner.findUnique({ where: { id: practitionerId }, select: { slug: true } }),
  ]);

  const bookingUrl = practitioner?.slug ? mainUrl(`/practitioners/${practitioner.slug}`) : mainUrl("/practitioners");

  return (
    <AvailabilityClient
      practitionerId={practitionerId}
      initialRules={rules.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startHour: r.startHour,
        startMinute: r.startMinute,
        endHour: r.endHour,
        endMinute: r.endMinute,
        enabled: r.enabled,
      }))}
      initialRates={rates.map((r) => ({ durationMin: r.durationMin, priceRub: r.priceRub, enabled: r.enabled }))}
      bookingUrl={bookingUrl}
    />
  );
}
