import db from "../src/lib/db";

const DURATIONS = [
  { durationMin: 15,  priceRub: 800  },
  { durationMin: 30,  priceRub: 1500 },
  { durationMin: 45,  priceRub: 2000 },
  { durationMin: 60,  priceRub: 2500 },
  { durationMin: 90,  priceRub: 3500 },
  { durationMin: 120, priceRub: 4500 },
];

// Стандартное расписание: пн-пт 10:00-20:00, сб 11:00-17:00
const SCHEDULE = [
  { dayOfWeek: 1, startHour: 10, endHour: 20 }, // пн
  { dayOfWeek: 2, startHour: 10, endHour: 20 }, // вт
  { dayOfWeek: 3, startHour: 10, endHour: 20 }, // ср
  { dayOfWeek: 4, startHour: 10, endHour: 20 }, // чт
  { dayOfWeek: 5, startHour: 10, endHour: 20 }, // пт
  { dayOfWeek: 6, startHour: 11, endHour: 17 }, // сб
];

async function main() {
  const practitioners = await db.practitioner.findMany({ select: { id: true, pricePerSession: true } });
  console.log(`Seeding ${practitioners.length} practitioners...`);

  for (const p of practitioners) {
    // Тарифы — цены пропорционально pricePerSession (цена за 60 мин)
    const base = p.pricePerSession;
    const rates = DURATIONS.map(d => ({
      practitionerId: p.id,
      durationMin: d.durationMin,
      // Пропорционально + небольшой дисконт за короткие
      priceRub: d.durationMin === 60 ? base
        : Math.round(base * d.durationMin / 60 / 100) * 100,
      enabled: true,
    }));

    for (const rate of rates) {
      await db.priceRate.upsert({
        where: { practitionerId_durationMin: { practitionerId: p.id, durationMin: rate.durationMin } },
        create: rate,
        update: { priceRub: rate.priceRub, enabled: true },
      });
    }

    // Расписание
    for (const rule of SCHEDULE) {
      await db.scheduleRule.upsert({
        where: { practitionerId_dayOfWeek: { practitionerId: p.id, dayOfWeek: rule.dayOfWeek } },
        create: { practitionerId: p.id, ...rule, startMinute: 0, endMinute: 0, enabled: true },
        update: { startHour: rule.startHour, endHour: rule.endHour, enabled: true },
      });
    }
    console.log(`  ✓ ${p.id}: ${rates.length} rates, ${SCHEDULE.length} schedule rules`);
  }
}
main().catch(console.error);
