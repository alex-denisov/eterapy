export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, ShieldCheck, Star, TrendingUp } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PRACTITIONER_VERIFICATION_PREFIX } from "@/lib/practitioner-verification";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { VerificationRequestCard } from "../verification-request-card";

// B466 — «Верификация» (Ещё → Профиль → Верификация). Request-based mechanic:
// the practitioner submits documents through VerificationRequestCard →
// PractitionerApplication with the VERIFICATION_REQUEST marker → admin
// approves → practitioner.verified + verifiedAt. Mockup: -more-verification.

export default async function PractitionerVerificationPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { verified: true, verifiedAt: true, user: { select: { email: true } } },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const verificationRequest = practitioner.verified
    ? null
    : await db.practitionerApplication.findFirst({
        where: {
          email: practitioner.user.email,
          why: { startsWith: PRACTITIONER_VERIFICATION_PREFIX },
          status: { in: ["PENDING", "REVIEWING"] },
        },
        select: { status: true },
        orderBy: { createdAt: "desc" },
      });

  const pendingStatus = verificationRequest?.status ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-verification-page">
      <Link href={appUrl("/practitioner/profile")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Профиль
      </Link>
      <p className="soft-eyebrow mt-4">Кабинет практика</p>
      <h1 className="soft-h1 mt-2">Верификация</h1>

      {/* Status */}
      <section className="soft-card mt-5 p-4 sm:p-5" data-testid="practitioner-verification-status">
        {practitioner.verified && practitioner.verifiedAt ? (
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--soft-sage, #E4EADF)", color: "var(--soft-sage-ink, #4B6146)" }}>
              <BadgeCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[15px] font-semibold">Подтверждено</p>
              <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
                Вы — проверенный специалист с{" "}
                {new Date(practitioner.verifiedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}.
                Бейдж виден клиентам в каталоге и профиле.
              </p>
            </div>
          </div>
        ) : pendingStatus ? (
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--soft-amber-bg, #F2E2C2)", color: "var(--soft-amber-ink, #6E5114)" }}>
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[15px] font-semibold">На проверке</p>
              <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
                Проверяем ваши документы — обычно 1–2 рабочих дня. После подтверждения появится бейдж «проверенный специалист».
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[15px] font-semibold">Не пройдена</p>
              <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
                Подтвердите личность и образование, чтобы получить бейдж «проверенный специалист» и открыть запись для клиентов платформы.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Documents / request */}
      {!practitioner.verified && (
        <section className="soft-card mt-4 p-4 sm:p-5" data-testid="practitioner-verification-documents">
          <p className="soft-eyebrow">Документы</p>
          <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
            Приложите паспорт (личность), диплом об образовании и профильные сертификаты — сертификаты необязательны, но повышают доверие.
          </p>
          <VerificationRequestCard pendingStatus={pendingStatus} />
        </section>
      )}

      {/* What it gives */}
      <section className="soft-card mt-4 p-4 sm:p-5">
        <p className="soft-eyebrow">Что даёт верификация</p>
        <ul className="mt-3 flex flex-col gap-2.5 text-sm text-[var(--soft-ink-soft)]">
          <li className="flex items-center gap-2.5">
            <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--soft-sage-ink,#4B6146)]" />
            Бейдж «проверенный специалист» в профиле
          </li>
          <li className="flex items-center gap-2.5">
            <TrendingUp className="h-4 w-4 shrink-0 text-[var(--soft-terracotta-dark)]" />
            Выше в каталоге при подборе клиентов
          </li>
          <li className="flex items-center gap-2.5">
            <Star className="h-4 w-4 shrink-0 text-[var(--soft-amber-ink,#6E5114)]" />
            Больше доверия и записей от клиентов
          </li>
        </ul>
      </section>
    </div>
  );
}
