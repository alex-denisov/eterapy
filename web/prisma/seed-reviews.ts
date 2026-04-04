import db from "../src/lib/db";

const REVIEWS = [
  { rating: 5, text: "Очень точный расклад! Елена почувствовала ситуацию сразу, без лишних вопросов. Буду возвращаться." },
  { rating: 5, text: "Потрясающая сессия. Астрологический анализ дал мне много пищи для размышлений о текущем периоде жизни." },
  { rating: 4, text: "Хорошая консультация, есть над чем поработать. Рекомендую для тех, кто ищет ответы на сложные вопросы." },
  { rating: 5, text: "Очень профессиональный подход. Карты показали именно то, о чём я боялась думать, но что нужно было услышать." },
  { rating: 5, text: "Елена — мастер своего дела. Уже третья консультация, и каждый раз нахожу что-то новое для себя." },
];

async function main() {
  // Find test practitioner
  const practitioner = await db.practitioner.findUnique({ where: { userId: "test-practitioner-001" } });
  if (!practitioner) { console.error("Practitioner not found"); return; }

  const client = await db.user.findUnique({ where: { email: "client@test.eterapy.com" } });
  if (!client) { console.error("Client not found"); return; }

  // Check if reviews exist
  const existing = await db.review.count({ where: { practitionerId: practitioner.id } });
  if (existing > 0) { console.log(`Already ${existing} reviews`); }

  let created = 0;
  for (let i = 0; i < REVIEWS.length; i++) {
    const r = REVIEWS[i];
    // Need a booking for each review (schema has @unique bookingId)
    // Create a completed booking
    const booking = await db.booking.create({
      data: {
        clientId: client.id,
        practitionerId: practitioner.id,
        status: "COMPLETED",
        priceRub: practitioner.pricePerSession,
      },
    });

    // Check if review for this booking exists
    const rev = await db.review.findUnique({ where: { bookingId: booking.id } });
    if (!rev) {
      await db.review.create({
        data: {
          bookingId: booking.id,
          authorId: client.id,
          practitionerId: practitioner.id,
          rating: r.rating,
          text: r.text,
        },
      });
      created++;
    }
  }

  // Update denormalized counters
  const reviews = await db.review.findMany({ where: { practitionerId: practitioner.id } });
  const ratingSum = reviews.reduce((s, r) => s + r.rating, 0);
  const sessionCount = await db.booking.count({ where: { practitionerId: practitioner.id, status: "COMPLETED" } });

  await db.practitioner.update({
    where: { id: practitioner.id },
    data: {
      ratingSum,
      reviewCount: reviews.length,
      sessionCount,
    },
  });

  console.log(`Created ${created} reviews. Total: ${reviews.length}, rating: ${(ratingSum / reviews.length).toFixed(1)}, sessions: ${sessionCount}`);
}

main().catch(console.error);
