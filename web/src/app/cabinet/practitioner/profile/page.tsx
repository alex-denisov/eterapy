export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PractitionerProfileEditor } from "./profile-editor";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { appUrl, loginUrl } from "@/lib/subdomain";

export default async function PractitionerProfilePage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    include: { user: { select: { name: true, email: true, avatarUrl: true, telegramId: true, telegramUsername: true } } },
  });

  if (!practitioner) redirect(appUrl(""));

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="soft-eyebrow">настройки практика</div>
      <h1 className="soft-h1 mt-2 mb-2">Настройки</h1>
      <p className="text-sm mb-6" style={{ color: "var(--soft-ink-soft)" }}>
        Профиль виден клиентам в каталоге; уведомления и Telegram — только для вас.
      </p>

      {/* M10: public profile */}
      <section className="mb-8">
        <h2 className="soft-h3 mb-3">Профиль</h2>
        <PractitionerProfileEditor
          initialData={{
            name: practitioner.user.name,
            email: practitioner.user.email,
            avatarUrl: practitioner.user.avatarUrl,
            title: practitioner.title,
            bio: practitioner.bio,
            experience: practitioner.experience,
            specialties: practitioner.specialties as string[],
            tags: practitioner.tags,
            languages: practitioner.languages,
          }}
          practitionerId={practitioner.id}
        />
      </section>

      {/* M10: notifications + Telegram linking (same component as the client cabinet) */}
      <section>
        <h2 className="soft-h3 mb-3">Уведомления</h2>
        <NotificationSettings
          telegramStatus={{
            linked: !!practitioner.user.telegramId,
            username: practitioner.user.telegramUsername ?? null,
          }}
          role="PRACTITIONER"
        />
      </section>
    </div>
  );
}
