export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import type { TaxStatusKey } from "@/lib/practitioner-tax-verification";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { TaxStatusForm } from "./tax-status-form";

// B466/B483 — «Налоговый статус»: статус + обязательный ИНН (12/10 цифр) →
// авто-проверка (ФНС) → явное «Это действительно Вы?» → только после этого
// статус сохраняется как подтверждённый. Полный ИНН показывается открыто.

export default async function TaxStatusPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { taxStatus: true, taxReviewStatus: true, taxStatusVerifiedAt: true, inn: true },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const verified = Boolean(practitioner.inn) && practitioner.taxReviewStatus === "VERIFIED" && practitioner.taxStatus !== "UNKNOWN";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-tax-status-page">
      <Link href={appUrl("/practitioner/finance?tab=requisites")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Реквизиты
      </Link>
      <p className="soft-eyebrow mt-4">Финансы практика</p>
      <h1 className="soft-h1 mt-2">Налоговый статус</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
        Подтвердите статус и ИНН — без этого добавление платёжного средства и выплаты недоступны.
      </p>

      <TaxStatusForm
        initialStatus={(practitioner.taxStatus === "UNKNOWN" ? "SELF_EMPLOYED" : practitioner.taxStatus) as TaxStatusKey}
        initialInn={practitioner.inn ?? ""}
        verified={verified}
        verifiedAtIso={practitioner.taxStatusVerifiedAt?.toISOString() ?? null}
      />
    </div>
  );
}
