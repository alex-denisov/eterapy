import db from "../src/lib/db";

async function main() {
  const prac = await db.practitioner.findUnique({ where: { userId: "test-practitioner-001" } });
  if (!prac) { console.error("Practitioner not found"); return; }

  // Удаляем старые свободные слоты
  const deleted = await db.timeSlot.deleteMany({ where: { practitionerId: prac.id, available: true } });
  console.log(`Deleted ${deleted.count} old slots`);

  // Добавляем слоты на следующую неделю
  const now = new Date();
  const slots = [];
  for (let day = 1; day <= 7; day++) {
    for (const hour of [10, 14, 16]) {
      const start = new Date(now);
      start.setDate(start.getDate() + day);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setHours(hour + 1);
      slots.push({ practitionerId: prac.id, startAt: start, endAt: end, available: true });
    }
  }

  await db.timeSlot.createMany({ data: slots });
  console.log(`Created ${slots.length} slots for practitioner ${prac.id}`);
}
main().catch(console.error);
