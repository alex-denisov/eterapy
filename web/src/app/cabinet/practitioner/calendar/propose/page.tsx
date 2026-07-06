export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { ProposeForm } from "./propose-form";

// B480 — «Записать» (mockup -calendar-propose): практик предлагает СВОЕМУ
// клиенту время; клиент получает уведомление, подтверждает и оплачивает.
// Цена берётся из тарифной сетки (длительность → цена, не редактируется).

export default async function PractitionerProposePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const [clientRows, rates] = await Promise.all([
    db.booking.findMany({
      where: { practitionerId: practitioner.id },
      distinct: ["clientId"],
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { clientId: true, client: { select: { id: true, name: true, email: true } } },
    }),
    db.priceRate.findMany({
      where: { practitionerId: practitioner.id, enabled: true },
      orderBy: { durationMin: "asc" },
      select: { durationMin: true, priceRub: true },
    }),
  ]);

  const clients = clientRows.map((row) => ({
    id: row.client.id,
    label: row.client.name ?? row.client.email ?? "Клиент",
  }));
  const { client: preselectedClientId } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-propose-page">
      <Link href={appUrl("/practitioner/calendar")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Календарь
      </Link>
      <p className="soft-eyebrow mt-4">Записать клиента</p>
      <h1 className="soft-h1 mt-2">Предложить время</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
        Клиент получит уведомление, подтвердит время и оплатит сессию — запись создастся после оплаты.
      </p>

      {clients.length === 0 ? (
        <section className="soft-card mt-5 p-5">
          <p className="text-sm text-[var(--soft-ink-soft)]">
            Записать можно клиента, с которым уже была сессия. Пока таких нет — поделитесь личной ссылкой для записи
            из «Доступности».
          </p>
        </section>
      ) : rates.length === 0 ? (
        <section className="soft-card mt-5 p-5">
          <p className="text-sm text-[var(--soft-ink-soft)]">
            Включите хотя бы одну длительность сессии в «Календарь → Доступность», чтобы предложить время.
          </p>
        </section>
      ) : (
        <ProposeForm clients={clients} rates={rates} preselectedClientId={preselectedClientId ?? null} />
      )}
    </div>
  );
}
