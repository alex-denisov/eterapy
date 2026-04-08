/**
 * Seed missing price rates for existing practitioners.
 * Ensures all 6 durations (15, 30, 45, 60, 90, 120) exist.
 * Run: npx tsx prisma/seed-rates.ts
 */
import db from "../src/lib/db";

const ALL_DURATIONS = [15, 30, 45, 60, 90, 120];
// Default prices (can be adjusted)
const DEFAULT_PRICES: Record<number, number> = {
  15: 1500,
  30: 2500,
  45: 3500,
  60: 4500,
  90: 6000,
  120: 8000,
};

async function main() {
  const practitioners = await db.practitioner.findMany({
    include: { priceRates: true },
  });

  let created = 0;
  for (const p of practitioners) {
    const existingDurations = new Set(p.priceRates.map(r => r.durationMin));
    for (const dur of ALL_DURATIONS) {
      if (!existingDurations.has(dur)) {
        // Use first existing rate price as fallback, or default
        const firstRate = p.priceRates[0];
        const priceRub = firstRate?.priceRub ?? DEFAULT_PRICES[dur];
        await db.priceRate.upsert({
          where: {
            practitionerId_durationMin: { practitionerId: p.id, durationMin: dur },
          },
          create: { practitionerId: p.id, durationMin: dur, priceRub, enabled: false },
          update: {},
        });
        created++;
        console.log(`Created ${dur}min rate for practitioner ${p.id} at ${priceRub}₽`);
      }
    }
  }

  console.log(`Done. Created ${created} missing rate(s) for ${practitioners.length} practitioner(s).`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
