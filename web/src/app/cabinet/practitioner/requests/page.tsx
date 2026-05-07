export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export default async function PractitionerRequestsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    include: {
      bookings: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: { client: { select: { name: true, email: true } } },
      },
    },
  }).catch(() => null);

  const requests = practitioner?.bookings ?? [];

  return (
    <div className="max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="premium-title text-3xl md:text-5xl mb-6">Заявки</h1>
      {requests.length === 0 ? (
        <div className="soft-card p-6">
          <p className="text-[var(--soft-ink-soft)]">Новых заявок пока нет.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((b) => (
            <div key={b.id} className="soft-card p-5 flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-[var(--soft-bordeaux)]">{b.client?.name ?? b.client?.email}</p>
                <p className="text-sm text-[var(--soft-ink-faint)] mt-1">
                  {new Date(b.createdAt).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <span className="soft-badge soft-badge-warm">Ожидает</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
