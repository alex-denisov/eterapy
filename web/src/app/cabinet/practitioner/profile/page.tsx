export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, ChevronRight, Compass, ShieldAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { categoryLabel } from "@/lib/practitioner-taxonomy";
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

  const editorInitialData = {
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
    formats: practitioner.formats,
    languages: practitioner.languages,
  };

  // «Статус и проверки» → «Услуги и направления» подпись: категория · N направлений.
  const dirCount = practitioner.directions.length;
  const dirWord = dirCount === 1 ? "направление" : dirCount > 1 && dirCount < 5 ? "направления" : "направлений";
  const servicesSummary = [
    practitioner.categories[0] ? categoryLabel(practitioner.categories[0]) : null,
    `${dirCount} ${dirWord}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 mockup practitioner-more-profile (own topbar со «Сохранить») */}
      <PractitionerProfileEditor
        variant="pcab"
        verified={practitioner.verified}
        backHref={appUrl("/practitioner/more")}
        verificationHref={appUrl("/practitioner/verification")}
        initialData={editorInitialData}
        practitionerId={practitioner.id}
      />

      {/* ДЕСКТОП — -profile-v2: 2-колоночная раскладка (редактор + «Статус и проверки») */}
      <div
        className="mx-auto hidden w-full max-w-4xl px-4 py-8 sm:px-6 md:block"
        style={{ paddingBottom: 80 }}
        data-testid="practitioner-profile-page"
      >
        <p className="soft-eyebrow">Профиль практика</p>
        <h1 className="soft-h1 mt-2">Профиль</h1>
        <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
          Эти данные видят клиенты в каталоге и на вашей странице.
        </p>

        <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* Редактор профиля */}
          <PractitionerProfileEditor
            initialData={editorInitialData}
            practitionerId={practitioner.id}
            verified={practitioner.verified}
          />

          {/* Статус и проверки */}
          <aside className="soft-card h-fit p-5" data-testid="practitioner-profile-status">
            <p className="soft-eyebrow mb-3.5">Статус и проверки</p>
            <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[14px] border border-[var(--soft-paper-edge)]">
              <Link
                href={appUrl("/practitioner/verification")}
                className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
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
                    {practitioner.verified ? "диплом и документы подтверждены" : "не пройдена — подтвердите личность и образование"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
              </Link>
              <Link
                href={appUrl("/practitioner/services")}
                className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
                data-testid="practitioner-profile-services-row"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
                  <Compass className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">Услуги и направления</span>
                  <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">
                    {servicesSummary || "настроить в «Услугах»"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
              </Link>
            </div>
            <p className="mt-3.5 text-[11.5px] leading-relaxed text-[var(--soft-ink-faint)]">
              Так карточка выглядит в каталоге: фото, специализация, рейтинг, форматы. Клиенты выбирают
              вас именно по ней.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
