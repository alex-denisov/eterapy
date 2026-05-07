import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const [user, dialogues, productResults, clarityRoutes, dailyCards, bookings, notifications] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        provider: true,
        registrationChannel: true,
        birthDate: true,
        birthTime: true,
        birthPlace: true,
        timezone: true,
        maritalStatus: true,
        occupation: true,
        aiGoals: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        blockedAt: true,
      },
    }),
    db.dialogue.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        topic: true,
        difficulty: true,
        safetyLevel: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: { role: true, content: true, createdAt: true },
        },
      },
    }),
    db.productResult.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        productKey: true,
        status: true,
        title: true,
        previewText: true,
        resultText: true,
        savedAt: true,
        exportedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.clarityRoute.findMany({
      where: { userId, status: { not: "CANCELLED" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        currentDay: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    }),
    db.dailyCard.findMany({
      where: { userId },
      orderBy: { cardDate: "desc" },
      select: {
        id: true,
        cardDate: true,
        title: true,
        body: true,
        prompt: true,
        sharedAt: true,
        createdAt: true,
      },
    }),
    db.booking.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        priceRub: true,
        createdAt: true,
        updatedAt: true,
        practitioner: { select: { user: { select: { name: true } } } },
      },
    }),
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        event: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  return Response.json({
    exportedAt: new Date().toISOString(),
    user,
    dialogues,
    productResults,
    clarityRoutes,
    dailyCards,
    bookings,
    notifications,
  }, {
    headers: {
      "Content-Disposition": "attachment; filename=\"eterapy-personal-data.json\"",
      "Cache-Control": "no-store",
    },
  });
}
