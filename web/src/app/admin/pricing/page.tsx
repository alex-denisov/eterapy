export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getAllSettings } from "@/lib/platform-settings";
import { PricingEditor } from "./pricing-editor";

export default async function AdminPricingPage() {
  const session = await auth();
  if (!session || session.user?.role !== "SUPERADMIN") redirect("/admin");

  const [settings, practitioners] = await Promise.all([
    getAllSettings(),
    db.practitioner.findMany({
      include: {
        user: { select: { name: true, email: true } },
        priceRates: { orderBy: { durationMin: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="px-6 py-8 max-w-4xl">
      <h1 className="font-heading text-2xl font-bold mb-2">Цены и тарифы</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Управление тарифными планами, комиссией и ценами практиков.
        Изменения применяются немедленно.
      </p>
      <PricingEditor initialSettings={settings} practitioners={practitioners} />
    </div>
  );
}
