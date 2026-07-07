export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, ChevronRight, ShieldAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { PractitionerProfileEditor } from "./profile-editor";

// B466 — «Профиль» (public; mockup -more-profile): то, что видят клиенты в
// каталоге (фото, имя, специализация, о себе, языки, опыт) + строка
// «Верификация» (owner review #2). Аккаунт-настройки живут отдельно —
// /practitioner/settings.

export default async function PractitionerProfilePage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    include: {
      user: { select: { name: true, email: true, avatarUrl: true } },
    },
  });
  if (!practitioner) redirect(appUrl(""));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-profile-page">
      <Link href={appUrl("/practitioner/more")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Ещё
      </Link>
      <p className="soft-eyebrow mt-4">профиль практика</p>
      <h1 className="soft-h1 mt-2">Профиль</h1>
      <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
        Эти данные видят клиенты в каталоге и на вашей странице.
      </p>

      {/* Верификация (owner #2) */}
      <Link
        href={appUrl("/practitioner/verification")}
        className="mt-5 flex items-center gap-3 rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3.5 py-3.5 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
        data-testid="practitioner-profile-verification-row"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
          style={practitioner.verified
            ? { background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }
            : { background: "var(--soft-amber-bg,#F2E2C2)", color: "var(--soft-amber-ink,#6E5114)" }}
        >
          {practitioner.verified ? <BadgeCheck className="h-[18px] w-[18px]" /> : <ShieldAlert className="h-[18px] w-[18px]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium">Верификация</span>
          <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">
            {practitioner.verified ? "подтверждена — бейдж виден клиентам" : "не пройдена — подтвердите личность и образование"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
      </Link>

      <div className="mt-5">
        <PractitionerProfileEditor
          initialData={{
            name: practitioner.user.name,
            email: practitioner.user.email,
            avatarUrl: practitioner.user.avatarUrl,
            title: practitioner.title,
            bio: practitioner.bio,
            experience: practitioner.experience,
            categories: practitioner.categories,
            directions: practitioner.directions,
            specialties: practitioner.specialties as string[],
            tags: practitioner.tags,
            languages: practitioner.languages,
          }}
          practitionerId={practitioner.id}
        />
      </div>
    </div>
  );
}
