import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { SlotManagerFull } from "./slot-manager-full";

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

  const slots = await db.timeSlot.findMany({
    where: { practitionerId: practitioner.id },
    orderBy: { startAt: "asc" },
    take: 50,
  });

  return (
    <div className="px-6 py-8 max-w-3xl">
      <h1 className="font-heading text-2xl font-bold mb-2">Расписание</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Добавляйте доступные слоты — клиенты смогут выбрать удобное время на вашем профиле.
      </p>
      <SlotManagerFull practitionerId={practitioner.id} initialSlots={slots} />
    </div>
  );
}
